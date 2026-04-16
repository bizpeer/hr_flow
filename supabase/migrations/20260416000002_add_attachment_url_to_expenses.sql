-- Add missing columns to expense_requests table
DO $$ 
BEGIN 
    -- details 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='details') THEN
        ALTER TABLE public.expense_requests ADD COLUMN details text;
    END IF;

    -- attachment_url 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='attachment_url') THEN
        ALTER TABLE public.expense_requests ADD COLUMN attachment_url text;
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.expense_requests.details IS '지출 상세 내용';
COMMENT ON COLUMN public.expense_requests.attachment_url IS '영수증 또는 증빙 서류 파일의 저장소 URL';
