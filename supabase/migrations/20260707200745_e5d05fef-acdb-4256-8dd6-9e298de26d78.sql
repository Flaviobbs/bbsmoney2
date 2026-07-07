ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS purchase_type text
    DEFAULT 'cash';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_purchase_type_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_purchase_type_check
      CHECK (purchase_type IN ('cash','installment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_card_last4_idx
  ON public.transactions (user_id, card_last4);