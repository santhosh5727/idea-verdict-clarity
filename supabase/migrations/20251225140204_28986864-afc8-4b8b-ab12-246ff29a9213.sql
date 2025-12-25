-- Add inferred_category column to store AI-detected idea category
ALTER TABLE public.evaluations 
ADD COLUMN inferred_category text;