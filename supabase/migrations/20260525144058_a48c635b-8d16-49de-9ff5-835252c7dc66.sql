REVOKE EXECUTE ON FUNCTION public.set_pdf_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pdf_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pdf_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pdf_password() TO authenticated;