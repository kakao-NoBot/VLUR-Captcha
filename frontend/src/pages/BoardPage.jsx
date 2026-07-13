import React, { useEffect, useRef, useState } from 'react';
import api from '../api/axios';

const PAGE_SIZE = 10;

const BOARD_TABS = [
  ['notice', '공지사항'],
  ['faq', 'FAQ'],
  ['research', 'CAPTCHA 연구'],
];

const TAB_LABELS = Object.fromEntries(BOARD_TABS);

/* 페이지네이션 컴포넌트 */
function Pagination({ total, page, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
      <button className="pg-btn" style={{ padding: '7px 12px', fontSize: 13 }}
        disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
        <button key={n} className="pg-btn" style={{
          padding: '7px 14px', fontSize: 13,
          ...(n === page ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : {}),
        }} onClick={() => onChange(n)}>{n}</button>
      ))}
      <button className="pg-btn" style={{ padding: '7px 12px', fontSize: 13 }}
        disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

function BoardDetail({ post, previousPost, nextPost, onBack, onSelectPost, onEdit, onDelete, canEdit }) {
  return (
    <article className="board-detail">
      <header className="board-detail-header">
        <h1>{post.title}</h1>
        <div className="board-detail-meta">
          <div>
            <span className="board-detail-author"><b>VLUR CAPTCHA 운영팀</b></span>
            <i aria-hidden="true" />
            <span className="board-detail-views">조회 : {post.viewCount ?? 0}</span>
            <span className="board-detail-date">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <time dateTime={post.date}>{post.date.replaceAll('-', '.')}</time>
            </span>
          </div>
        </div>
        <div className="board-detail-actions">
          {canEdit && (
            <button type="button" className="board-detail-edit" onClick={onEdit} aria-label="게시글 수정">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L4 15.8V20Z" />
                <path d="m13.7 6.1 4.2 4.2" />
              </svg>
            </button>
          )}
          {canEdit && (
            <button type="button" className="board-detail-edit" onClick={onDelete} aria-label="게시글 삭제">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M10 11v6M14 11v6" />
                <path d="M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13" />
                <path d="M9 7V4h6v3" />
              </svg>
            </button>
          )}
          <button type="button" className="board-detail-list" onClick={onBack}>목록</button>
        </div>
      </header>

      <div className="board-detail-content">
        <p>{post.content ?? '테스트입니다.'}</p>
      </div>

      <nav className="board-detail-neighbors" aria-label="이전 및 다음 게시글">
        <button type="button" disabled={!previousPost} onClick={() => previousPost && onSelectPost(previousPost)}>
          <span>‹ 이전 글</span>
        </button>
        <button type="button" className="next" disabled={!nextPost} onClick={() => nextPost && onSelectPost(nextPost)}>
          <span>다음 글 ›</span>
        </button>
      </nav>
    </article>
  );
}

function DeletePostModal({ deleting, error, onConfirm, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !deleting) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleting, onClose]);

  return (
    <div
      className="terms-modal-backdrop board-delete-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
    >
      <section
        className="terms-modal board-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-delete-title"
        aria-describedby="board-delete-description"
      >
        <div className="board-delete-content">
          <div className="board-delete-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
            </svg>
          </div>
          <h2 id="board-delete-title">게시글을 삭제할까요?</h2>
          <p id="board-delete-description">
            삭제한 게시글은 다시 복구할 수 없습니다.
          </p>
          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#c0392b' }} role="alert">{error}</p>
          )}
        </div>
        <div className="board-delete-actions">
          <button type="button" className="pg-btn" onClick={onClose} disabled={deleting}>취소</button>
          <button type="button" className="pg-btn danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </section>
    </div>
  );
}

