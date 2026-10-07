CREATE TABLE public.file_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_number TEXT NOT NULL CHECK (char_length(officer_number) BETWEEN 1 AND 50),
  file_number TEXT NOT NULL CHECK (char_length(file_number) BETWEEN 1 AND 80),
  record_year INTEGER NOT NULL CHECK (record_year BETWEEN 1900 AND 2200),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  cabinet_number TEXT NOT NULL CHECK (char_length(cabinet_number) BETWEEN 1 AND 50),
  shelf_number TEXT NOT NULL CHECK (char_length(shelf_number) BETWEEN 1 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_records TO authenticated;
GRANT ALL ON public.file_records TO service_role;

ALTER TABLE public.file_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view file records"
ON public.file_records FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public can add file records"
ON public.file_records FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Public can update file records"
ON public.file_records FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can delete file records"
ON public.file_records FOR DELETE
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.set_file_records_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_file_records_updated_at
BEFORE UPDATE ON public.file_records
FOR EACH ROW EXECUTE FUNCTION public.set_file_records_updated_at();