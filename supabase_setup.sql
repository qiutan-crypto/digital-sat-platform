-- Create the student_results table to track test scores
CREATE TABLE IF NOT EXISTS public.student_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_name TEXT NOT NULL,
    test_id TEXT NOT NULL,
    total_score INTEGER NOT NULL,
    rw_score INTEGER NOT NULL,
    math_score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    raw_details JSONB
);

-- Enable Row Level Security
ALTER TABLE public.student_results ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to INSERT new scores
CREATE POLICY "Allow anonymous insert to student_results" 
    ON public.student_results 
    FOR INSERT 
    TO anon 
    WITH CHECK (true);

-- Allow anonymous users to read students' scores (required for Teacher Dashboard)
CREATE POLICY "Allow anonymous read on student_results" 
    ON public.student_results 
    FOR SELECT 
    TO anon 
    USING (true);
