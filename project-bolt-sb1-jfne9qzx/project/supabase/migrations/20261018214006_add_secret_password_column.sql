-- Add secret_password column to manager_codes
-- This stores a random password used to sign in the manager from the server.
-- The manager never sees this password — they only use their code.
alter table public.manager_codes add column if not exists secret_password text not null default '';
