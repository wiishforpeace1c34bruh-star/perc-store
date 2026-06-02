-- Run this in your Supabase SQL Editor to instantly fix your profile and grant yourself Admin rights!
INSERT INTO public.profiles (id, username, is_admin)
SELECT id, email, true 
FROM auth.users 
WHERE email = 'wiishforpeace1c34bruh@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET is_admin = true;
