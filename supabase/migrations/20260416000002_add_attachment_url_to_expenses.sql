-- Add attachment_url column to expense_requests table
ALTER TABLE IF EXISTS public.expense_requests 
ADD COLUMN IF NOT EXISTS attachment_url text;

-- Add comment to the column
COMMENT ON COLUMN public.expense_requests.attachment_url IS '영수증 또는 증빙 서류 파일의 저장소 URL';
