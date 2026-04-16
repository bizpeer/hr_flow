-- Integrated migration to add all missing columns to expense_requests
DO $$ 
BEGIN 
    -- 1. expense_date 컬럼 추가 (date 타입)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='expense_date') THEN
        ALTER TABLE public.expense_requests ADD COLUMN expense_date date DEFAULT CURRENT_DATE;
    END IF;

    -- 2. details 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='details') THEN
        ALTER TABLE public.expense_requests ADD COLUMN details text;
    END IF;

    -- 3. attachment_url 컬럼 추가
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='attachment_url') THEN
        ALTER TABLE public.expense_requests ADD COLUMN attachment_url text;
    END IF;

    -- 4. category 컬럼 확인
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expense_requests' AND column_name='category') THEN
        ALTER TABLE public.expense_requests ADD COLUMN category text;
    END IF;
END $$;

-- Add comments for better documentation
COMMENT ON COLUMN public.expense_requests.expense_date IS '지출 발생 일자';
COMMENT ON COLUMN public.expense_requests.details IS '지출 상세 내용';
COMMENT ON COLUMN public.expense_requests.attachment_url IS '영수증 또는 증빙 서류 파일의 저장소 URL';
COMMENT ON COLUMN public.expense_requests.category IS '지출 카테고리';
