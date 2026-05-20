-- Enable RLS on all public tables to prevent PostgREST exposure.
-- The app accesses these tables exclusively via a direct postgres connection
-- (DATABASE_URL in lib/db.ts), which runs as the superuser role and bypasses
-- RLS, so this change has no effect on application behavior.
--
-- share_log: server-only rate-limit table; no client should ever read or write it.
ALTER TABLE public.share_log ENABLE ROW LEVEL SECURITY;

-- users: managed by NextAuth via direct PG; block all PostgREST access.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- user_items: managed by NextAuth session + direct PG; block all PostgREST access.
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
