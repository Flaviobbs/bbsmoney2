
-- Remove duplicate transactions (keep oldest by created_at)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, date, amount, description
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.transactions
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Prevent future duplicates at database level
CREATE UNIQUE INDEX IF NOT EXISTS transactions_dedup_idx
  ON public.transactions (user_id, date, amount, description);
