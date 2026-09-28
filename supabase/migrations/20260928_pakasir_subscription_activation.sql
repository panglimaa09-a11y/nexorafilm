CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_pakasir_order_unique
  ON public.subscriptions (provider_subscription_id)
  WHERE provider = 'pakasir'
    AND provider_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_pakasir_subscription(
  p_payment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT *
    INTO v_payment
    FROM public.payments
   WHERE id = p_payment_id
     AND provider = 'pakasir'
     AND status = 'paid'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified Pakasir payment not found or not paid';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.subscriptions
     WHERE provider = 'pakasir'
       AND provider_subscription_id = v_payment.provider_order_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.subscriptions
     SET status = 'expired'
   WHERE user_id = v_payment.user_id
     AND status = 'active';

  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    provider,
    provider_subscription_id
  )
  VALUES (
    v_payment.user_id,
    v_payment.plan_id,
    'active',
    v_now,
    v_now + interval '1 month',
    'pakasir',
    v_payment.provider_order_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION
  public.activate_pakasir_subscription(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.activate_pakasir_subscription(uuid) FROM anon;

REVOKE ALL ON FUNCTION
  public.activate_pakasir_subscription(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION
  public.activate_pakasir_subscription(uuid) TO service_role;
