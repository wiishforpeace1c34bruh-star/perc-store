-- 1. Create Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Turn on Row Level Security for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow public read access to profiles
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

-- 2. Trigger to automatically create a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, is_admin)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    -- Make the perc.store account admin automatically (Update this email if you used a different one!)
    CASE WHEN new.email = 'wiishforpeace1c34bruh@gmail.com' THEN true ELSE false END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Create Messages Table for the Chatroom
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Turn on RLS for messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read messages
CREATE POLICY "Messages are viewable by everyone."
  ON public.messages FOR SELECT
  USING ( true );

-- Allow authenticated users to insert messages
CREATE POLICY "Authenticated users can insert messages."
  ON public.messages FOR INSERT
  WITH CHECK ( auth.uid() = profile_id );

-- Enable Realtime for the messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
