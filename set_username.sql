-- Run this in your Supabase SQL Editor to force your username to perc.store
UPDATE public.profiles
SET username = 'perc.store'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'wiishforpeace1c34bruh@gmail.com'
);
