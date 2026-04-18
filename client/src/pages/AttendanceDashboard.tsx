import React, { useState, useEffect } from 'react';
import { 
  Clock, LogIn, LogOut, Loader2, Calendar as CalendarIcon, MapPin, History,
  KeyRound 
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { collection, query, where, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { format, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, isSameMonth } from 'date-fns';
import { calculateLeaveEntitlement } from '../utils/leaveCalculator';

interface AttendanceRecord {
  id: string;
  userId: string;
  type: 'IN' | 'OUT';
  timestamp: string;
  location?: string;
}

export const AttendanceDashboard: React.FC = () => {
  const { 
    user, userData, getDisplayEmail,
    openPasswordChange 
  } = useAuthStore();
  const [kstTime, setKstTime] = useState<string>('');
  const [kstDate, setKstDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // 캘린더 및 관리자 조회용 상태
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // 초기 selectedUserId 설정
  useEffect(() => {
    if (user?.uid && !selectedUserId) {
      setSelectedUserId(user.uid);
    }
  }, [user?.uid, selectedUserId]);



  // 관리자일 경우 전체 사용자 목록 페칭
  useEffect(() => {
    const isManagementRole = userData?.role === 'ADMIN' || userData?.role === 'SUB_ADMIN';

    if (isManagementRole && userData?.companyId) {
      const q = query(collection(db, 'UserProfile'), where('companyId', '==', userData.companyId));
      const unsubscribe = onSnapshot(q, (snap) => {
        setAllUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [userData?.role, userData?.companyId]);

  // 선택된 사용자의 월별 근태 기록 구독
  useEffect(() => {
    if (!selectedUserId) return;

    setMonthlyLoading(true);
    // KST 기준 월 시작/종료 계산
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();

    const q = query(
      collection(db, 'attendance'),
      where('companyId', '==', userData?.companyId),
      where('userId', '==', selectedUserId),
      where('timestamp', '>=', start),
      where('timestamp', '<=', end)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setMonthlyRecords(docs);
      setMonthlyLoading(false);
    }, (err) => {
      console.error("Monthly Attendance Error:", err);
      setMonthlyLoading(false);
    });

    return () => unsubscribe();
  }, [selectedUserId, currentMonth]);

  // KST 실시간 시계
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setKstTime(now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setKstDate(now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 오늘 근태 기록 실시간 구독
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // [버그 수정 및 보강] KST 기준 오늘 날짜 기록 페칭
    // 인덱스 오류 및 타임존 문자열 비교 문제를 피하기 위해 사용자 ID로만 쿼리 후 로컬 필터링
    const q = query(
      collection(db, 'attendance'),
      where('companyId', '==', userData?.companyId),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const now = new Date();
      const kstDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
      
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      
      // KST 기준 오늘 날짜와 일치하는 기록만 필터링
      const todayRecords = docs.filter(record => {
        try {
          const recordKstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(record.timestamp));
          return recordKstDate === kstDateStr;
        } catch (e) {
          return false;
        }
      });

      const sorted = [...todayRecords].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setRecords(sorted.slice(0, 10));
      setLoading(false);
    }, (err) => {
      console.error("Attendance Subscribe Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid, userData]);

  const handleAttendance = async (type: 'IN' | 'OUT') => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 중복 기록 방지 로직 추가
    if (type === 'IN' && hasCheckedInToday) {
      alert('이미 출근했습니다.');
      return;
    }
    if (type === 'OUT' && hasCheckedOutToday) {
      alert('이미 퇴근했습니다.');
      return;
    }
    if (type === 'OUT' && !hasCheckedInToday) {
      alert('출근 기록이 먼저 필요합니다.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const attendanceData = {
        userId: user.uid,
        userName: userData?.name || '근로자',
        type: type,
        timestamp: timestamp,
        location: '본사',
        createdAt: timestamp,
        companyId: userData?.companyId || ''
      };
      
      const docRef = await addDoc(collection(db, 'attendance'), attendanceData);

      const newRecord: AttendanceRecord = {
        id: docRef.id,
        ...attendanceData
      };
      setRecords(prev => {
        if (prev.some(r => r.id === docRef.id)) return prev;
        const updated = [newRecord, ...prev];
        return updated.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
      });

      // 월별 현황(캘린더) 즉시 반영
      if (selectedUserId === user.uid) {
        setMonthlyRecords(prev => {
          if (prev.some(r => r.id === docRef.id)) return prev;
          return [...prev, newRecord];
        });
      }
    } catch (e) {
      const error = e as Error;
      alert('기록 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const lastStatus = records[0];
  const hasCheckedInToday = records.some(r => r.type === 'IN');
  const hasCheckedOutToday = records.some(r => r.type === 'OUT');

  // 연차 요약 로직
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'leaves'), 
      where('companyId', '==', userData?.companyId || 'UNKNOWN'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      setLeaveRequests(snap.docs.map(doc => doc.data()));
    }, (err) => {
      console.error("Leave Snapshot Error:", err);
    });
  }, [user?.uid]);

  const joinDate = userData?.joinDate ? new Date(userData.joinDate) : new Date();
  const totalLeave = calculateLeaveEntitlement(joinDate);
  const usedLeave = leaveRequests
    .filter(req => req.status === 'APPROVED' && (req.type === 'annual' || req.type === 'half'))
    .reduce((sum, req) => sum + (req.requestDays || 0), 0);
  const remainingLeave = totalLeave - usedLeave;

  return (
    <div className="flex-1 p-2 md:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between mb-4 gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">전체 근태 정보</h1>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
                <p className="text-slate-400 text-[10px] font-medium">{kstDate}</p>
                <div className="hidden md:block w-px h-2 bg-slate-200"></div>
                <div className="flex items-center gap-1.5">
                  {userData ? (
                    <>
                      <span className="text-[11px] font-black text-indigo-600">{userData.name}</span>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                      <span className="text-[10px] font-bold text-slate-400">정보 로딩 중...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 비밀번호 변경 버튼 추가 */}
            <button
              onClick={openPasswordChange}
              className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-600 rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all active:scale-95 group"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-500 group-hover:rotate-12 transition-transform" />
              <span className="text-[11px] font-bold">비밀번호 변경</span>
            </button>

            {/* 연차 요약 축소형 */}
            <div className="flex gap-2 bg-white p-1 rounded-xl shadow-md border border-slate-100">
               <div className="px-3 py-1 rounded-lg bg-slate-50 flex flex-col items-center min-w-[50px]">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">총 발생</span>
                  <span className="text-xs font-black text-slate-700">{totalLeave}</span>
               </div>
               <div className="px-3 py-1 rounded-lg bg-slate-50 flex flex-col items-center min-w-[50px]">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">사용</span>
                  <span className="text-xs font-black text-rose-500">{usedLeave}</span>
               </div>
               <div className="px-3 py-1 rounded-lg bg-indigo-600 flex flex-col items-center min-w-[60px] shadow-sm shadow-indigo-100">
                  <span className="text-[7px] font-black text-indigo-200 uppercase tracking-widest">잔여</span>
                  <span className="text-xs font-black text-white">{remainingLeave}</span>
               </div>
            </div>
          </div>
          
          <div className="glass-card px-4 py-2 rounded-xl premium-shadow flex items-center gap-3 border-indigo-100">
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Current KST</span>
              <span className="text-xl font-mono font-black text-slate-800 tracking-tighter">{kstTime || '00:00:00'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Action Cards */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-100 relative overflow-hidden group flex-1">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110 duration-700"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <Clock className="w-4 h-4" />
                  </div>
                  {lastStatus?.type === 'IN' ? (
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded-full animate-pulse">근무 중</span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-slate-50 text-slate-400 text-[9px] font-black rounded-full">미출근</span>
                  )}
                </div>

                <h2 className="text-base font-black text-slate-800 mb-0.5 uppercase tracking-tight">체크인/아웃</h2>
                <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">회사의 보안 규정을 준수해주세요.</p>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleAttendance('IN')}
                    disabled={isSubmitting || hasCheckedInToday}
                    className="flex justify-center items-center gap-2 py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale group"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                    {hasCheckedInToday ? '출근완료' : '출근하기'}
                  </button>
                  
                  <button 
                    onClick={() => handleAttendance('OUT')}
                    disabled={isSubmitting || !hasCheckedInToday || hasCheckedOutToday}
                    className="flex justify-center items-center gap-2 py-2.5 bg-white text-rose-600 border border-rose-100 text-[11px] font-black rounded-xl hover:bg-rose-50 transition-all active:scale-95 disabled:opacity-30 group"
                  >
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    {hasCheckedOutToday ? '퇴근완료' : '퇴근하기'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline / logs */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-100 h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  실시간 타임라인
                </h2>
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Live Updates</div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <p className="font-bold tracking-tight text-[10px]">로딩 중...</p>
                </div>
              ) : records.length > 0 ? (
                <div className="space-y-3">
                  {records.map((record, idx) => (
                    <div key={record.id} className="relative pl-6 transition-all hover:translate-x-0.5">
                      {/* Line */}
                      {idx !== records.length - 1 && (
                        <div className="absolute left-[7px] top-6 bottom-[-16px] w-[1px] bg-slate-100"></div>
                      )}
                      {/* Dot */}
                      <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${record.type === 'IN' ? 'bg-indigo-500' : 'bg-rose-500'}`}>
                        {record.type === 'IN' ? <LogIn className="w-2 h-2 text-white" /> : <LogOut className="w-2 h-2 text-white" />}
                      </div>
                      
                      <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100 group hover:border-indigo-100 hover:bg-white transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-baseline gap-2">
                            <span className={`text-[7px] font-black uppercase tracking-widest ${record.type === 'IN' ? 'text-indigo-500' : 'text-rose-500'}`}>
                              {record.type === 'IN' ? 'IN' : 'OUT'}
                            </span>
                            <h3 className="font-black text-slate-800 text-sm">
                              {format(new Date(record.timestamp), 'HH:mm:ss')}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1 text-slate-400">
                            <MapPin className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-semibold">{record.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <History className="w-6 h-6 text-slate-200" />
                  </div>
                  <h3 className="text-xs font-black text-slate-800 mb-0.5">기록이 없습니다</h3>
                  <p className="text-slate-400 text-[9px]">현황을 시작하세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 월별 근태 캘린더 (컴팩트 최적화) */}
        <div className="mt-4 bg-white rounded-2xl shadow-xl p-3 border border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-indigo-500" />
                월별 근태 현황
              </h2>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Monthly Performance
              </p>
              {monthlyLoading && (
                <div className="flex items-center gap-2 mt-2 text-indigo-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px] font-bold">로딩 중...</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(userData?.role === 'ADMIN' || userData?.role === 'SUB_ADMIN') && (
                <select
                  id="attendance-user-selector"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({getDisplayEmail(u.email)})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-slate-200">
                <button
                  id="calendar-prev-month"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                >
                  <History className="w-4 h-4 text-slate-600 rotate-180" />
                </button>
                <span className="px-4 text-sm font-black text-slate-800 min-w-[90px] text-center">
                  {format(currentMonth, 'yyyy. MM')}
                </span>
                <button
                  id="calendar-next-month"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                >
                  <History className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="grid grid-cols-7 mb-1 border-b border-slate-50 pb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startOfWeek(startOfMonth(currentMonth)).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9"></div>
              ))}
              
              {eachDayOfInterval({
                start: startOfMonth(currentMonth),
                end: endOfMonth(currentMonth)
              }).map((day) => {
                const dayRecords = monthlyRecords.filter(r => isSameDay(new Date(r.timestamp), day));
                const hasCheckIn = dayRecords.some(r => r.type === 'IN');
                const hasCheckOut = dayRecords.some(r => r.type === 'OUT');
                const isTodayLocal = isToday(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <div 
                    key={day.toString()}
                    className={`h-9 relative flex items-center justify-center rounded-lg transition-all border ${
                      isTodayLocal ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                    } ${!isCurrentMonth ? 'opacity-20' : ''}`}
                  >
                    <span className={`text-sm font-bold ${
                      isTodayLocal ? 'text-indigo-600' : 'text-slate-700'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    
                    {hasCheckIn && (
                      <div className="absolute top-0.5 right-0.5">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-sm shadow-indigo-200"></div>
                      </div>
                    )}
                    {hasCheckOut && (
                      <div className="absolute bottom-0.5 right-0.5">
                        <div className="w-1.5 h-1.5 bg-rose-400 rounded-full shadow-sm shadow-rose-100"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="text-center md:border-r border-slate-200 last:border-0 px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">근무일수</p>
              <p className="text-lg font-black text-slate-700">
                {new Set(monthlyRecords.filter(r => r.type === 'IN').map(r => format(new Date(r.timestamp), 'yyyy-MM-dd'))).size}일
              </p>
            </div>
            <div className="text-center md:border-r border-slate-200 last:border-0 px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">정시퇴근</p>
              <p className="text-lg font-black text-emerald-500">
                {monthlyRecords.filter(r => r.type === 'OUT').length}회
              </p>
            </div>
            <div className="text-center md:border-r border-slate-200 last:border-0 px-2">
              <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">연차사용</p>
              <p className="text-lg font-black text-indigo-600">0일</p>
            </div>
            <div className="text-center px-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">지각</p>
              <p className="text-lg font-black text-rose-500">0회</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
