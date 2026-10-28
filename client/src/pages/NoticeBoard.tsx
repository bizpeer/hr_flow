import { Button, Input, PageTitle, Panel, Select, StatusBadge, Textarea } from '../components/ui';
import React, { useState, useEffect } from 'react';
import { 
  Megaphone, Plus, Search, ChevronDown, Bell, Clock, User,
  Trash2, Edit3, X, UploadCloud, Loader2, CheckCircle
} from 'lucide-react';
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadCompanyAttachment } from '../services/attachmentService';
import { SecureAttachment } from '../components/SecureAttachment';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import './NoticeBoard.css';

interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  category: string;
  attachmentUrl?: string;
  attachmentPath?: string;
  attachmentName?: string;
  readBy: string[];
}

interface NoticeBoardProps {
  userRole: 'ADMIN' | 'SUB_ADMIN' | 'MEMBER' | string;
  currentUserId: string;
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({ userRole, currentUserId }) => {
  const { userData } = useAuthStore();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 폼 필드
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('공지');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isAdmin = userRole === 'ADMIN';
  const isManager = userRole === 'ADMIN' || userRole === 'SUB_ADMIN';

  useEffect(() => {
    if (!userData?.companyId) return;
    const q = query(collection(db, 'notices'), where('companyId', '==', userData.companyId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice));
      setNotices(docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    }, (err) => {
      console.error("Notice Fetch Error:", err);
      if (err.code === 'permission-denied') {
        alert("공지사항을 읽을 권한이 없습니다. 관리자에게 문의하세요.");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userData?.companyId]);

  const handleNoticeClick = (noticeId: string) => {
    setExpandedNoticeId(prev => prev === noticeId ? null : noticeId);
  };

  const handleOpenModal = (notice?: Notice) => {
    if (notice) {
      setEditingNotice(notice);
      setTitle(notice.title);
      setContent(notice.content);
      setCategory(notice.category);
    } else {
      setEditingNotice(null);
      setTitle('');
      setContent('');
      setCategory('공지');
    }
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let attachmentPath = editingNotice?.attachmentPath || '';
      let attachmentName = editingNotice?.attachmentName || '';

      if (selectedFile) {
        const uploaded = await uploadCompanyAttachment('notices', selectedFile);
        attachmentPath = uploaded.path; attachmentName = uploaded.name;
      }

      const noticeData = {
        title,
        content,
        category,
        attachmentPath,
        ...(selectedFile ? { attachmentUrl: '' } : {}),
        attachmentName,
        updatedAt: new Date().toISOString()
      };

      if (editingNotice) {
        await updateDoc(doc(db, 'notices', editingNotice.id), noticeData);
      } else {
        await addDoc(collection(db, 'notices'), {
          ...noticeData,
          authorId: currentUserId,
          authorName: userData?.name || '관리자',
          createdAt: new Date().toISOString(),
          readBy: [],
          companyId: userData?.companyId || ''
        });
      }

      setIsModalOpen(false);
      alert(editingNotice ? "수정되었습니다." : "공지가 등록되었습니다.");
    } catch (err) {
      alert("처리 실패: " + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, notice: Notice) => {
    e.stopPropagation();
    if (!window.confirm("공지를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'notices', notice.id));
      alert("삭제되었습니다.");
    } catch (err) {
      alert("삭제 실패: " + (err as Error).message);
    }
  };

  const filteredNotices = notices.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="wf-page notice-board-screen nb-loading" role="status" aria-label="공지사항 불러오는 중">
        <Loader2 className="nb-spinner animate-spin" aria-hidden="true" />
        <p>공지사항을 불러오는 중입니다.</p>
      </div>
    );
  }

  return (
    <div className="wf-page notice-board-screen">
      <div className="nb-content">
        <header className="nb-page-head">
          <div>
            <div className="nb-heading">
              <Megaphone className="nb-heading-icon" aria-hidden="true" />
              <PageTitle className="wf-title">전사 알림 및 공지</PageTitle>
            </div>
            <p className="nb-description">조직의 최신 뉴스와 중요한 업데이트를 확인하세요.</p>
          </div>
          <div className="nb-header-actions">
            <label className="nb-search">
              <span className="nb-sr-only">공지 제목 및 내용 검색</span>
              <Search aria-hidden="true" />
              <Input
                type="search"
                placeholder="공지 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="wf-input"
              />
            </label>
            {isManager && (
              <Button
                type="button"
                onClick={() => handleOpenModal()}
                className="wf-btn wf-btn-primary nb-create-button"
              >
                <Plus aria-hidden="true" />
                새 공지
              </Button>
            )}
          </div>
        </header>

        <section className="nb-stats" aria-label="공지 현황">
          {[
            { label: '미확인 공지', count: notices.filter(n => !n.readBy.includes(currentUserId)).length },
            { label: '전체 공지', count: notices.length },
            { label: '행사 / 워크샵', count: notices.filter(n => n.category === '행사/워크샵').length },
            { label: '규정 / 절차', count: notices.filter(n => n.category === '규정/절차').length }
          ].map((stat, i) => (
            <Panel key={i} className={`wf-panel nb-stat ${i === 0 ? 'nb-stat-highlight' : ''}`}>
              <span>{stat.label}</span>
              <strong>{stat.count}<small>건</small></strong>
            </Panel>
          ))}
        </section>

        <section className="nb-notices" aria-labelledby="nb-list-heading">
          <div className="nb-list-head">
            <h2 id="nb-list-heading" className="wf-section-title">공지 목록</h2>
            <span className="nb-list-count">{filteredNotices.length}건</span>
          </div>
          <div className="nb-list">
            {filteredNotices.map((notice) => {
              const isUnread = !notice.readBy.includes(currentUserId);
              const isExpanded = expandedNoticeId === notice.id;

              return (
                <Panel as="article" key={notice.id} className={`wf-panel nb-notice ${isExpanded ? 'is-expanded' : ''}`}>
                  <div className="nb-notice-header">
                    <button
                      type="button"
                      className="nb-notice-toggle"
                      onClick={() => handleNoticeClick(notice.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`notice-content-${notice.id}`}
                    >
                      <span className={`nb-date ${isUnread ? 'is-unread' : ''}`} aria-hidden="true">
                        <span>{notice.createdAt ? format(new Date(notice.createdAt), 'MM') : '--'}월</span>
                        <strong>{notice.createdAt ? format(new Date(notice.createdAt), 'dd') : '--'}</strong>
                      </span>
                      <span className="nb-notice-summary">
                        <span className="nb-badges">
                          <StatusBadge className={`wf-status nb-category ${isUnread ? 'is-unread' : ''}`}>{notice.category}</StatusBadge>
                          {isUnread && (
                            <span className="nb-unread"><Bell aria-hidden="true" />새 공지</span>
                          )}
                        </span>
                        <span className="nb-notice-title">{notice.title}</span>
                        <span className="nb-notice-meta">
                          <span><User aria-hidden="true" />{notice.authorName || '관리자'}</span>
                          <span><Clock aria-hidden="true" />{notice.createdAt ? format(new Date(notice.createdAt), 'yyyy-MM-dd') : ''}</span>
                        </span>
                      </span>
                      <ChevronDown className="nb-expand-icon" aria-hidden="true" />
                    </button>
                    {(isAdmin || notice.authorId === currentUserId) && (
                      <div className="nb-notice-actions">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpenModal(notice); }}
                          className="wf-icon-button nb-edit-button"
                          aria-label={`${notice.title} 수정`}
                          title="공지 수정"
                        >
                          <Edit3 aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, notice)}
                          className="wf-icon-button nb-delete-button"
                          aria-label={`${notice.title} 삭제`}
                          title="공지 삭제"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div id={`notice-content-${notice.id}`} className="nb-notice-body" hidden={!isExpanded}>
                    <div className="nb-notice-text">{notice.content}</div>
                    {(notice.attachmentPath || notice.attachmentUrl) && (
                      <div className="nb-attachment">
                        <SecureAttachment category="notices" documentId={notice.id} name={notice.attachmentName} version={notice.attachmentPath} />
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
            {filteredNotices.length === 0 && (
              <Panel className="wf-panel nb-empty" role="status">
                <Search aria-hidden="true" />
                <p>검색 결과가 없습니다.</p>
                <span>검색어를 변경하거나 새로운 공지를 확인해 보세요.</span>
              </Panel>
            )}
          </div>
        </section>
      </div>

      {isModalOpen && (
        <div className="nb-modal-backdrop">
          <div className="nb-modal" role="dialog" aria-modal="true" aria-labelledby="nb-modal-heading">
            <div className="nb-modal-head">
              <div>
                <h2 id="nb-modal-heading">{editingNotice ? '공지사항 수정' : '신규 공지 등록'}</h2>
                <p>구성원에게 전달할 내용과 첨부자료를 입력하세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="wf-icon-button"
                aria-label="공지 작성 창 닫기"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="nb-form">
              <div className="nb-form-row">
                <label className="wf-field" htmlFor="nb-title">
                  제목
                  <Input
                    id="nb-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="공지 제목을 입력하세요" className="wf-input"
                  />
                </label>
                <label className="wf-field" htmlFor="nb-category">
                  카테고리
                  <Select id="nb-category" value={category} onChange={(e) => setCategory(e.target.value)} className="wf-input">
                    <option value="공지">일반 공지</option>
                    <option value="행사/워크샵">행사 / 워크샵</option>
                    <option value="규정/절차">규정 / 절차</option>
                    <option value="복리후생">복리후생</option>
                  </Select>
                </label>
              </div>
              <label className="wf-field" htmlFor="nb-content">
                상세 내용
                <Textarea
                  id="nb-content" required value={content} onChange={(e) => setContent(e.target.value)}
                  rows={6} placeholder="공지 내용을 상세히 작성하세요..." className="wf-input"
                />
              </label>
              <div className="wf-field">
                <span>문서 및 이미지 첨부</span>
                <div className={`nb-upload ${selectedFile ? 'has-file' : ''}`}>
                  <input
                    type="file" accept=".pdf,image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="nb-file-input" id="notice-file-upload"
                    aria-describedby="nb-file-help"
                  />
                  <label htmlFor="notice-file-upload" className="nb-upload-label">
                    {selectedFile ? (
                      <>
                        <CheckCircle aria-hidden="true" />
                        <span><strong>{selectedFile.name}</strong><small id="nb-file-help">변경하려면 클릭하세요</small></span>
                      </>
                    ) : (
                      <>
                        <UploadCloud aria-hidden="true" />
                        <span><strong>클릭하여 파일을 업로드하세요</strong><small id="nb-file-help">최대 10MB / PDF 및 이미지 파일 허용</small></span>
                      </>
                    )}
                  </label>
                </div>
              </div>
              <div className="nb-form-actions">
                <Button type="button" onClick={() => setIsModalOpen(false)} className="wf-btn">취소</Button>
                <Button type="submit" disabled={isSubmitting} className="wf-btn wf-btn-primary" aria-busy={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="animate-spin" aria-hidden="true" />처리 중...</> : (editingNotice ? '수정 완료' : '공지 게시')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
