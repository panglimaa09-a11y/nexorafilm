import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', request.url), 303);
    }

    const form = await request.formData();
    const planId = String(form.get('plan_id') || '').trim();

    const { data: plan } = await db
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('active', true)
      .maybeSingle();

    if (!plan) {
      return NextResponse.redirect(new URL('/plans?error=plan', request.url), 303);
    }

    const slug = process.env.PAKASIR_PROJECT_SLUG;
    const apiKey = process.env.PAKASIR_API_KEY;
    const method = (process.env.PAKASIR_PAYMENT_METHOD || 'payment_link').trim();

    const methods = [
      'payment_link',
      'qris',
      'bri_va',
      'bni_va',
      'cimb_niaga_va',
      'permata_va',
      'maybank_va',
      'bnc_va',
      'artha_graha_va',
      'sampoerna_va',
    ];

    if (!slug || !apiKey || !methods.includes(method)) {
      return NextResponse.redirect(
        new URL('/checkout?error=payment_not_configured', request.url), 303
      );
    }

    const amount = Number(plan.price_monthly);

    if (!Number.isSafeInteger(amount) || amount < 500 || amount > 50000000) {
      return NextResponse.redirect(
        new URL('/checkout?error=invalid_plan_amount', request.url), 303
      );
    }

    const orderId = `NEXORA-${user.id.slice(0, 8)}-${Date.now()}`;

    const { data: payment, error: insertError } = await db
      .from('payments')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        amount,
        status: 'pending',
        provider: 'pakasir',
        provider_order_id: orderId,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      console.error('Pakasir payment insert failed:', insertError?.message);
      return NextResponse.redirect(
        new URL('/checkout?error=payment_create', request.url), 303
      );
    }

    let response: Response;
    let payload: any;

    try {
      response = await fetch(
        `https://app.pakasir.com/api/v2/create-transaction/${encodeURIComponent(slug)}/${encodeURIComponent(orderId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify({ method, amount }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        }
      );

      payload = await response.json();
    } catch (error) {
      await db
        .from('payments')
        .update({
          status: 'failed',
          raw_response: { error: 'pakasir_request_failed' },
        })
        .eq('id', payment.id);

      console.error('Pakasir request failed:', error);

      return NextResponse.redirect(
        new URL('/checkout?error=payment_gateway', request.url), 303
      );
    }

    let paymentLink: URL | null = null;

    try {
      paymentLink = new URL(String(payload?.payment_link || ''));
    } catch {
      paymentLink = null;
    }

    const txnId =
      typeof payload?.txn_id === 'string' ? payload.txn_id.trim() : '';

    if (
      !response.ok ||
      !txnId ||
      !paymentLink ||
      paymentLink.protocol !== 'https:' ||
      paymentLink.hostname !== 'app.pakasir.com'
    ) {
      await db
        .from('payments')
        .update({
          status: 'failed',
          raw_response: {
            pakasir: payload,
            http_status: response.status,
          },
        })
        .eq('id', payment.id);

      return NextResponse.redirect(
        new URL('/checkout?error=payment_gateway', request.url), 303
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : new URL(request.url).origin;

    paymentLink.searchParams.set(
      'redirect',
      `${origin}/profile?payment=pending`
    );

    const { error: saveError } = await db
      .from('payments')
      .update({ raw_response: { pakasir: payload } })
      .eq('id', payment.id);

    if (saveError) {
      console.error('Pakasir response save failed:', saveError.message);

      return NextResponse.redirect(
        new URL('/checkout?error=payment_record', request.url), 303
      );
    }

    return NextResponse.redirect(paymentLink.toString(), 303);
  } catch (error) {
    console.error('Checkout error:', error);

    return NextResponse.redirect(
      new URL('/checkout?error=unexpected', request.url), 303
    );
  }
}

export async function GET() {
  return NextResponse.json({
    provider: 'pakasir',
    configured: Boolean(
      process.env.PAKASIR_PROJECT_SLUG &&
      process.env.PAKASIR_API_KEY
    ),
    apiVersion: 2,
  });
}
