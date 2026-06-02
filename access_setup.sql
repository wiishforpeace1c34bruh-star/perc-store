-- 1. Add the has_access column (defaults to false for all new users)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT FALSE;

-- 2. Grant full access to the owner account
UPDATE public.profiles
SET has_access = TRUE
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'wiishforpeace1c34bruh@gmail.com'
);
