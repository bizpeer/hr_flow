-- 1. RLS 활성화
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 삭제 (존재할 경우)
DROP POLICY IF EXISTS "Users can view own leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Managers can view all company leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Users can insert own leave requests" ON leave_requests;
DROP POLICY IF EXISTS "Users can update own pending leave requests" ON leave_requests;

-- 3. 조회 정책 (본인 또는 관리자)
CREATE POLICY "Users can view own leave requests" 
ON leave_requests FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all company leave requests" 
ON leave_requests FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('super_admin', 'admin', 'sub_admin')
    AND profiles.company_id = leave_requests.company_id
  )
);

-- 4. 삽입 정책
CREATE POLICY "Users can insert own leave requests" 
ON leave_requests FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 5. 수정 정책
CREATE POLICY "Users can update own pending leave requests" 
ON leave_requests FOR UPDATE 
USING (auth.uid() = user_id AND status = 'PENDING');

-- 6. 관리자 수정보안 (결재 상태 변경 등)
CREATE POLICY "Managers can update leave requests status" 
ON leave_requests FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('super_admin', 'admin', 'sub_admin')
    AND profiles.company_id = leave_requests.company_id
  )
);
