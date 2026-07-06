import React, { useEffect, useRef, useState } from 'react';
import api from '../api/axios';

const PAGE_SIZE = 10;

const FAQS = [
  ['API Key는 어떻게 발급받나요?', '이용 신청 페이지에서 요금제를 선택하고 신청하면 자동으로 API Key가 발급됩니다. 마이페이지 > API Key 관리에서도 확인할 수 있습니다.'],
  ['CAPTCHA 통과율이 낮으면 어떻게 하나요?', '유형 2(드래그) 실패 시 유형 1(4지선다)로 자동 전환됩니다. 사용자 피로도를 최소화하는 폴백 구조입니다.'],
  ['one-time token의 유효 시간은 얼마인가요?', '기본 180초(3분)입니다. 재사용이 불가능하며 만료 시 CAPTCHA를 다시 풀어야 합니다.'],
  ['React/Vue 위젯은 지원하나요?', '네, SDK 플러그인 형태로 React, Vue, FastAPI, Node.js, Django 등을 지원합니다.'],
];

const RESEARCH = [
  { id: 3, title: 'ASCII 아트 CAPTCHA — 인간 정답률 vs VLM 인식률 비교 리포트', date: '2026-05-20' },
  { id: 2, title: '드래그 궤적 기반 봇 탐지 알고리즘 설계 노트', date: '2026-04-30' },
  { id: 1, title: 'ImageNet 8-class 전이학습 결과 요약', date: '2026-04-10' },
];

const BOARD_TABS = [
  ['notice', '공지사항'],
  ['faq', 'FAQ'],
  ['research', 'CAPTCHA 연구'],
];

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
            <span className="board-detail-views">조회 : {120 + post.id * 17}</span>
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

