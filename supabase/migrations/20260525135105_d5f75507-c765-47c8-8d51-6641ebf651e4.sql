-- 1) Add column to reference vault secret id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pdf_password_secret_id uuid;

-- 2) Migrate any existing plaintext passwords into vault, then drop plaintext column
DO $$
DECLARE
  r RECORD;
  sid uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'pdf_password'
  ) THEN
    FOR r IN EXECUTE 'SELECT id, pdf_password FROM public.profiles WHERE pdf_password IS NOT NULL AND pdf_password <> '''''
    LOOP
      sid := vault.create_secret(r.pdf_password, 'pdf_password_' || r.id::text);
      UPDATE public.profiles SET pdf_password_secret_id = sid WHERE id = r.id;
    END LOOP;
    EXECUTE 'ALTER TABLE public.profiles DROP COLUMN pdf_password';
  END IF;
END $$;

-- 3) Secure RPCs to set/get the current user's PDF password
CREATE OR REPLACE FUNCTION public.set_pdf_password(p text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_sid uuid;
  new_sid uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT pdf_password_secret_id INTO existing_sid FROM public.profiles WHERE id = uid;

  IF p IS NULL OR length(trim(p)) = 0 THEN
    IF existing_sid IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = existing_sid;
    END IF;
    UPDATE public.profiles SET pdf_password_secret_id = NULL WHERE id = uid;
    RETURN;
  END IF;

  IF existing_sid IS NULL THEN
    new_sid := vault.create_secret(p, 'pdf_password_' || uid::text);
    UPDATE public.profiles SET pdf_password_secret_id = new_sid WHERE id = uid;
  ELSE
    PERFORM vault.update_secret(existing_sid, p);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pdf_password()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  uid uuid := auth.uid();
  sid uuid;
  pwd text;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT pdf_password_secret_id INTO sid FROM public.profiles WHERE id = uid;
  IF sid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO pwd FROM vault.decrypted_secrets WHERE id = sid;
  RETURN pwd;
END;
$$;

REVOKE ALL ON FUNCTION public.set_pdf_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pdf_password() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_pdf_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pdf_password() TO authenticated;

-- 4) Add boolean helper view-ish column? Not needed; client can call get_pdf_password if it needs to show whether set.

-- 5) Tighten storage policies on the `documents` bucket: scope to authenticated role.
DROP POLICY IF EXISTS "documents_select_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_own" ON storage.objects;

CREATE POLICY "documents_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "documents_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "documents_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
