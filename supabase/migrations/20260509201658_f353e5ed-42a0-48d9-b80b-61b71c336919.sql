ALTER TABLE public.categories ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);