function BoardWrite({ initialPost, onCancel, onSubmit }) {
  const isEditing = Boolean(initialPost);
  const [category, setCategory] = useState(
    initialPost ? (initialPost.badge ? 'notice' : 'general') : 'notice'
  );
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryRef = useRef(null);
  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [content, setContent] = useState(initialPost ? (initialPost.content ?? '테스트입니다.') : '');

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
    if (!trimmedTitle || !trimmedContent) return;
    onSubmit({
      title: trimmedTitle,
      content: trimmedContent,
      badge: category === 'notice' ? '공지' : null,
    });
  };

  return (
    <form className="board-write" onSubmit={handleSubmit}>
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
              {category === 'notice' ? '공지' : '일반 글'}
            </button>

            {isCategoryOpen && (
              <div className="board-write-select-menu" role="listbox" aria-label="게시글 분류">
                {[
                  ['notice', '공지'],
                  ['general', '일반 글'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={category === value}
                    className={category === value ? 'selected' : ''}
                    onClick={() => { setCategory(value); setIsCategoryOpen(false); }}
                  >
                    <span>{label}</span>
                    {category === value && <b aria-hidden="true">✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="board-write-field board-write-title-field">
          <input
            type="text"
            value={title}
            maxLength={100}
            aria-label="게시글 제목"
            placeholder="제목을 입력하세요"
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <small>{title.length}/100</small>
        </div>

        <div className="board-write-field board-write-content-field">
          <textarea
            value={content}
            maxLength={3000}
            aria-label="게시글 내용"
            placeholder="내용을 입력하세요"
            onChange={(event) => setContent(event.target.value)}
            required
          />
          <small>{content.length}/3000</small>
        </div>
      </div>

      <div className="board-write-actions">
        <button type="button" className="pg-btn" onClick={onCancel}>취소</button>
        <button type="submit" className="pg-btn primary">{isEditing ? '수정 완료' : '등록'}</button>
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
  const [notices, setNotices] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isWriting, setIsWriting] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  // DB에서 공지사항 목록 로드
  const loadNotices = async () => {
    try {
      const { data } = await api.get('/boards');
      setNotices((data.notices || []).map(n => ({
        id: n.board_id,
        title: n.title,
        content: n.content,
        badge: '공지',
        date: String(n.created_at).slice(0, 10),
      })));
    } catch {
      setNotices([]);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  useEffect(() => {
    if (selectedPost || isWriting) {
      document.querySelector('.page-overlay.active')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedPost, isWriting]);

  /* 공지사항 페이지네이션 */
  const noticeSlice = notices.slice((noticePage - 1) * PAGE_SIZE, noticePage * PAGE_SIZE);
  const selectedIndex = selectedPost ? notices.findIndex(post => post.id === selectedPost.id) : -1;
  const previousPost = selectedIndex > 0 ? notices[selectedIndex - 1] : null;
  const nextPost = selectedIndex >= 0 && selectedIndex < notices.length - 1 ? notices[selectedIndex + 1] : null;

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setNoticePage(1);
    setSelectedPost(null);
    setIsWriting(false);
    setEditingPost(null);
  };

  const submitPost = async ({ title, content }) => {
    try {
      if (editingPost) {
        await api.put(`/boards/${editingPost.id}`, { title, content });
      } else {
        await api.post('/boards', { title, content });
      }
      await loadNotices();
      setEditingPost(null);
      setIsWriting(false);
      setSelectedPost(null);
      setNoticePage(1);
    } catch (err) {
      alert(err.response?.data?.detail || '저장 중 오류가 발생했습니다.');
    }
  };

  const deletePost = async (post) => {
    if (!window.confirm('이 공지사항을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/boards/${post.id}`);
      await loadNotices();
      setSelectedPost(null);
      setNoticePage(1);
    } catch (err) {
      alert(err.response?.data?.detail || '삭제 중 오류가 발생했습니다.');
    }
  };

  if (selectedPost || isWriting) {
    return (
      <div className="board-page-shell">
        <main className="board-page-main">
          <div className="po-body board-layout">
            <BoardSidebar tab={tab} onChange={changeTab} />

            <section className="board-main-content" aria-labelledby="board-section-title">
              <div className="board-section-header">
                <h1 className="pg-h1" id="board-section-title">
                  {isWriting ? (editingPost ? '글 수정' : '글쓰기') : '공지사항'}
                </h1>
              </div>

              {isWriting ? (
                <BoardWrite
                  initialPost={editingPost}
                  onCancel={() => { setIsWriting(false); setEditingPost(null); }}
                  onSubmit={submitPost}
                />
              ) : (
                <BoardDetail
                  post={selectedPost}
                  previousPost={previousPost}
                  nextPost={nextPost}
                  onBack={() => setSelectedPost(null)}
                  onSelectPost={setSelectedPost}
                  onEdit={() => { setEditingPost(selectedPost); setIsWriting(true); }}
                  onDelete={() => deletePost(selectedPost)}
                  canEdit={isAdmin}
                />
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="po-body">
      <h1 className="pg-h1">공지사항</h1>
      
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
              <tr><th style={{ width: 60 }}>번호</th><th>제목</th><th style={{ width: 130 }}>작성일</th></tr>
            </thead>
            <tbody>
              {noticeSlice.map(n => (
                <tr
                  key={n.id}
                  className="board-row"
                  role="link"
                  tabIndex={0}
                  aria-label={`${n.title} 상세 보기`}
                  onClick={() => setSelectedPost(n)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedPost(n);
                    }
                  }}
                >
                  <td className="num">{n.id}</td>
                  <td>
                    {n.badge && <span className="badge-notice">공지</span>}
                    {n.title}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{n.date}</td>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(([q, a], i) => (
            <details key={i} className="pg-card" style={{ cursor: 'pointer' }}>
              <summary style={{ fontWeight: 600, fontSize: 15, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                <span><span className="badge-notice badge-faq">FAQ</span>{q}</span>
                <span style={{ color: 'var(--orange)' }}>+</span>
              </summary>
              <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{a}</p>
            </details>
          ))}
        </div>
      )}

      {/* CAPTCHA 연구 */}
      {tab === 'research' && (
        <table className="pg-table board-table">
          <thead><tr><th style={{ width: 60 }}>번호</th><th>제목</th><th style={{ width: 130 }}>작성일</th></tr></thead>
          <tbody>
            {RESEARCH.map(r => (
              <tr key={r.id} style={{ cursor: 'pointer' }}>
                <td className="num">{r.id}</td>
                <td><span className="badge-notice badge-research">연구</span>{r.title}</td>
                <td style={{ color: 'var(--muted)' }}>{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
