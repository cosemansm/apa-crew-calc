-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  default_engine text NOT NULL DEFAULT 'apa-uk',
  signup_country text,
  multi_engine_enabled boolean NOT NULL DEFAULT false,
  authorized_engines text[] NOT NULL DEFAULT ARRAY['apa-uk']
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies for profiles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END
$$;

-- Add engine tracking columns to profiles table (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='default_engine') THEN
    ALTER TABLE public.profiles ADD COLUMN default_engine text NOT NULL DEFAULT 'apa-uk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='signup_country') THEN
    ALTER TABLE public.profiles ADD COLUMN signup_country text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='multi_engine_enabled') THEN
    ALTER TABLE public.profiles ADD COLUMN multi_engine_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='authorized_engines') THEN
    ALTER TABLE public.profiles ADD COLUMN authorized_engines text[] NOT NULL DEFAULT ARRAY['apa-uk'];
  END IF;
END
$$;

-- Create projects table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  client_name text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  calc_engine text NOT NULL DEFAULT 'apa-uk'
);

-- Enable Row Level Security for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policies for projects if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Users can manage own projects'
  ) THEN
    CREATE POLICY "Users can manage own projects" ON public.projects
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Add calc_engine to projects table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='calc_engine') THEN
    ALTER TABLE public.projects ADD COLUMN calc_engine text NOT NULL DEFAULT 'apa-uk';
  END IF;
END
$$;

-- Create calculations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.calculations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  project_name text NOT NULL DEFAULT 'Untitled',
  role_name text NOT NULL,
  department text,
  agreed_rate integer NOT NULL,
  day_type text NOT NULL,
  day_of_week text NOT NULL,
  call_time text NOT NULL,
  wrap_time text NOT NULL,
  result_json jsonb,
  grand_total numeric(10,2) NOT NULL DEFAULT 0,
  calc_engine text NOT NULL DEFAULT 'apa-uk'
);

-- Enable Row Level Security for calculations
ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;

-- Create policies for calculations if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calculations' AND policyname = 'Users can view own calculations'
  ) THEN
    CREATE POLICY "Users can view own calculations"
      ON public.calculations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calculations' AND policyname = 'Users can insert own calculations'
  ) THEN
    CREATE POLICY "Users can insert own calculations"
      ON public.calculations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calculations' AND policyname = 'Users can update own calculations'
  ) THEN
    CREATE POLICY "Users can update own calculations"
      ON public.calculations FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calculations' AND policyname = 'Users can delete own calculations'
  ) THEN
    CREATE POLICY "Users can delete own calculations"
      ON public.calculations FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Add calc_engine to calculations table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calculations' AND column_name='calc_engine') THEN
    ALTER TABLE public.calculations ADD COLUMN calc_engine text NOT NULL DEFAULT 'apa-uk';
  END IF;
END
$$;

-- Grant SELECT/UPDATE on new profile columns to authenticated users
-- (RLS policies on profiles should already cover this, but be explicit)
GRANT SELECT, UPDATE (default_engine, signup_country, multi_engine_enabled, authorized_engines)
  ON public.profiles TO authenticated;
