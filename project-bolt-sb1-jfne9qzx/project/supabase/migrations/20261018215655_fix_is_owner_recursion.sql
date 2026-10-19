-- Fix infinite recursion in is_owner() function.
-- The old version queried public.profiles, which has RLS policies that
-- call is_owner(), creating infinite recursion.
-- SECURITY DEFINER bypasses RLS, but the function was still recursing
-- because the policy on profiles_select calls is_owner() which selects
-- from profiles again. Using SECURITY DEFINER with a role that bypasses
-- RLS should work, but to be safe we set a search_path and ensure
-- the function runs as owner.

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
