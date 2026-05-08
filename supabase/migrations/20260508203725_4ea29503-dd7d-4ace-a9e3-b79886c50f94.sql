
-- Storage: add UPDATE policy for documents bucket scoped to owner folder
CREATE POLICY "Users can update their own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Restrict table policies to authenticated role only
DROP POLICY IF EXISTS accounts_all_own ON public.accounts;
CREATE POLICY accounts_all_own ON public.accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_insights_all_own ON public.ai_insights;
CREATE POLICY ai_insights_all_own ON public.ai_insights
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS bills_all_own ON public.bills;
CREATE POLICY bills_all_own ON public.bills
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS budgets_all_own ON public.budgets;
CREATE POLICY budgets_all_own ON public.budgets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS categories_all_own ON public.categories;
CREATE POLICY categories_all_own ON public.categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS document_extractions_all_own ON public.document_extractions;
CREATE POLICY document_extractions_all_own ON public.document_extractions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS documents_all_own ON public.documents;
CREATE POLICY documents_all_own ON public.documents
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS goals_all_own ON public.goals;
CREATE POLICY goals_all_own ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ingestion_logs_all_own ON public.ingestion_logs;
CREATE POLICY ingestion_logs_all_own ON public.ingestion_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_all_own ON public.transactions;
CREATE POLICY transactions_all_own ON public.transactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);
