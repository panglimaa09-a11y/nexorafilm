import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type PakasirWebhook = {
  txn_id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  project?: unknown;
  is_sandbox?: unknown;
  status?: unknown;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  const slug = process.env.PAKASIR_PROJECT_SLUG?.trim();
  const apiKey = process.env.PAKASIR_API_KEY?.trim();

  if (!slug || !apiKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  let body: PakasirWebhook;
  try {
    body = (await request.json()) as PakasirWebhook;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const orderId =
    typeof body?.order_id === 'string' ? body.order_id.trim() : '';
  const txnId = typeof body?.txn_id === 'string' ? body.txn_id.trim() : '';
  const amount = Number(body?.amount);

  // Pakasir v2 webhook payloads do not necessarily include a "project" field.
  // Validate it when present, but do not require it.
  const projectMismatch =
    typeof body?.project === 'string' && body.project.trim() !== slug;

  if (
    !orderId ||
    !txnId ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    projectMismatch
  ) {
    return NextResponse.json({ error: 'invalid notification' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: payment, error: lookupError } = await db
    .from('payments')
    .select('id,amount,status,provider,provider_order_id,raw_response')
    .eq('provider_order_id', orderId)
    .eq('provider', 'pakasir')
    .maybeSingle();

  if (lookupError) {
    console.error('Pakasir payment lookup failed:', lookupError.message);
    return NextResponse.json({ error: 'payment lookup failed' }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: 'payment not found' }, { status: 404 });
  }
  if (Number(payment.amount) !== amount) {
    return NextResponse.json({ error: 'amount mismatch' }, { status: 400 });
  }

  // Compare the notification's transaction ID with the ID saved at checkout.
  const previousRaw =
    payment.raw_response && typeof payment.raw_response === 'object'
      ? (payment.raw_response as Record<string, any>)
      : {};
  const createResponse = previousRaw.pakasir;
  const savedTxnId =
    typeof createResponse?.txn_id === 'string'
      ? createResponse.txn_id.trim()
      : '';

  if (!savedTxnId) {
    console.error('Pakasir txn_id missing for order:', orderId);
    return NextResponse.json(
      { error: 'transaction ID unavailable; create a new transaction' },
      { status: 409 }
    );
  }

  if (savedTxnId !== txnId) {
    return NextResponse.json({ error: 'transaction ID mismatch' }, { status: 400 });
  }

  // Sandbox callbacks are acknowledged for testing, but can never mark a
  // payment paid or activate a production subscription.
  if (body.is_sandbox === true) {
    const { error: saveError } = await db
      .from('payments')
      .update({
        raw_response: {
          ...previousRaw,
          pakasir_webhook: body,
          pakasir_sandbox_test: {
            received: true,
            status: typeof body.status === 'string' ? body.status : 'unknown',
          },
        },
      })
      .eq('id', payment.id);

    if (saveError) {
      console.error('Pakasir sandbox webhook save failed:', saveError.message);
      return NextResponse.json({ error: 'sandbox webhook save failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sandbox: true,
      subscription_activated: false,
    });
  }

  // Production callbacks must explicitly identify themselves as non-sandbox.
  if (body.is_sandbox !== false) {
    return NextResponse.json(
      { error: 'missing or invalid sandbox flag; payment not activated' },
      { status: 400 }
    );
  }

  let verified: any;
  try {
    const statusUrl =
      'https://app.pakasir.com/api/v2/transaction-status/' +
      encodeURIComponent(slug) +
      '/' +
      encodeURIComponent(txnId);

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Pakasir rate limit; retry after at least 4 seconds' },
        { status: 503, headers: { 'Retry-After': '4' } }
      );
    }
    if (!response.ok) {
      console.error('Pakasir status endpoint returned HTTP', response.status);
      return NextResponse.json(
        { error: 'payment verification unavailable' },
        { status: 502 }
      );
    }
    verified = await response.json();
  } catch (error) {
    console.error('Pakasir v2 status verification failed:', error);
    return NextResponse.json(
      { error: 'payment verification unavailable' },
      { status: 502 }
    );
  }

  if (
    String(verified?.txn_id ?? '') !== txnId ||
    String(verified?.order_id ?? '') !== orderId ||
    Number(verified?.amount) !== Number(payment.amount)
  ) {
    return NextResponse.json(
      { error: 'verified transaction mismatch' },
      { status: 400 }
    );
  }

  if (verified?.is_sandbox !== false) {
    return NextResponse.json(
      { error: 'only a verified non-sandbox transaction can activate a subscription' },
      { status: 400 }
    );
  }

  const statusMap: Record<string, string> = {
    completed: 'paid',
    pending: 'pending',
    canceled: 'cancelled',
    cancelled: 'cancelled',
  };
  const nextStatus = statusMap[String(verified?.status ?? '').toLowerCase()];

  if (!nextStatus) {
    return NextResponse.json(
      { error: 'unsupported transaction status' },
      { status: 400 }
    );
  }

  // Never downgrade a payment already marked paid.
  if (payment.status !== 'paid') {
    const { error: updateError } = await db
      .from('payments')
      .update({
        status: nextStatus,
        raw_response: {
          ...previousRaw,
          pakasir_webhook: body,
          pakasir_verified_transaction: verified,
        },
      })
      .eq('id', payment.id)
      .neq('status', 'paid')
      .select('id');

    if (updateError) {
      console.error('Pakasir payment update failed:', updateError.message);
      return NextResponse.json({ error: 'payment update failed' }, { status: 500 });
    }
  }

  if (nextStatus === 'paid') {
    const { error: activationError } = await db.rpc(
      'activate_pakasir_subscription',
      { p_payment_id: payment.id }
    );

    if (activationError) {
      console.error('Pakasir subscription activation failed:', activationError.message);
      return NextResponse.json(
        { error: 'subscription activation failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
