import { differenceInYears, differenceInMonths } from 'date-fns';

/**
 * 입사일을 기준으로 총 발생 연차를 계산합니다. (한국 근로기준법)
 * 1년 미만: 1개월 개근 시 1일 산정 (최대 11일)
 * 1년 이상: 기본 15일 + 2년마다 1일 가산 (최대 25일)
 * 
 * @param joinDate - 임직원의 입사일
 * @param currentDate - 기준일 (기본값: 오늘)
 * @returns - 총 발생 연차 일수 (number)
 */
export const calculateLeaveEntitlement = (joinDate: Date, currentDate: Date = new Date()): number => {
  const years = differenceInYears(currentDate, joinDate);
  const months = differenceInMonths(currentDate, joinDate);

  if (years < 1) {
    // 1년 미만: 1개월 1일 발생, 최대 11일
    return Math.min(months, 11);
  }

  // 1년 이상: 기본 15일 + (근속연수 - 1)/2 마다 가산 (소수점 버림)
  const additionalDays = Math.floor((years - 1) / 2);
  const totalDays = 15 + additionalDays;
  
  // 근로기준법상 최대 한도는 25일
  return Math.min(totalDays, 25);
};
