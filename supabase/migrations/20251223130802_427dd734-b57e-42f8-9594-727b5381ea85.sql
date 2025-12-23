-- Create evaluations table
CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_problem TEXT NOT NULL,
  solution TEXT,
  target_user TEXT NOT NULL,
  differentiation TEXT,
  project_type TEXT NOT NULL,
  verdict_type TEXT NOT NULL,
  full_verdict_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Users can only view their own evaluations
CREATE POLICY "Users can view their own evaluations"
ON public.evaluations
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own evaluations
CREATE POLICY "Users can insert their own evaluations"
ON public.evaluations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster user queries
CREATE INDEX idx_evaluations_user_id ON public.evaluations(user_id);
CREATE INDEX idx_evaluations_created_at ON public.evaluations(created_at DESC);