-- Add project_name column to evaluations table
ALTER TABLE public.evaluations
ADD COLUMN project_name text;

-- Add workflow column for storing workflow field
ALTER TABLE public.evaluations
ADD COLUMN workflow text;