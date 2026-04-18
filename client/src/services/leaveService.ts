import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

export type LeaveType = 'annual' | 'half' | 'sick' | 'other';

/**
 * 관리자가 휴가를 최종 승인할 때 호출되는 함수
 * 잔여 연차 차감 로직 탑재 및 상태 업데이트를 단일 트랜잭션으로 처리합니다.
 */
export const handleApproveLeave = async (
  requestId: string,
  userId: string,
  leaveType: LeaveType,
  requestDays: number // 신청한 연차의 일수 (예: 반차일 경우 보통 1개 문서로 0.5 신청하지만 명시적 계산 위함)
) => {
  const userProfileRef = doc(db, 'UserProfile', userId);
  const leaveRequestRef = doc(db, 'LeaveRequests', requestId);

  try {
    await runTransaction(db, async (transaction) => {
      // 1. 사용자 프로필 및 잔여 연차 조회
      const userDoc = await transaction.get(userProfileRef);
      if (!userDoc.exists()) {
        throw new Error('사용자(UserProfile) 데이터가 존재하지 않습니다.');
      }

      const userData = userDoc.data();
      const annualLeaveTotal = userData.annualLeaveTotal || 0;
      const usedLeave = userData.usedLeave || 0;

      // 2. 차감 일수 계산 (반차는 0.5일로 강제계산 또는 requestDays를 직접 0.5로 받아 넘길 수 있음)
      const deductionAmount = leaveType === 'half' ? 0.5 : requestDays;
      const remainingLeave = annualLeaveTotal - usedLeave;

      // 3. 잔여 연차 체크
      if (remainingLeave < deductionAmount) {
        throw new Error(`잔여 연차가 부족하여 승인할 수 없습니다. (신청일수: ${deductionAmount}일, 잔여: ${remainingLeave}일)`);
      }

      // 4. 연차 자동 차감 (usedLeave 증가)
      transaction.update(userProfileRef, {
        usedLeave: usedLeave + deductionAmount,
      });

      // 5. 휴가 문서 상태 '최종 승인(APPROVED)'으로 변경
      // 조직장의 결재 구조라면 'APPROVED' 전에 'PENDING_HR' 혹은 'APPROVED_BY_LEADER' 등을 관리할 수 있습니다.
      transaction.update(leaveRequestRef, {
        status: 'APPROVED',
        updatedAt: new Date().toISOString()
      });
    });

    return { success: true, message: '휴가 요청 승인 및 연차 차감이 완료되었습니다.' };
  } catch (error: any) {
    console.error('Leave Approval Transaction failed: ', error);
    return { success: false, message: error.message };
  }
};
