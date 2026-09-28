import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const slug = process.env.PAKASIR_PROJECT_SLUG?.trim();
  const apiKey = process.env.PAKASIR_API_KEY?.trim();

  if (!slug || !apiKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const orderId =
    typeof body?.order_id === 'string' ? body.order_id.trim() : '';
  const amount = Number(body?.amount);

  if (
    !orderId ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    body?.project !== slug
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

  // Pakasir v2 create-transaction response must have been saved at checkout.
  const previousRaw =
    payment.raw_response && typeof payment.raw_response === 'object'
      ? payment.raw_response as Record<string, any>
      : {};
  const createResponse = previousRaw.pakasir;
  const txnId =
    typeof createResponse?.txn_id === 'string' ? createResponse.txn_id.trim() : '';

  if (!txnId) {
    console.error('Pakasir txn_id missing for order:', orderId);
    return NextResponse.json(
      { error: 'transaction ID unavailable; create a new transaction' },
      { status: 409 }
    );
  }

  let verified: any;
  try {
    const statusUrl =
      'https://app.pakasir.com/api/v2/transaction-status/' +
      encodeURIComponent(slug) + '/' + encodeURIComponent(txnId);

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

  // Do not allow sandbox transactions to activate production subscriptions.
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
  };
  const nextStatus = statusMap[String(verified?.status ?? '').toLowerCase()];

  if (!nextStatus) {
    return NextResponse.json(
      { error: 'unsupported transaction status' },
      { status: 400 }
    );
  }

  // Preserve txn_id from the create-transaction response for later callbacks.
  // Never downgrade a payment already marked paid.
  if (payment.status !== 'paid' || nextStatus === 'paid') {
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
