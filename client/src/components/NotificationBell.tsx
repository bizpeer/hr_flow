import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NotificationBellProps {
  currentUserId: string;
}

// 목업 데이터: 실제로는 Firestore onSnapshot 등으로 불러옵니다.
const MOCK_NOTIFICATIONS = [
  { id: 'n1', title: '3월 전사 회식 안내', readBy: ['uid1', 'uid2'] },
  { id: 'n2', title: '지출결의 양식 변경 공지', readBy: ['uid1'] },
  { id: 'n3', title: '신규 임직원 휴가 규정 안내', readBy: [] }
];

export const NotificationBell: React.FC<NotificationBellProps> = ({ currentUserId }) => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 1. 여기서 Firestore 리스너(onSnapshot)를 연결합니다.
    // 2. 자신이 안 읽은 문서(readBy 배열에 currentUserId가 없는 문서)의 개수를 셉니다.
    
    // 모의 계산 로직: currentUserId = 'uid3' 라고 가정
    const unread = MOCK_NOTIFICATIONS.filter(notice => !notice.readBy.includes(currentUserId)).length;
    setUnreadCount(unread);
    
    // 새 알림 발생 시 우측 하단 브라우저 푸시 또는 스낵바 토스트 호출 로직이 이 자리에 삽입됩니다.
  }, [currentUserId]);

  const handleBellClick = () => {
    // 알림 리스트 팝업을 띄우거나, 즉시 공지사항(게시판)으로 이동
    navigate('/board');
  };

  return (
    <button 
      onClick={handleBellClick}
      className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
      aria-label="알림(공지사항) 확인"
    >
      <Bell className="w-6 h-6" />
      
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full border-2 border-gray-900 animate-pulse">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
