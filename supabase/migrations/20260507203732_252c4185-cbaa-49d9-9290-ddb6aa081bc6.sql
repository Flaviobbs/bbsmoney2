-- Enums
DO $$ BEGIN
  CREATE TYPE public.transaction_source AS ENUM ('manual','pdf','whatsapp_simulado','ia');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_status AS ENUM ('uploaded','processing','processed','failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Transactions: novos campos
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source public.transaction_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS document_id uuid;

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  status public.document_status NOT NULL DEFAULT 'uploaded',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_all_own ON public.documents;
CREATE POLICY documents_all_own ON public.documents FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Document extractions
CREATE TABLE IF NOT EXISTS public.document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  raw_text text,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_extractions_all_own ON public.document_extractions;
CREATE POLICY document_extractions_all_own ON public.document_extractions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ingestion logs
CREATE TABLE IF NOT EXISTS public.ingestion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  input_payload jsonb,
  output_payload jsonb,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ingestion_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingestion_logs_all_own ON public.ingestion_logs;
CREATE POLICY ingestion_logs_all_own ON public.ingestion_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_select_own" ON storage.objects;
CREATE POLICY "documents_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "documents_insert_own" ON storage.objects;
CREATE POLICY "documents_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "documents_delete_own" ON storage.objects;
CREATE POLICY "documents_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);