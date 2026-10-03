ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS interests text[],
ADD COLUMN IF NOT EXISTS education text,
ADD COLUMN IF NOT EXISTS hints text[];
