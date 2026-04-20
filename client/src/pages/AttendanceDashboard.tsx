import React, { useState, useEffect } from 'react';
import { 
  Clock, LogIn, LogOut, Loader2, Calendar as CalendarIcon, MapPin, History,
  KeyRound 
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
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
  const isManagement = userData?.role === 'ADMIN' || userData?.role === 'SUB_ADMIN';

  // 캘린더 및 관리자 조회용 상태
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);


  // 초기 selectedUserId 설정
  useEffect(() => {
    if (user?.uid && !selectedUserId) {
      setSelectedUserId(user.uid);
    }
  }, [user?.uid, selectedUserId]);



  // 관리자일 경우 전체 사용자 목록 페칭
  useEffect(() => {
    if (isManagement && userData?.companyId) {
      const q = query(collection(db, 'UserProfile'), where('companyId', '==', userData.companyId));
      const unsubscribe = onSnapshot(q, (snap) => {
        setAllUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => {
        console.error("Management User List Error:", err);
      });
      return () => unsubscribe();
    }
  }, [userData?.role, userData?.companyId]);

  // 선택된 사용자의 월별 근태 기록 구독
  useEffect(() => {
    if (!selectedUserId) return;


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
    }, (err) => {
      console.error("Monthly Attendance Error:", err);
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
    if (!user?.uid || !userData?.companyId) {
      setLoading(false);
      return;
    }

    // [버그 수정 및 보강] KST 기준 오늘 날짜 기록 페칭
    const q = query(
      collection(db, 'attendance'),
      where('companyId', '==', userData.companyId),
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
    <div className="flex-1 p-4 md:p-8 bg-slate-50 min-h-screen page-transition">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section: Profile & Global Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200/60">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 ring-4 ring-white">
              <span className="text-2xl font-black">{userData?.name?.slice(0, 1) || 'H'}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{userData?.name || '로딩 중...'}님, 반갑습니다.</h1>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg uppercase tracking-wider">{userData?.role || 'MEMBER'}</span>
              </div>
              <p className="text-slate-400 text-xs font-semibold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                {kstDate} • <span className="text-indigo-500 font-bold">{kstTime}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openPasswordChange}
              className="px-5 py-2.5 bg-white text-slate-600 rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all active:scale-95 flex items-center gap-2 text-xs font-black"
            >
              <KeyRound className="w-4 h-4 text-indigo-500" />
              보안 설정
            </button>
            <div className="h-10 w-px bg-slate-200 hidden md:block mx-2"></div>
            <div className="flex -space-x-3">
              {allUsers.slice(0, 5).map((u, i) => (
                <div key={u.id} className="w-10 h-10 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm" style={{ zIndex: 10 - i }}>
                  {u.name?.slice(0, 1)}
                </div>
              ))}
              {allUsers.length > 5 && (
                <div className="w-10 h-10 rounded-full border-4 border-white bg-slate-800 flex items-center justify-center text-[10px] font-black text-white shadow-sm z-0">
                  +{allUsers.length - 5}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-6">
          
          {/* Main Attendance Action Card (L: Spans 5) */}
          <div className="lg:col-span-5 h-[340px]">
             <div className="premium-card bento-inner bg-gradient-to-br from-white to-indigo-50/30 group">
                <div className="flex items-center justify-between mb-8">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                    <Clock className="w-6 h-6" />
                  </div>
                  {lastStatus?.type === 'IN' ? (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl animate-in zoom-in duration-500">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      근무 중
                    </div>
                  ) : (
                    <div className="px-4 py-1.5 bg-slate-100 text-slate-400 text-[10px] font-black rounded-xl uppercase tracking-widest">Off Duty</div>
                  )}
                </div>

                <div className="flex-1">
                  <h2 className="text-xl font-black text-slate-900 mb-1">근태 기록</h2>
                  <p className="text-xs font-bold text-slate-400 mb-8 leading-relaxed">오늘의 업무 시작과 종료를 기록하세요.<br/>데이터는 실시간으로 클라우드에 연동됩니다.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => handleAttendance('IN')}
                      disabled={isSubmitting || hasCheckedInToday}
                      className="group relative h-24 overflow-hidden rounded-[1.5rem] bg-indigo-600 shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40 disabled:grayscale"
                    >
                      <div className="relative z-10 flex flex-col items-center gap-2 text-white">
                        <LogIn className="w-6 h-6" />
                        <span className="text-xs font-black tracking-tighter">{hasCheckedInToday ? '출근 완료' : '출근하기'}</span>
                      </div>
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </button>

                    <button 
                      onClick={() => handleAttendance('OUT')}
                      disabled={isSubmitting || !hasCheckedInToday || hasCheckedOutToday}
                      className="group relative h-24 overflow-hidden rounded-[1.5rem] bg-white border-2 border-rose-100 shadow-lg transition-all hover:bg-rose-50 active:scale-[0.98] disabled:opacity-40"
                    >
                      <div className="relative z-10 flex flex-col items-center gap-2 text-rose-600">
                        <LogOut className="w-6 h-6" />
                        <span className="text-xs font-black tracking-tighter">{hasCheckedOutToday ? '퇴근 완료' : '퇴근하기'}</span>
                      </div>
                    </button>
                  </div>
                </div>
             </div>
          </div>

          {/* Timeline Feed (Narrow - Spans 4) */}
          <div className="lg:col-span-4 h-[340px]">
            <div className="premium-card bento-inner border-slate-50">
              <div className="flex items-center justify-between mb-6">
                 <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-500" />
                    Timeline
                 </h2>
                 <span className="text-[10px] font-bold text-slate-400">Live</span>
              </div>

              <div className="flex-1 overflow-y-auto px-1 space-y-4 custom-scrollbar">
                {loading ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                ) : records.length > 0 ? (
                  records.map((record, idx) => (
                    <div key={record.id} className="flex gap-4 group">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ring-2 ${record.type === 'IN' ? 'bg-indigo-500 ring-indigo-100' : 'bg-rose-500 ring-rose-100'}`}></div>
                        {idx !== records.length - 1 && <div className="w-0.5 h-full bg-slate-100 mt-1"></div>}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-baseline justify-between mb-1">
                           <span className="text-xs font-black text-slate-900">{format(new Date(record.timestamp), 'HH:mm:ss')}</span>
                           <span className={`text-[8px] font-black uppercase ${record.type === 'IN' ? 'text-indigo-400' : 'text-rose-400'}`}>{record.type === 'IN' ? 'Check In' : 'Check Out'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                           <MapPin className="w-3 h-3" />
                           {record.location || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                    <History className="w-8 h-8 mb-2" />
                    <span className="text-[9px] font-black uppercase">No Logs</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Leave Entitlement Summary (Spans 3) */}
          <div className="lg:col-span-3 h-[340px]">
            <div className="premium-card bento-inner bg-slate-900 text-white border-none shadow-indigo-900/10">
               <div className="flex items-center justify-between mb-8">
                  <div className="p-3 bg-white/10 rounded-2xl">
                    <CalendarIcon className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest">Leaves</div>
               </div>

               <div className="flex-1 space-y-6">
                 <div>
                   <h3 className="text-3xl font-black tracking-tight mb-1">{remainingLeave}<span className="text-base text-slate-500 ml-1">Days</span></h3>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Remaining Balance</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                       <div className="text-[18px] font-black mb-1">{totalLeave}</div>
                       <div className="text-[8px] font-black text-slate-500 uppercase">Total</div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                       <div className="text-[18px] font-black mb-1 text-rose-400">{usedLeave}</div>
                       <div className="text-[8px] font-black text-slate-500 uppercase">Used</div>
                    </div>
                 </div>

                 <div className="pt-4">
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-gradient-to-r from-indigo-500 to-violet-400 rounded-full transition-all duration-1000" 
                         style={{ width: `${(remainingLeave / totalLeave) * 100}%` }}
                       ></div>
                    </div>
                 </div>
               </div>
            </div>
          </div>

          {/* Monthly Attendance Calendar (Full Width: Spans 12) */}
          <div className="lg:col-span-12">
            <div className="premium-card p-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
                 <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight mb-1">월별 근태 분석</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monthly Performance Analytics</p>
                 </div>

                 <div className="flex flex-wrap items-center gap-4">
                    {isManagement && (
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="px-6 py-3 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-xs font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer"
                      >
                        {allUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name} ({getDisplayEmail(u.email)})</option>
                        ))}
                      </select>
                    )}

                    <div className="flex items-center bg-slate-50 rounded-[1.25rem] p-1.5 border border-slate-100 shadow-inner">
                      <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all">
                        <History className="w-4 h-4 text-slate-500 rotate-180" />
                      </button>
                      <span className="px-6 text-sm font-black text-slate-800 min-w-[120px] text-center">
                        {format(currentMonth, 'yyyy. MM')}
                      </span>
                      <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all">
                        <History className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                 </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                  {/* Calendar Grid */}
                  <div className="xl:col-span-8">
                    <div className="grid grid-cols-7 mb-4 border-b border-slate-100 pb-4">
                      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
                        <div key={day} className="text-center text-[10px] font-black text-slate-300 tracking-widest">{day}</div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7 gap-3">
                      {Array.from({ length: startOfWeek(startOfMonth(currentMonth)).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square"></div>
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
                            className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl transition-all border-2 ${
                              isTodayLocal ? 'border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100' : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                            } ${!isCurrentMonth ? 'opacity-20' : ''} group cursor-default`}
                          >
                            <span className={`text-sm font-black ${isTodayLocal ? 'text-indigo-600' : 'text-slate-700'}`}>
                              {format(day, 'd')}
                            </span>
                            
                            <div className="flex gap-1 mt-1.5 mt-2">
                               <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${hasCheckIn ? 'bg-indigo-500 scale-100' : 'bg-slate-100 scale-75'}`}></div>
                               <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${hasCheckOut ? 'bg-rose-400 scale-100' : 'bg-slate-100 scale-75'}`}></div>
                            </div>

                            {/* Tooltip hint on hover */}
                            {dayRecords.length > 0 && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[8px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                                {dayRecords.filter(r => r.type === 'IN')[0] && `IN: ${format(new Date(dayRecords.filter(r => r.type === 'IN')[0].timestamp), 'HH:mm')}`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="xl:col-span-4 flex flex-col justify-center space-y-4">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">근무 요약</p>
                       <div className="flex items-end gap-3">
                          <span className="text-4xl font-black text-slate-900">{new Set(monthlyRecords.filter(r => r.type === 'IN').map(r => format(new Date(r.timestamp), 'yyyy-MM-dd'))).size}</span>
                          <span className="text-sm font-bold text-slate-500 mb-2">Days Worked</span>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50">
                          <div className="text-xl font-black text-indigo-600 mb-1">{monthlyRecords.filter(r => r.type === 'OUT').length}</div>
                          <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">정시 퇴근</div>
                       </div>
                       <div className="p-6 bg-rose-50/50 rounded-3xl border border-rose-100/50">
                          <div className="text-xl font-black text-rose-600 mb-1">0</div>
                          <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest">지각/조퇴</div>
                       </div>
                    </div>

                    <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 rounded-xl"><History className="w-4 h-4 text-slate-500" /></div>
                          <span className="text-xs font-black text-slate-700">근태 증명서 발급</span>
                       </div>
                       <button className="text-[10px] font-black text-indigo-600 hover:underline">Download</button>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