function SaveConfirmModal({ edited, saving, error, onConfirm, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [saving, onClose]);

  return (
    <div
      className="terms-modal-backdrop board-delete-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="terms-modal board-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-save-title"
      >
        <div className="board-delete-content">
          <div
            className="board-delete-icon"
            style={{ color: 'var(--orange-2)', background: 'rgba(240,105,30,.1)', border: '1px solid rgba(240,105,30,.25)' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L4 15.8V20Z" />
              <path d="m13.7 6.1 4.2 4.2" />
            </svg>
          </div>
          <h2 id="board-save-title">{edited ? '변경된 내용을 저장하시겠습니까?' : '게시글을 등록하시겠습니까?'}</h2>
          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#c0392b' }} role="alert">{error}</p>
          )}
        </div>
        <div className="board-delete-actions">
          <button type="button" className="pg-btn" onClick={onClose} disabled={saving}>취소</button>
          <button type="button" className="pg-btn primary" onClick={onConfirm} disabled={saving}>
            {saving ? '저장 중...' : edited ? '저장' : '등록'}
          </button>
        </div>
      </section>
    </div>
  );
}

// 글쓰기 드롭다운에서 선택 가능한 커뮤니티 구분 (탭과 1:1 대응)
const WRITE_CATEGORIES = [
  ['notice', '공지사항'],
  ['faq', 'FAQ'],
  ['research', 'CAPTCHA 연구'],
];

const WRITE_CATEGORY_LABELS = Object.fromEntries(WRITE_CATEGORIES);

