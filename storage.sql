-- Create the storage bucket for profiles
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profiles', 'profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to all files in the bucket
CREATE POLICY "Public profiles are viewable by everyone."
ON storage.objects FOR SELECT
USING ( bucket_id = 'profiles' );

-- Allow authenticated users to upload files to the bucket
CREATE POLICY "Users can upload their own profile images."
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profiles' AND auth.uid() = owner
);

-- Allow users to update their own files
CREATE POLICY "Users can update their own profile images."
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profiles' AND auth.uid() = owner
);
