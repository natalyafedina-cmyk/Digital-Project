-- Trigger functions are invoked by Postgres, not the Data API.
-- They must not be callable directly by anon or authenticated clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
