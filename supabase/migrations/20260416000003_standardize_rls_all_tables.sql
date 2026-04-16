-- 지출결의, 휴가신청, 초과근무 테이블에 대한 RLS 정책 통합 및 강화
-- system_admin 권한 추가 및 member 조회 보장

-- 1. Leave Requests
DROP POLICY IF EXISTS "Enable all for admins" ON leave_requests;
DROP POLICY IF EXISTS "Enable read for users own leaves" ON leave_requests;
DROP POLICY IF EXISTS "Enable insert for users own leaves" ON leave_requests;
DROP POLICY IF EXISTS "System admin full access" ON leave_requests;
DROP POLICY IF EXISTS "Admin and Super Admin view all in company" ON leave_requests;
DROP POLICY IF EXISTS "Members view own leaves" ON leave_requests;

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access" ON leave_requests
FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' = 'system_admin');

CREATE POLICY "Admin and Super Admin view all in company" ON leave_requests
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'role' IN ('super_admin', 'admin')) AND 
  company_id = (auth.jwt() ->> 'company_id')::uuid
);

CREATE POLICY "Members view own leaves" ON leave_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own leaves" ON leave_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 2. Expense Requests
DROP POLICY IF EXISTS "System admin full access" ON expense_requests;
DROP POLICY IF EXISTS "Admin and Super Admin view all in company" ON expense_requests;
DROP POLICY IF EXISTS "Members view own expenses" ON expense_requests;
DROP POLICY IF EXISTS "Users can insert own expenses" ON expense_requests;

ALTER TABLE expense_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access" ON expense_requests
FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' = 'system_admin');

CREATE POLICY "Admin and Super Admin view all in company" ON expense_requests
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'role' IN ('super_admin', 'admin')) AND 
  company_id = (auth.jwt() ->> 'company_id')::uuid
);

CREATE POLICY "Members view own expenses" ON expense_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own expenses" ON expense_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3. Overtime Requests
DROP POLICY IF EXISTS "System admin full access" ON overtime_requests;
DROP POLICY IF EXISTS "Admin and Super Admin view all in company" ON overtime_requests;
DROP POLICY IF EXISTS "Members view own overtimes" ON overtime_requests;
DROP POLICY IF EXISTS "Users can insert own overtimes" ON overtime_requests;

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access" ON overtime_requests
FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' = 'system_admin');

CREATE POLICY "Admin and Super Admin view all in company" ON overtime_requests
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'role' IN ('super_admin', 'admin')) AND 
  company_id = (auth.jwt() ->> 'company_id')::uuid
);

CREATE POLICY "Members view own overtimes" ON overtime_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own overtimes" ON overtime_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
