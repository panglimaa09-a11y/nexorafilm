import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const slug = process.env.PAKASIR_PROJECT_SLUG;
  const apiKey = process.env.PAKASIR_API_KEY;

  if (!slug || !apiKey) {
    return NextResponse.json(
      { error: 'not configured' },
      { status: 500 }
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON' },
      { status: 400 }
    );
  }

  const orderId =
    typeof body?.order_id === 'string'
      ? body.order_id.trim()
      : '';

  const amount = Number(body?.amount);

  if (
    !orderId ||
    !Number.isSafeInteger(amount) ||
    body?.project !== slug
  ) {
    return NextResponse.json(
      { error: 'invalid notification' },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  const { data: payment, error: lookupError } = await db
    .from('payments')
    .select('id,amount,status,provider,provider_order_id')
    .eq('provider_order_id', orderId)
    .eq('provider', 'pakasir')
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: 'payment lookup failed' },
      { status: 500 }
    );
  }

  if (!payment) {
    return NextResponse.json(
      { error: 'payment not found' },
      { status: 404 }
    );
  }

  if (Number(payment.amount) !== amount) {
    return NextResponse.json(
      { error: 'amount mismatch' },
      { status: 400 }
    );
  }

  // PERHATIAN:
  // Endpoint detail ini masih API v1.
  // Verifikasi endpoint status yang didukung Pakasir sebelum produksi.
  const detailUrl = new URL(
    'https://app.pakasir.com/api/transactiondetail'
  );

  detailUrl.searchParams.set('project', slug);
  detailUrl.searchParams.set('amount', String(payment.amount));
  detailUrl.searchParams.set('order_id', orderId);
  detailUrl.searchParams.set('api_key', apiKey);

  let detailResponse: Response;
  let detail: any;

  try {
    detailResponse = await fetch(detailUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    detail = await detailResponse.json();
  } catch (error) {
    console.error('Pakasir verification unavailable:', error);

    return NextResponse.json(
      { error: 'verification unavailable' },
      { status: 502 }
    );
  }

  const txn = detail?.transaction;

  if (
    !detailResponse.ok ||
    !txn ||
    txn.project !== slug ||
    String(txn.order_id) !== orderId ||
    Number(txn.amount) !== Number(payment.amount)
  ) {
    return NextResponse.json(
      { error: 'transaction verification failed' },
      { status: 400 }
    );
  }

  const statusMap: Record<string, string> = {
    completed: 'paid',
    pending: 'pending',
    expired: 'expired',
    cancelled: 'cancelled',
    failed: 'failed',
  };

  const nextStatus =
    statusMap[String(txn.status || '').toLowerCase()];

  if (!nextStatus) {
    return NextResponse.json(
      { error: 'unsupported transaction status' },
      { status: 400 }
    );
  }

  // Jangan menurunkan status pembayaran yang sudah paid.
  if (payment.status !== 'paid' || nextStatus === 'paid') {
    const { error: updateError } = await db
      .from('payments')
      .update({
        status: nextStatus,
        raw_response: {
          pakasir_webhook: body,
          pakasir_verified_transaction: txn,
        },
      })
      .eq('id', payment.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'payment update failed' },
        { status: 500 }
      );
    }
  }

  if (nextStatus === 'paid') {
    const { error: activationError } = await db.rpc(
      'activate_pakasir_subscription',
      { p_payment_id: payment.id }
    );

    if (activationError) {
      console.error(
        'Pakasir subscription activation failed:',
        activationError.message
      );

      return NextResponse.json(
        { error: 'subscription activation failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