function BoardWrite({ boardType = 'notice', initialPost, onCancel, onSubmit, onSectionChange }) {
  const isEditing = Boolean(initialPost);
  // section: 커뮤니티 구분 / pinned: 공지사항 내 '공지로 고정' 여부 (notice=고정, general=일반)
  const [section, setSection] = useState(
    initialPost ? (initialPost.type === 'general' ? 'notice' : initialPost.type) : boardType
  );
  const [pinned, setPinned] = useState(initialPost ? initialPost.type === 'notice' : false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryRef = useRef(null);
  const titleRef = useRef(null);
  const contentRef = useRef(null);
  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [content, setContent] = useState(initialPost ? (initialPost.content ?? '테스트입니다.') : '');
  const [validationErrors, setValidationErrors] = useState({ title: false, content: false });

  useEffect(() => {
    const closeCategory = (event) => {
      if (event.type === 'keydown') return;
      if (event.type === 'mousedown' && categoryRef.current?.contains(event.target)) return;
      setIsCategoryOpen(false);
    };

    document.addEventListener('mousedown', closeCategory);
    document.addEventListener('keydown', closeCategory);
    return () => {
      document.removeEventListener('mousedown', closeCategory);
      document.removeEventListener('keydown', closeCategory);
    };
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const errors = {
      title: !trimmedTitle,
      content: !trimmedContent,
    };
    setValidationErrors(errors);
    if (errors.title || errors.content) {
      if (errors.title) titleRef.current?.focus();
      else contentRef.current?.focus();
      return;
    }
    onSubmit({
      title: trimmedTitle,
      content: trimmedContent,
      board_type: section === 'notice' ? (pinned ? 'notice' : 'general') : section,
    });
  };

  return (
    <form className="board-write" onSubmit={handleSubmit} noValidate>
      <div className="board-write-fields">
        <div className="board-write-field board-write-category-field">
          <div className="board-write-select-wrap" ref={categoryRef}>
            <button
              type="button"
              className={`board-write-select-trigger${isCategoryOpen ? ' open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={isCategoryOpen}
              onClick={() => setIsCategoryOpen(open => !open)}
            >
              {WRITE_CATEGORY_LABELS[section]}
            </button>

            {isCategoryOpen && (
              <div className="board-write-select-menu" role="listbox" aria-label="게시글 분류">
                {WRITE_CATEGORIES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={section === value}
                    className={section === value ? 'selected' : ''}
                    onClick={() => { setSection(value); setIsCategoryOpen(false); onSectionChange?.(value); }}
                  >
                    <span>{label}</span>
                    {section === value && <b aria-hidden="true">✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {section === 'notice' && (
          <div className="board-write-field" style={{ padding: '14px 24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--ink-soft)', cursor: 'pointer', width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={pinned}
                onChange={e => setPinned(e.target.checked)}
                style={{ width: 16, height: 16, padding: 0, margin: 0, flexShrink: 0, accentColor: 'var(--orange)', cursor: 'pointer' }}
              />
              상단에 고정
            </label>
          </div>
        )}

        <div className={`board-write-field board-write-title-field${validationErrors.title ? ' has-error' : ''}`}>
          <input
            ref={titleRef}
            type="text"
            value={title}
            maxLength={100}
            aria-label="게시글 제목"
            placeholder={section === 'faq' ? '질문을 입력하세요' : '제목을 입력하세요'}
            aria-invalid={validationErrors.title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (validationErrors.title) {
                setValidationErrors(current => ({ ...current, title: false }));
              }
            }}
          />
          <small>{title.length}/100</small>
        </div>

        <div className={`board-write-field board-write-content-field${validationErrors.content ? ' has-error' : ''}`}>
          <textarea
            ref={contentRef}
            value={content}
            maxLength={3000}
            aria-label="게시글 내용"
            placeholder={section === 'faq' ? '답변을 입력하세요' : '내용을 입력하세요'}
            aria-invalid={validationErrors.content}
            onChange={(event) => {
              setContent(event.target.value);
              if (validationErrors.content) {
                setValidationErrors(current => ({ ...current, content: false }));
              }
            }}
          />
          <small>{content.length}/3000</small>
        </div>
      </div>

      {validationErrors.content && (
        <p className="board-write-below-error" role="alert">내용을 입력하세요</p>
      )}
      <div className="board-write-actions">
        <button type="button" className="pg-btn" onClick={onCancel}>취소</button>
        <button type="submit" className="pg-btn primary">{isEditing ? '수정' : '등록'}</button>
      </div>
    </form>
  );
}

function BoardSidebar({ tab, onChange }) {
  return (
    <aside className="board-sidebar">
      <h2>커뮤니티</h2>
      <nav aria-label="커뮤니티 메뉴">
        {BOARD_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default function BoardPage({ user = null }) {
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('notice');
  const [noticePage, setNoticePage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isWriting, setIsWriting] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [pendingSave, setPendingSave] = useState(null); // 저장 확인 대기 중인 글 데이터
  const [saving, setSaving] = useState(false);

  // DB에서 게시글 전체 로드 (공지/일반/FAQ/연구)
  const loadNotices = async () => {
    try {
      const { data } = await api.get('/boards');
      setPosts((data.notices || []).map(n => ({
        id: n.board_id,
        type: n.board_type,
        title: n.title,
        content: n.content,
        viewCount: n.view_count ?? 0,
        badge: n.board_type === 'notice' ? '공지' : n.board_type === 'general' ? '일반' : null,
        date: String(n.created_at).slice(0, 10),
      })));
    } catch {
      setPosts([]);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  // 공지(notice)는 목록 상단 고정, 그 외에는 최신순
  const notices = posts
    .filter(p => p.type === 'notice' || p.type === 'general')
    .sort((a, b) => {
      if ((a.type === 'notice') !== (b.type === 'notice')) return a.type === 'notice' ? -1 : 1;
      return b.id - a.id;
    });
  const faqPosts = posts.filter(p => p.type === 'faq');
  const researchPosts = posts.filter(p => p.type === 'research');
  
  const noticeNumberById = new Map(
    [...notices]
      .sort((a, b) => a.id - b.id)
      .map((post, index) => [post.id, index + 1])
  );
  const researchNumberById = new Map(
    [...researchPosts]
      .sort((a, b) => a.id - b.id)
      .map((post, index) => [post.id, index + 1])
  );
  // 상세 보기의 이전/다음 글은 해당 글이 속한 탭 목록 기준
  const detailList = selectedPost?.type === 'research' ? researchPosts : notices;

  useEffect(() => {
    if (selectedPost || isWriting) {
      document.querySelector('.page-overlay.active')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedPost, isWriting]);

  /* 페이지네이션 (공지사항·연구 탭 공용, 탭 전환 시 1페이지로 초기화) */
  const noticeSlice = notices.slice((noticePage - 1) * PAGE_SIZE, noticePage * PAGE_SIZE);
  const researchSlice = researchPosts.slice((noticePage - 1) * PAGE_SIZE, noticePage * PAGE_SIZE);
  const selectedIndex = selectedPost ? detailList.findIndex(post => post.id === selectedPost.id) : -1;
  const previousPost = selectedIndex > 0 ? detailList[selectedIndex - 1] : null;
  const nextPost = selectedIndex >= 0 && selectedIndex < detailList.length - 1 ? detailList[selectedIndex + 1] : null;

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setNoticePage(1);
    setSelectedPost(null);
    setIsWriting(false);
    setEditingPost(null);
    setSubmitError('');
  };

  // 폼 제출 → 바로 저장하지 않고 확인 모달을 띄움
  const requestSave = (payload) => {
    setSubmitError('');
    setPendingSave(payload);
  };

  const confirmSave = async () => {
    if (!pendingSave || saving) return;
    setSaving(true);
    setSubmitError('');
    try {
      if (editingPost) {
        await api.put(`/boards/${editingPost.id}`, pendingSave);
      } else {
        await api.post('/boards', pendingSave);
      }
      await loadNotices();
      setPendingSave(null);
      setEditingPost(null);
      setIsWriting(false);
      setSelectedPost(null);
      setNoticePage(1);
    } catch (err) {
      setSubmitError(err.response?.data?.detail || '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const closeSaveModal = () => {
    setPendingSave(null);
    setSubmitError('');
  };

  const deletePost = async (post) => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/boards/${post.id}`);
      await loadNotices();
      setSelectedPost(null);
      setDeleteTarget(null);
      setNoticePage(1);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || '삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDeleting(false);
    }
  };

  // 상세보기 열기: 조회수 +1 후 화면·목록에 반영
  const openPost = (post) => {
    setSelectedPost(post);
    api.post(`/boards/${post.id}/view`)
      .then(({ data }) => {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, viewCount: data.view_count } : p)));
        setSelectedPost((prev) => (prev && prev.id === post.id ? { ...prev, viewCount: data.view_count } : prev));
      })
      .catch(() => { /* 조회수 반영 실패는 열람을 막지 않음 */ });
  };

  const openDeleteModal = (post) => {
    setDeleteError('');
    setDeleteTarget(post);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteError('');
  };

  if (selectedPost || isWriting) {
    return (
      <>
        <div className="board-page-shell">
        <main className="board-page-main">
          <div className="po-body board-layout">
            <BoardSidebar tab={tab} onChange={changeTab} />

            <section className="board-main-content" aria-labelledby="board-section-title">
              <div className="board-section-header">
                <h1 className="pg-h1" id="board-section-title">
                  {isWriting ? (editingPost ? '글 수정' : '글쓰기') : TAB_LABELS[tab]}
                </h1>
              </div>

              {isWriting ? (
                <BoardWrite
                  boardType={tab}
                  initialPost={editingPost}
                  onCancel={() => { setIsWriting(false); setEditingPost(null); setSubmitError(''); }}
                  onSubmit={requestSave}
                  onSectionChange={(section) => { setTab(section); setNoticePage(1); }}
                />
              ) : (
                <BoardDetail
                  post={selectedPost}
                  previousPost={previousPost}
                  nextPost={nextPost}
                  onBack={() => setSelectedPost(null)}
                  onSelectPost={openPost}
                  onEdit={() => { setEditingPost(selectedPost); setIsWriting(true); }}
                  onDelete={() => openDeleteModal(selectedPost)}
                  canEdit={isAdmin}
                />
              )}
            </section>
          </div>
        </main>
        </div>
        {deleteTarget && (
          <DeletePostModal
            deleting={deleting}
            error={deleteError}
            onConfirm={() => deletePost(deleteTarget)}
            onClose={closeDeleteModal}
          />
        )}
        {pendingSave && (
          <SaveConfirmModal
            edited={Boolean(editingPost)}
            saving={saving}
            error={submitError}
            onConfirm={confirmSave}
            onClose={closeSaveModal}
          />
        )}
      </>
    );
  }

  return (
    <div className="po-body">
      <h1 className="pg-h1">{TAB_LABELS[tab]}</h1>

      <div className="tab-bar">
        {BOARD_TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => changeTab(id)}>{label}</button>
        ))}
      </div>

      {/* 공지사항 */}
      {tab === 'notice' && (
        <>
          <table className="pg-table board-table" style={{ marginBottom: 8 }}>
            <thead>
            <tr><th style={{ width: 60, textAlign: 'center' }}>번호</th><th>제목</th><th style={{ width: 130, textAlign: 'right' }}>작성일</th></tr>
            </thead>
            <tbody>
              {noticeSlice.map(n => (
                <tr
                  key={n.id}
                  className="board-row"
                  role="link"
                  tabIndex={0}
                  aria-label={`${n.title} 상세 보기`}
                  onClick={() => openPost(n)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPost(n);
                    }
                  }}
                >
                  <td className="num" style={{ textAlign: 'center' }}>{noticeNumberById.get(n.id)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {n.badge && (
                        <span className={`badge-notice${n.type === 'general' ? ' badge-general' : ''}`} style={{ verticalAlign: 'middle' }}>
                          {n.badge}
                        </span>
                      )}
                      <span>{n.title}</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', textAlign: 'right' }}>{n.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="board-list-footer">
            <div className="board-list-pagination">
              <Pagination total={notices.length} page={noticePage} pageSize={PAGE_SIZE} onChange={setNoticePage} />
            </div>
            {isAdmin && (
              <button
                type="button"
                className="pg-btn primary board-write-button"
                onClick={() => { setEditingPost(null); setIsWriting(true); }}
              >
                글쓰기
              </button>
            )}
          </div>
        </>
      )}

      {/* FAQ */}
      {tab === 'faq' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqPosts.map(p => (
              <details key={p.id} className="pg-card board-faq-card">
                <summary className="board-faq-summary">
                  <span className="board-faq-title">
                    <span className="badge-notice badge-faq">FAQ</span>
                    <span>{p.title}</span>
                  </span>
                  <span className="board-faq-toggle">+</span>
                </summary>
                <p className="board-faq-content">{p.content}</p>
                {isAdmin && (
                  <div className="board-faq-admin-actions">
                    <button
                      type="button"
                      className="pg-btn"
                      style={{ padding: '6px 12px', fontSize: 12.5 }}
                      onClick={(e) => { e.preventDefault(); setEditingPost(p); setIsWriting(true); }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="pg-btn"
                      style={{ padding: '6px 12px', fontSize: 12.5, color: '#c0392b' }}
                      onClick={(e) => { e.preventDefault(); openDeleteModal(p); }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </details>
            ))}
          </div>
          {isAdmin && (
            <div className="board-list-footer">
              <div className="board-list-pagination" />
              <button
                type="button"
                className="pg-btn primary board-write-button"
                onClick={() => { setEditingPost(null); setIsWriting(true); }}
              >
                글쓰기
              </button>
            </div>
          )}
        </>
      )}

      {/* CAPTCHA 연구 */}
      {tab === 'research' && (
        <>
          <table className="pg-table board-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr><th style={{ width: 60, textAlign: 'center' }}>번호</th><th>제목</th><th style={{ width: 130, textAlign: 'right' }}>작성일</th></tr>
            </thead>
            <tbody>
              {researchSlice.map(r => (
                <tr
                  key={r.id}
                  className="board-row"
                  role="link"
                  tabIndex={0}
                  aria-label={`${r.title} 상세 보기`}
                  onClick={() => openPost(r)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPost(r);
                    }
                  }}
                >
                  <td className="num" style={{ textAlign: 'center' }}>{researchNumberById.get(r.id)}</td>
                  <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge-notice badge-research" style={{ verticalAlign: 'middle' }}>연구</span>
                    <span>{r.title}</span>
                  </span>
                </td>
                  <td style={{ color: 'var(--muted)', textAlign: 'right' }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="board-list-footer">
            <div className="board-list-pagination">
              <Pagination total={researchPosts.length} page={noticePage} pageSize={PAGE_SIZE} onChange={setNoticePage} />
            </div>
            {isAdmin && (
              <button
                type="button"
                className="pg-btn primary board-write-button"
                onClick={() => { setEditingPost(null); setIsWriting(true); }}
              >
                글쓰기
              </button>
            )}
          </div>
        </>
      )}

      {/* 목록 화면(FAQ 탭 등)에서의 삭제 확인 모달 */}
      {deleteTarget && (
        <DeletePostModal
          deleting={deleting}
          error={deleteError}
          onConfirm={() => deletePost(deleteTarget)}
          onClose={closeDeleteModal}
        />
      )}
      {pendingSave && (
        <SaveConfirmModal
          edited={Boolean(editingPost)}
          saving={saving}
          error={submitError}
          onConfirm={confirmSave}
          onClose={closeSaveModal}
        />
      )}
    </div>
  );
}