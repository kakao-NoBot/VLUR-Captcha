// AdminPage.jsx

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';

const ADMIN_TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'users', label: '사용자 관리' },
  { id: 'sites', label: '사이트 관리' },
  { id: 'inquiries', label: '문의 관리' },
  { id: 'logs', label: '인증 로그' },
];

const USER_TYPE_TABS = [
  { id: 'personal', label: '일반 사용자' },
  { id: 'business', label: '기업/회사 사용자' },
];

const INQUIRY_TYPE_TABS = [
  { id: 'general', label: '일반 사용자 문의' },
  { id: 'business', label: '기업/회사 도입 문의' },
];

const INQUIRY_STATUS_OPTIONS = ['접수', '검토', '답변'];
const MANAGE_STATUS_OPTIONS = ['활성', '점검', '비활성'];
const USER_STATUS_OPTIONS = ['활성', '비활성'];

const INQUIRY_STATUS_TONE = {
  '접수': 'neutral',
  '검토': 'warning',
  '답변': 'success',
};

const DASHBOARD_STATS = [
  { label: '전체 사용자 수', value: '1,284', note: '일반/기업 계정 합산' },
  { label: '오늘 CAPTCHA 발급 수', value: '32,410', note: 'type1/type2 합산' },
  { label: '오늘 CAPTCHA 검증 수', value: '30,982', note: '성공/실패 포함' },
  { label: '평균 성공률', value: '96.8%', note: '최근 24시간 기준' },
  { label: '봇 차단률', value: '8.7%', note: 'drag trace 판별 기준' },
];

const MOCK_PERSONAL_USERS = [
  { name: '김민준', userId: 'minjun01', email: 'minjun@example.com', plan: 'Pro', joinedAt: '2026-06-02', status: '활성' },
  { name: '이지아', userId: 'jia-lab', email: 'jia@demo.co.kr', plan: 'Basic', joinedAt: '2026-06-10', status: '활성' },
  { name: '박서준', userId: 'seo-admin', email: 'seo@vlur.test', plan: 'Enterprise', joinedAt: '2026-06-18', status: '점검' },
  { name: '최하린', userId: 'harin77', email: 'harin@example.com', plan: 'Basic', joinedAt: '2026-06-24', status: '비활성' },
];

const MOCK_BUSINESS_USERS = [
  { company: 'VLUR Commerce', manager: '정다은', userId: 'vlur-commerce', email: 'ops@vlur-commerce.kr', plan: 'Enterprise', siteCount: 6, monthlyLimit: 500000, status: '활성' },
  { company: 'AI Study Lab', manager: '윤태오', userId: 'study-lab', email: 'admin@study.example.io', plan: 'Pro', siteCount: 3, monthlyLimit: 100000, status: '활성' },
  { company: 'Secure Board Inc.', manager: '한서연', userId: 'secure-board', email: 'contact@secureboard.kr', plan: 'Basic', siteCount: 1, monthlyLimit: 50000, status: '비활성' },
];

const MOCK_SITES = [
  { name: 'VLUR Demo Shop', domain: 'shop.vlur-demo.kr', owner: 'VLUR Commerce', plan: 'Enterprise', monthlyLimit: 500000, monthlyUsage: 312000, status: '활성', createdAt: '2026-06-03' },
  { name: 'AI Study Portal', domain: 'study.example.io', owner: 'AI Study Lab', plan: 'Pro', monthlyLimit: 100000, monthlyUsage: 68400, status: '활성', createdAt: '2026-06-12' },
  { name: 'Secure Board', domain: 'board.sample.kr', owner: 'Secure Board Inc.', plan: 'Basic', monthlyLimit: 50000, monthlyUsage: 12850, status: '비활성', createdAt: '2026-06-21' },
];

const INQUIRY_STATUS_BACKEND_TO_LABEL = {
  new: '접수',
  in_progress: '검토',
  done: '답변',
  spam: '접수',
};

const USER_STATUS_BACKEND_TO_LABEL = {
  active: '활성',
  suspended: '비활성',
  inactive: '비활성',
};

const USER_STATUS_LABEL_TO_BACKEND = {
  '활성': 'active',
  '비활성': 'inactive',
};

const SOCIAL_PROVIDER_LABEL = {
  kakao: 'kakao',
  naver: 'NAVER',
  google: 'Google',
};

function getSocialProvider(userId) {
  return Object.keys(SOCIAL_PROVIDER_LABEL).find((provider) => (
    userId.startsWith(`${provider}_`)
  )) || null;
}

function SocialProviderLogo({ provider }) {
  return <span>{SOCIAL_PROVIDER_LABEL[provider]}</span>;
}

function mapAdminUser(row) {
  const shared = {
    internalId: row.user_id,
    userId: row.user_id,
    socialProvider: getSocialProvider(row.user_id),
    email: row.email,
    plan: row.plan_name || '미가입',
    joinedAt: row.created_at ? String(row.created_at).slice(0, 10) : '-',
    status: USER_STATUS_BACKEND_TO_LABEL[row.user_status] || '비활성',
    apiKey: row.masked_api_key || '미발급',
  };

  if (row.company_name) {
    return {
      ...shared,
      isBusiness: true,
      company: row.company_name,
      manager: row.contact_name || row.user_name,
      siteCount: Number(row.site_count || 0),
      monthlyLimit: Number(row.api_limit || 0),
    };
  }

  return { ...shared, isBusiness: false, name: row.user_name };
}

function mapInquiry(row) {
  const shared = {
    id: row.inquiry_id,
    email: row.email,
    message: row.message,
    receivedAt: row.created_at ? String(row.created_at).slice(0, 10) : '',
    status: INQUIRY_STATUS_BACKEND_TO_LABEL[row.inquiry_status] || '접수',
  };
  if (row.inquiry_type === 'enterprise') {
    return {
      ...shared,
      company: row.company,
      manager: row.contact_name,
      phone: row.phone,
      estimatedCalls: row.plan_interest,
    };
  }
  return {
    ...shared,
    requester: row.contact_name,
    type: row.plan_interest,
  };
}

const SCORE_BREAKDOWN = [
  { label: '드래그 궤적 자연스러움', score: 18, max: 30 },
  { label: '이동 속도 변화', score: 12, max: 20 },
  { label: '반응 시간', score: 15, max: 20 },
  { label: '실패 횟수', score: 10, max: 15 },
  { label: '정답 위치 정확도', score: 8, max: 10 },
  { label: '반복 패턴', score: 9, max: 10 },
];

const MOCK_LOGS = [
  { time: '2026-07-03 09:42', site: 'VLUR Demo Shop', captchaType: 'type1_drag', result: '성공', duration: '1.8초', botScore: 8 },
  { time: '2026-07-03 09:38', site: 'AI Study Portal', captchaType: 'type2_identify', result: '성공', duration: '2.7초', botScore: 21 },
  { time: '2026-07-03 09:34', site: 'VLUR Demo Shop', captchaType: 'type1_drag', result: '의심', duration: '0.9초', botScore: 72 },
  { time: '2026-07-03 09:29', site: 'Secure Board', captchaType: 'type1_drag', result: '실패', duration: '4.2초', botScore: 58 },
  { time: '2026-07-03 09:21', site: 'AI Study Portal', captchaType: 'type2_identify', result: '실패', duration: '3.4초', botScore: 43 },
 ];

const PLAN_USAGE = [
  { plan: 'Basic', accounts: 812, used: 182000, limit: 300000 },
  { plan: 'Pro', accounts: 386, used: 684000, limit: 900000 },
  { plan: 'Enterprise', accounts: 86, used: 1120000, limit: 1500000 },
];

const BOT_BLOCK_TREND = [
  { label: '6/27', value: 6.8 },
  { label: '6/28', value: 7.4 },
  { label: '6/29', value: 6.9 },
  { label: '6/30', value: 8.1 },
  { label: '7/1', value: 8.5 },
  { label: '7/2', value: 8.2 },
  { label: '7/3', value: 8.7 },
];

function getStatusTone(status) {
  if (status === '활성' || status === '성공' || status === '정상' || status === '답변') return 'success';
  if (status === '의심' || status === '점검' || status === '검토') return 'warning';
  if (status === '실패' || status === '비활성') return 'danger';
  return 'neutral';
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatUsage(used, limit) {
  return `${formatNumber(used)} / ${formatNumber(limit)}`;
}

function getPercent(used, limit) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/* ── 상태 뱃지 (읽기 전용: 모달, 인증 로그 결과 등) ── */
const STATUS_TONE_STYLE = {
  success: { color: '#1f8a54', background: 'rgba(46,163,107,0.14)', dot: '#2ea36b', glow: 'rgba(46,163,107,.25)', textDark: '#c9f2dd' },
  warning: { color: '#a5720f', background: 'rgba(224,165,44,0.16)', dot: '#e0a52c', glow: 'rgba(224,165,44,.25)', textDark: '#fbe3ae' },
  danger:  { color: '#c0392b', background: 'rgba(192,57,43,0.13)', dot: '#c0392b', glow: 'rgba(192,57,43,.25)', textDark: '#f6cac4' },
  neutral: { color: 'var(--ink-soft)', background: 'rgba(60,45,32,0.06)', dot: 'var(--muted)', glow: 'rgba(146,128,113,.25)', textDark: '#e4ddd5' },
};

function StatusBadge({ children, tone = 'neutral', style }) {
  const s = STATUS_TONE_STYLE[tone] || STATUS_TONE_STYLE.neutral;
  return (
    <span
      className="admin-glow-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 46, width: 'fit-content', padding: '4px 10px', borderRadius: 999,
        fontSize: 12, fontWeight: 700, color: s.color, background: s.background,
        whiteSpace: 'nowrap',
        '--status-glow': s.glow,
        '--status-text-dark': s.textDark,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── 상태 변경 드롭다운 (문의/로그/사용자/사이트 공용, Portal 렌더링) ── */
function StatusDropdown({ status, options, isOpen, onToggle, onSelect, resolveTone = getStatusTone, minWidth = 46 }) {
  const triggerRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 130) });
    }
  }, [isOpen]);

  const tone = resolveTone(status);
  const s = STATUS_TONE_STYLE[tone] || STATUS_TONE_STYLE.neutral;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="상태 변경"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        className="admin-glow-badge"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minWidth, padding: '4px 10px', borderRadius: 999,
          border: isOpen ? `1px solid ${s.dot}` : '1px solid transparent',
          fontSize: 12, fontWeight: 700, color: s.color, background: s.background,
          cursor: 'pointer', whiteSpace: 'nowrap',
          '--status-glow': s.glow,
          '--status-text-dark': s.textDark,
        }}
      >
        <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span>
        {status}
      </button>

      {isOpen && menuPos && createPortal(
        <div
          role="menu"
          aria-label="상태 선택"
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 1000,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            boxShadow: '0 12px 28px rgba(36,27,21,.14)', padding: 6, minWidth: 120,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {options.map((option) => {
            const selected = status === option;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={(event) => { event.stopPropagation(); onSelect(option); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', padding: '8px 12px', border: 'none', borderRadius: 8,
                  background: selected ? 'var(--peach)' : 'transparent',
                  cursor: 'pointer', fontSize: 13, fontWeight: selected ? 700 : 500, color: 'var(--ink)',
                }}
              >
                <span>{option}</span>
                {selected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: 'var(--orange)' }}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── 봇 차단 추이 꺾은선 그래프 (순수 SVG, 외부 라이브러리 불필요) ── */
function BotTrendChart({ data }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = 640;
  const height = 160;
  const paddingX = 24;
  const paddingY = 28;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = paddingX + (i * (width - paddingX * 2)) / (data.length - 1);
    const y = paddingY + (height - paddingY * 2) * (1 - (d.value - min) / range);
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${height - paddingY} L${points[0].x},${height - paddingY} Z`;
  const slotWidth = (width - paddingX * 2) / (data.length - 1 || 1);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height + 22}`}
        width="100%"
        style={{ display: 'block', minWidth: 480 }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="botTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#botTrendFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--orange)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        {hovered && (
          <line
            x1={hovered.x} y1={paddingY - 8} x2={hovered.x} y2={height - paddingY}
            stroke="var(--orange)" strokeWidth="1" strokeOpacity="0.35"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={`${p.label}-dot`}
            cx={p.x} cy={p.y}
            r={hoverIndex === i ? 5.5 : 4}
            fill="var(--card)" stroke="var(--orange)" strokeWidth="2.5"
          />
        ))}
        {/* 값 라벨은 커서를 올린 지점만 표시 */}
        {hovered && (
          <text x={hovered.x} y={hovered.y - 14} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
            {hovered.value}%
          </text>
        )}
        {points.map((p, i) => (
          <text
            key={`${p.label}-lab`}
            x={p.x} y={height + 14} textAnchor="middle" fontSize="11"
            fontWeight={hoverIndex === i ? 700 : 400}
            fill={hoverIndex === i ? 'var(--ink)' : 'var(--muted)'}
          >
            {p.label}
          </text>
        ))}
        {/* 호버 감지용 투명 슬롯 */}
        {points.map((p, i) => (
          <rect
            key={`${p.label}-hit`}
            x={p.x - slotWidth / 2} y={0}
            width={slotWidth} height={height + 22}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}
      </svg>
    </div>
  );
}

/* ── 검색창 (아이콘 + 알약형, 축소 버전) ── */
function AdminSearchInput({ value, onChange, placeholder, ariaLabel }) {
  return (
    <div style={{ position: 'relative', minWidth: 190, maxWidth: 220 }}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={13}
        height={13}
        style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        className="pg-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          paddingLeft: 30,
          paddingTop: 6,
          paddingBottom: 6,
          paddingRight: 10,
          fontSize: 13,
          borderRadius: 999,
          border: '1px solid var(--line)',
          background: 'var(--card)',
          boxShadow: '0 1px 2px rgba(36,27,21,.05)',
          width: '100%',
        }}
      />
    </div>
  );
}

function AdminTable({ columns, rows, emptyMessage, wrapperClassName = '', tableClassName = '', tableStyle, wrapperStyle }) {
return (
    <div
      className={`admin-table-wrap admin-scroll-x${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      style={{ marginTop: 0, ...wrapperStyle }}
    >
      <table
        className={`admin-table${tableClassName ? ` ${tableClassName}` : ''}`}
        style={tableStyle}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows : (
            <tr>
              <td colSpan={columns.length} className="admin-empty-cell">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UsageMeter({ used, limit }) {
  const percent = getPercent(used, limit);
  return (
    <div className="admin-usage-meter">
      <div className="admin-usage-meter-text">
        <span>{formatUsage(used, limit)}</span>
        <b>{percent}%</b>
      </div>
      <div className="admin-progress" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ScoreGauge({ score, max = 100 }) {
  const percent = Math.min(100, Math.max(0, (score / max) * 100));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  const color = percent >= 60 ? '#c0392b' : percent >= 30 ? '#e0a52c' : '#2ea36b';

  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <strong style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{score}</strong>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>/ 100점</span>
      </div>
    </div>
  );
}

/* ── AdminModalShell: PrivacyModal.jsx와 완전히 동일한 셸 디자인 ── */
function AdminModalShell({ eyebrow, title, onClose, children, footer, labelledBy }) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px', borderBottom: '1px solid var(--line-soft)', flexShrink: 0,
        }}>
          <div>
            {eyebrow && (
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--muted)',
                textTransform: 'uppercase', margin: '0 0 4px',
              }}>{eyebrow}</p>
            )}
            <h2 id={labelledBy} style={{
              margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--disp)', letterSpacing: '-.01em',
            }}>{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div className="admin-modal-scroll" style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '16px 28px', borderTop: '1px solid var(--line-soft)',
            display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}

function ScoreDetailModal({ log, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!log) return null;

  return (
    <AdminModalShell
      eyebrow="BOT SCORE DETAIL"
      title="봇 점수 채점표"
      onClose={onClose}
      labelledBy="admin-score-title"
      footer={<button type="button" className="btn btn-primary" onClick={onClose} style={{ fontSize: 14, padding: '9px 22px' }}>확인</button>}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        background: 'var(--paper)', borderRadius: 16, padding: '20px 22px', marginBottom: 22,
      }}>
        <ScoreGauge score={log.botScore} />
        <div>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>판정 결과</span>
          <div style={{ marginTop: 6 }}>
            <StatusBadge tone={getStatusTone(log.result)}>{log.result}</StatusBadge>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            점수가 높을수록 봇 의심 가능성이 높습니다.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {SCORE_BREAKDOWN.map((item) => {
          const percent = getPercent(item.score, item.max);
          return (
            <div key={item.label} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{item.label}</span>
                <b style={{ color: 'var(--orange-2)' }}>{item.score} / {item.max}</b>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  width: `${percent}%`, height: '100%',
                  background: 'linear-gradient(90deg, var(--gold), var(--orange))',
                  borderRadius: 999,
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
        <span>{log.time}</span>
        <span>·</span>
        <span>{log.site}</span>
        <span>·</span>
        <span>{log.captchaType}</span>
      </div>
    </AdminModalShell>
  );
}

function InquiryDetailModal({ detail, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!detail) return null;

  const { type, inquiry } = detail;
  const isBusiness = type === 'business';
  const title = isBusiness ? '기업/회사 도입 문의 상세' : '일반 사용자 문의 상세';
  const rows = isBusiness
    ? [
      ['문의 구분', '기업/회사 도입 문의'],
      ['회사/서비스명', inquiry.company],
      ['담당자명', inquiry.manager],
      ['전화번호', inquiry.phone],
      ['이메일', inquiry.email],
      ['예상 월 호출량', inquiry.estimatedCalls],
      ['접수일', inquiry.receivedAt],
      ['상태', inquiry.status],
    ]
    : [
      ['문의 구분', '일반 사용자 문의'],
      ['이름', inquiry.requester],
      ['회신 이메일', inquiry.email],
      ['문의 유형', inquiry.type],
      ['접수일', inquiry.receivedAt],
      ['상태', inquiry.status],
    ];

  return (
    <AdminModalShell
      eyebrow="INQUIRY DETAIL"
      title={title}
      onClose={onClose}
      labelledBy="admin-inquiry-detail-title"
      footer={<button type="button" className="btn btn-primary" onClick={onClose} style={{ fontSize: 14, padding: '9px 22px' }}>확인</button>}
    >
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)',
          }}>
            <dt style={{ margin: 0, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 14, color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>
              {label === '상태' ? (
                <StatusBadge tone={getStatusTone(value)}>{value}</StatusBadge>
              ) : value}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>문의 내용</span>
        <p style={{
          margin: '8px 0 0', fontSize: 14, color: 'var(--ink)', lineHeight: 1.6,
          background: 'var(--paper)', borderRadius: 12, padding: '14px 16px',
        }}>
          {inquiry.message}
        </p>
      </div>
    </AdminModalShell>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeUserType, setActiveUserType] = useState('personal');
  const [userSearch, setUserSearch] = useState('');
  const [activeInquiryType, setActiveInquiryType] = useState('general');
  const [inquirySearch, setInquirySearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [generalInquiries, setGeneralInquiries] = useState([]);
  const [businessInquiries, setBusinessInquiries] = useState([]);
  const [personalUsers, setPersonalUsers] = useState([]);
  const [businessUsers, setBusinessUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [sites, setSites] = useState(MOCK_SITES);
  const [logs, setLogs] = useState(MOCK_LOGS);
  const [selectedScoreLog, setSelectedScoreLog] = useState(null);
  const [selectedInquiryDetail, setSelectedInquiryDetail] = useState(null);
  const [openStatusMenu, setOpenStatusMenu] = useState(null);

  const activeUsers = activeUserType === 'personal' ? personalUsers : businessUsers;
  const activeInquiries = activeInquiryType === 'general' ? generalInquiries : businessInquiries;

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const { data } = await api.get('/admin/inquiries');
        const inquiries = data.inquiries || [];
        if (ignore) return;
        setGeneralInquiries(inquiries.filter((row) => row.inquiry_type !== 'enterprise').map(mapInquiry));
        setBusinessInquiries(inquiries.filter((row) => row.inquiry_type === 'enterprise').map(mapInquiry));
      } catch {
        if (!ignore) {
          setGeneralInquiries([]);
          setBusinessInquiries([]);
        }
      }
    })();

    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const { data } = await api.get('/admin/api-keys');
        if (ignore) return;
        const users = (data.users || []).map(mapAdminUser);
        setPersonalUsers(users.filter((user) => !user.isBusiness));
        setBusinessUsers(users.filter((user) => user.isBusiness));
        setUsersError('');
      } catch (err) {
        if (!ignore) {
          setPersonalUsers([]);
          setBusinessUsers([]);
          setUsersError(err.response?.data?.detail || '사용자와 API Key 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (!ignore) setUsersLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return activeUsers;

    if (USER_STATUS_OPTIONS.some((status) => status.toLowerCase() === query)) {
      return activeUsers.filter(
        (user) => user.status.toLowerCase() === query
      );
    }

    return activeUsers.filter((user) =>
      Object.values(user).some((value) =>
        String(value).toLowerCase().includes(query)
      )
    );
  }, [activeUsers, userSearch]);

  const filteredInquiries = useMemo(() => {
    const query = inquirySearch.trim().toLowerCase();
    if (!query) return activeInquiries;

    const searchFields = activeInquiryType === 'general'
      ? ['requester', 'email', 'type', 'message']
      : ['company', 'manager', 'phone', 'email', 'estimatedCalls', 'message'];

    return activeInquiries.filter((inquiry) => (
      searchFields.some((field) => String(inquiry[field] || '').toLowerCase().includes(query))
    ));
  }, [activeInquiries, activeInquiryType, inquirySearch]);

  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) => (
      Object.values(site).some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [sites, siteSearch]);

  const filteredLogs = useMemo(() => {
    const query = logSearch.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((log) => (
      Object.values(log).some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [logs, logSearch]);

  useEffect(() => {
    if (!openStatusMenu) return undefined;

    const closeStatusMenu = () => setOpenStatusMenu(null);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeStatusMenu();
    };

    document.addEventListener('click', closeStatusMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', closeStatusMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openStatusMenu]);

  const updateInquiryStatus = (type, key, nextStatus) => {
    const updater = (inquiries) => inquiries.map((inquiry) => (
      inquiry.id === key ? { ...inquiry, status: nextStatus } : inquiry
    ));

    if (type === 'general') {
      setGeneralInquiries(updater);
      return;
    }

    setBusinessInquiries(updater);
  };

  const updateUserStatus = async (type, internalId, nextStatus) => {
    const backendStatus = USER_STATUS_LABEL_TO_BACKEND[nextStatus];
    if (!backendStatus) return;

    const setUsers = type === 'personal' ? setPersonalUsers : setBusinessUsers;
    const applyStatus = (users) => users.map((user) => (
      user.internalId === internalId ? { ...user, status: nextStatus } : user
    ));

    // 낙관적 업데이트: 먼저 화면에 반영하고, 실패하면 되돌린다.
    let previousStatus = null;
    setUsers((users) => users.map((user) => {
      if (user.internalId === internalId) previousStatus = user.status;
      return user;
    }));
    setUsers(applyStatus);
    setUsersError('');

    try {
      await api.patch(`/admin/users/${internalId}/status`, { status: backendStatus });
    } catch (err) {
      // 실패 시 원래 상태로 롤백
      setUsers((users) => users.map((user) => (
        user.internalId === internalId ? { ...user, status: previousStatus ?? user.status } : user
      )));
      setUsersError(err.response?.data?.detail || '사용자 상태를 변경하지 못했습니다.');
    }
  };

  const updateSiteStatus = (domain, nextStatus) => {
    setSites((prev) => prev.map((site) => (
      site.domain === domain ? { ...site, status: nextStatus } : site
    )));
  };

  return (
    <main className="po-body admin-page">
      <style>{`
        .admin-scroll-x {
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--line) transparent;
        }
        .admin-scroll-x::-webkit-scrollbar { height: 6px; }
        .admin-scroll-x::-webkit-scrollbar-track { background: transparent; }
        .admin-scroll-x::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
        .admin-scroll-x::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        .admin-table th,
        .admin-table td {
          text-align: center;
        }
        .admin-readable-table {
          table-layout: auto;
          width: max-content;
          min-width: 100%;
        }
         .admin-readable-table th,
         .admin-readable-table td {
           white-space: nowrap;
           padding-left: 16px;
           padding-right: 16px;
         }
        .admin-modal-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--line) transparent;
        }
        .admin-modal-scroll::-webkit-scrollbar { width: 6px; }
        .admin-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .admin-modal-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
        .admin-modal-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted); }

        /* ── 다크모드: admin-* 전용 클래스는 기존 CSS가 색을 하드코딩하고 있어서
           라이트/다크 전환에 반응하지 않던 것들을 --card/--ink/--line 등 테마 변수로 강제 적용 ── */
        [data-theme="dark"] .admin-page {
          background: var(--bg, var(--paper)) !important;
          color: var(--ink) !important;
        }
        [data-theme="dark"] .admin-stat-card,
        [data-theme="dark"] .admin-overview-card,
        [data-theme="dark"] .admin-table-wrap,
        [data-theme="dark"] .admin-table,
        [data-theme="dark"] .admin-compact-log-row,
        [data-theme="dark"] .admin-plan-usage-row,
        [data-theme="dark"] .pg-card {
          background: var(--card) !important;
          border-color: var(--line) !important;
          color: var(--ink) !important;
        }
        [data-theme="dark"] .admin-stat-card span,
        [data-theme="dark"] .admin-stat-card small,
        [data-theme="dark"] .admin-card-head span,
        [data-theme="dark"] .admin-plan-usage-row span,
        [data-theme="dark"] .admin-usage-meter-text span,
        [data-theme="dark"] .admin-empty-cell {
          color: var(--muted) !important;
        }
        [data-theme="dark"] .admin-table thead th {
          background: var(--paper) !important;
          color: var(--muted) !important;
          border-color: var(--line) !important;
        }
        [data-theme="dark"] .admin-table tbody td {
          background: var(--card) !important;
          color: var(--ink) !important;
          border-color: var(--line) !important;
        }
        [data-theme="dark"] .admin-table tbody tr:hover td {
          background: var(--paper) !important;
        }
        [data-theme="dark"] .admin-segmented {
          border-bottom-color: var(--line) !important;
        }
        [data-theme="dark"] .admin-segmented button {
          color: var(--ink-soft) !important;
        }
        [data-theme="dark"] .admin-segmented button.active {
          color: var(--orange) !important;
          border-bottom-color: var(--orange) !important;
        }
        [data-theme="dark"] .admin-progress,
        [data-theme="dark"] .usage-bar-wrap {
          background: var(--line) !important;
        }
        [data-theme="dark"] .mp-sidebar {
          background: var(--card) !important;
          border-color: var(--line) !important;
        }
        [data-theme="dark"] .admin-glow-badge {
          color: var(--status-text-dark) !important;
          box-shadow: inset 0 0 0 1px var(--status-glow), 0 1px 6px -1px var(--status-glow);
        }

        /* 화면이 좁아져서 사이드바가 가로 탭바로 바뀔 때만 가운데 정렬 (넓은 화면은 그대로) */
        @media (max-width: 940px) {
          .admin-page .mp-sidebar {
            justify-content: center;
          }
        }
       `}</style>

      <section className="admin-hero">
      </section>

      <div className="mp-wrap" aria-label="관리자 기능">
        <div className="mp-sidebar" aria-label="관리자 메뉴">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`mp-nav-item${activeTab === tab.id ? ' active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-content">
          {activeTab === 'dashboard' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">대시보드</h2>
                </div>
              </div>

              <div className="admin-stat-grid">
                {DASHBOARD_STATS.map((stat) => (
                  <article className="admin-stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong style={{
                      fontSize: 30, fontWeight: 800,
                      letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.15,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </article>
                ))}
              </div>

              <div className="admin-dashboard-grid">
                <div className="admin-overview-card admin-overview-card-wide" aria-labelledby="admin-recent-log-title">
                  <div className="admin-card-head">
                    <h3 id="admin-recent-log-title" className="pg-h3">최근 인증 로그</h3>
                    <span>최근 5건</span>
                  </div>
                  <div className="admin-compact-log-list">
                    {logs.slice(0, 5).map((log) => {
                      return (
                        <div
                          className="admin-compact-log-row"
                          key={`${log.time}-${log.site}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedScoreLog(log)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedScoreLog(log);
                            }
                          }}
                          style={{
                            cursor: 'pointer',
                            display: 'grid',
                            gridTemplateColumns: '52px 1fr 100px 56px',
                            alignItems: 'center',
                            justifyItems: 'start',
                            gap: 12,
                          }}
                        >
                          <span>{log.time.slice(11)}</span>
                          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.site}</b>
                          <StatusBadge tone={getStatusTone(log.result)} style={{ justifySelf: 'start' }}>{log.result}</StatusBadge>
                          <span style={{ color: 'var(--orange-2)', fontWeight: 700, textAlign: 'right' }}>{log.botScore}점</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <section className="admin-overview-card" aria-labelledby="admin-plan-usage-title">
                  <div className="admin-card-head">
                    <h3 id="admin-plan-usage-title" className="pg-h3">요금제별 사용량</h3>
                    <span>월 호출량</span>
                  </div>
                  <div className="admin-plan-usage-list">
                    {PLAN_USAGE.map((plan) => (
                      <div className="admin-plan-usage-row" key={plan.plan}>
                        <div>
                          <b>{plan.plan}</b>
                          <span>{formatNumber(plan.accounts)}개 계정</span>
                        </div>
                        <UsageMeter used={plan.used} limit={plan.limit} />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-overview-card admin-overview-card-full" aria-labelledby="admin-bot-trend-title">
                  <div className="admin-card-head">
                    <h3 id="admin-bot-trend-title" className="pg-h3">봇 차단 추이</h3>
                    <span>최근 7일</span>
                  </div>
                  <BotTrendChart data={BOT_BLOCK_TREND} />
                </section>
              </div>
            </section>
          )}

          {activeTab === 'users' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">사용자 관리</h2>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 0, marginBottom: 13 }}>
                <div className="admin-segmented" aria-label="사용자 유형" style={{ marginTop: 0, marginBottom: 0 }}>
                  {USER_TYPE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={activeUserType === tab.id ? 'active' : ''}
                      onClick={() => setActiveUserType(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <AdminSearchInput
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="검색"
                  ariaLabel="사용자 검색"
                />
              </div>

              {usersError && <p style={{ color: 'var(--bad)', fontSize: 13, margin: '0 0 12px' }}>{usersError}</p>}

              {activeUserType === 'personal' ? (
                <AdminTable
                  columns={[
                    { key: 'name', label: '이름' },
                    { key: 'userId', label: '아이디' },
                    { key: 'email', label: '이메일' },
                    { key: 'plan', label: '요금제' },
                    { key: 'apiKey', label: 'API Key' },
                    { key: 'joinedAt', label: '가입일' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage={usersLoading ? '사용자 정보를 불러오는 중입니다.' : '검색 결과가 없습니다.'}
                  rows={filteredUsers.map((user) => {
                    const menuKey = `user-personal-${user.internalId}`;
                    return (
                      <tr key={user.internalId}>
                        <td>{user.name}</td>
                        <td>{user.socialProvider ? <SocialProviderLogo provider={user.socialProvider} /> : user.userId}</td>
                        <td>{user.email}</td>
                        <td>{user.plan}</td>
                        <td>
                          {user.apiKey === '미발급' ? (
                            user.apiKey
                          ) : (
                            <code className="admin-key-mask">{user.apiKey}</code>
                          )}
                        </td>
                        <td>{user.joinedAt}</td>
                        <td>
                          <StatusDropdown
                            status={user.status}
                            options={USER_STATUS_OPTIONS}
                            isOpen={openStatusMenu === menuKey}
                            onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                            onSelect={(option) => {
                              updateUserStatus('personal', user.internalId, option);
                              setOpenStatusMenu(null);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                />
              ) : (
                <AdminTable
                  columns={[
                    { key: 'company', label: '회사명' },
                    { key: 'manager', label: '담당자' },
                    { key: 'userId', label: '아이디' },
                    { key: 'email', label: '이메일' },
                    { key: 'plan', label: '요금제' },
                    { key: 'apiKey', label: 'API Key' },
                    { key: 'siteCount', label: '등록 사이트 수' },
                    { key: 'monthlyLimit', label: '월 호출 한도' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage={usersLoading ? '사용자 정보를 불러오는 중입니다.' : '검색 결과가 없습니다.'}
                  rows={filteredUsers.map((user) => {
                    const menuKey = `user-business-${user.internalId}`;
                    return (
                      <tr key={user.internalId}>
                        <td>{user.company}</td>
                        <td>{user.manager}</td>
                        <td>{user.socialProvider ? <SocialProviderLogo provider={user.socialProvider} /> : user.userId}</td>
                        <td>{user.email}</td>
                        <td>{user.plan}</td>
                        <td>
                          {user.apiKey === '미발급' ? (
                            user.apiKey
                          ) : (
                            <code className="admin-key-mask">{user.apiKey}</code>
                          )}
                        </td>
                        <td>{user.siteCount}</td>
                        <td>{formatNumber(user.monthlyLimit)}</td>
                        <td>
                          <StatusDropdown
                            status={user.status}
                            options={USER_STATUS_OPTIONS}
                            isOpen={openStatusMenu === menuKey}
                            onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                            onSelect={(option) => {
                              updateUserStatus('business', user.internalId, option);
                              setOpenStatusMenu(null);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                />
              )}
            </section>
          )}

          {activeTab === 'sites' && (
          <section>
            <div className="admin-section-head" style={{ marginBottom: 10 }}>
              <div>
                <h2 className="pg-h2">사이트 관리</h2>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 0, marginBottom: 13 }}>
                <AdminSearchInput
                  value={siteSearch}
                  onChange={(event) => setSiteSearch(event.target.value)}
                  placeholder="검색"
                  ariaLabel="사이트 검색"
                />
              </div>

              <AdminTable
                columns={[
                  { key: 'name', label: '사이트명' },
                  { key: 'domain', label: '도메인' },
                  { key: 'owner', label: '소유자' },
                  { key: 'plan', label: '요금제' },
                  { key: 'monthlyLimit', label: '월 호출 한도' },
                  { key: 'monthlyUsage', label: '이번 달 사용량' },
                  { key: 'status', label: '상태' },
                  { key: 'createdAt', label: '등록일' },
                ]}
                emptyMessage="검색 결과가 없습니다."
                rows={filteredSites.map((site) => {
                  const menuKey = `site-${site.domain}`;
                  return (
                    <tr key={site.domain}>
                      <td>{site.name}</td>
                      <td>{site.domain}</td>
                      <td>{site.owner}</td>
                      <td>{site.plan}</td>
                      <td>{formatNumber(site.monthlyLimit)}</td>
                      <td><UsageMeter used={site.monthlyUsage} limit={site.monthlyLimit} /></td>
                      <td>
                        <StatusDropdown
                          status={site.status}
                          options={MANAGE_STATUS_OPTIONS}
                          isOpen={openStatusMenu === menuKey}
                          onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                          onSelect={(option) => {
                            updateSiteStatus(site.domain, option);
                            setOpenStatusMenu(null);
                          }}
                        />
                      </td>
                      <td>{site.createdAt}</td>
                    </tr>
                  );
                })}
              />
            </section>
          )}

          {activeTab === 'inquiries' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">문의 관리</h2>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 0, marginBottom: 13 }}>
                <div className="admin-segmented" aria-label="문의 유형" style={{ marginTop: 0, marginBottom: 0 }}>
                  {INQUIRY_TYPE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={activeInquiryType === tab.id ? 'active' : ''}
                      onClick={() => setActiveInquiryType(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <AdminSearchInput
                  value={inquirySearch}
                  onChange={(event) => setInquirySearch(event.target.value)}
                  placeholder="검색"
                  ariaLabel="문의 검색"
                />
              </div>

              {activeInquiryType === 'general' ? (
                <AdminTable
                  wrapperClassName="admin-inquiry-table-wrap"
                  tableClassName="admin-readable-table admin-general-inquiry-table"
                  tableStyle={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }}
                  columns={[
                    { key: 'email', label: '회신 이메일' },
                    { key: 'requester', label: '이름' },
                    { key: 'type', label: '유형' },
                    { key: 'message', label: '문의 내용' },
                    { key: 'receivedAt', label: '접수일' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage="검색 결과가 없습니다."
                  rows={filteredInquiries.map((inquiry) => {
                    const menuKey = `general-${inquiry.id}`;
                    return (
                      <tr
                        key={inquiry.id}
                        className="admin-inquiry-row"
                        onClick={() => setSelectedInquiryDetail({ type: 'general', inquiry })}
                      >
                        <td className="admin-nowrap-cell" title={inquiry.email}>{inquiry.email}</td>
                        <td className="admin-ellipsis-cell" title={inquiry.requester}>{inquiry.requester}</td>
                        <td className="admin-nowrap-cell" title={inquiry.type}>{inquiry.type}</td>
                        <td className="admin-message-cell" title={inquiry.message}>
                          <span>{inquiry.message}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{inquiry.receivedAt}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <StatusDropdown
                            status={inquiry.status}
                            options={INQUIRY_STATUS_OPTIONS}
                            resolveTone={(status) => INQUIRY_STATUS_TONE[status] || 'neutral'}
                            isOpen={openStatusMenu === menuKey}
                            onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                            onSelect={(option) => {
                              updateInquiryStatus('general', inquiry.id, option);
                              setOpenStatusMenu(null);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                />
              ) : (
                <AdminTable
                  wrapperClassName="admin-inquiry-table-wrap"
                  tableClassName="admin-readable-table admin-business-inquiry-table"
                  tableStyle={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }}
                  columns={[
                    { key: 'company', label: '회사/서비스명' },
                    { key: 'manager', label: '담당자명' },
                    { key: 'phone', label: '전화번호' },
                    { key: 'email', label: '이메일' },
                    { key: 'estimatedCalls', label: '예상 월 호출량' },
                    { key: 'message', label: '문의 내용' },
                    { key: 'receivedAt', label: '접수일' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage="검색 결과가 없습니다."
                  rows={filteredInquiries.map((inquiry) => {
                    const menuKey = `business-${inquiry.id}`;
                    return (
                      <tr
                        key={inquiry.id}
                        className="admin-inquiry-row"
                        onClick={() => setSelectedInquiryDetail({ type: 'business', inquiry })}
                      >
                        <td className="admin-ellipsis-cell" title={inquiry.company}>{inquiry.company}</td>
                        <td className="admin-ellipsis-cell" title={inquiry.manager}>{inquiry.manager}</td>
                        <td className="admin-nowrap-cell" title={inquiry.phone}>{inquiry.phone}</td>
                        <td className="admin-nowrap-cell" title={inquiry.email}>{inquiry.email}</td>
                        <td className="admin-nowrap-cell" title={inquiry.estimatedCalls}>{inquiry.estimatedCalls}</td>
                        <td className="admin-message-cell" title={inquiry.message}>
                          <span>{inquiry.message}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{inquiry.receivedAt}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <StatusDropdown
                            status={inquiry.status}
                            options={INQUIRY_STATUS_OPTIONS}
                            resolveTone={(status) => INQUIRY_STATUS_TONE[status] || 'neutral'}
                            isOpen={openStatusMenu === menuKey}
                            onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                            onSelect={(option) => {
                              updateInquiryStatus('business', inquiry.id, option);
                              setOpenStatusMenu(null);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                />
              )}
            </section>
          )}

          {activeTab === 'logs' && (
          <section>
            <div className="admin-section-head" style={{ marginBottom: 10 }}>
              <div>
                <h2 className="pg-h2">인증 로그</h2>
              </div>
            </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 0, marginBottom: 13 }}>
                <AdminSearchInput
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                  placeholder="검색"
                  ariaLabel="인증 로그 검색"
                />
              </div>

              <AdminTable
              tableClassName="admin-logs-table"
                columns={[
                  { key: 'time', label: '시간' },
                  { key: 'site', label: '사이트' },
                  { key: 'captchaType', label: '유형' },
                  { key: 'result', label: '결과' },
                  { key: 'duration', label: '소요시간' },
                  { key: 'botScore', label: '봇 점수' },
                ]}
                emptyMessage="검색 결과가 없습니다."
                rows={filteredLogs.map((log) => {
                  const rowKey = `${log.time}-${log.site}-${log.result}`;
                  return (
                    <tr
                      key={rowKey}
                      onClick={() => setSelectedScoreLog(log)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{log.time}</td>
                      <td>{log.site}</td>
                      <td>{log.captchaType}</td>
                      <td><StatusBadge tone={getStatusTone(log.result)}>{log.result}</StatusBadge></td>
                      <td>{log.duration}</td>
                      <td style={{ color: 'var(--orange-2)', fontWeight: 700 }}>{log.botScore}점</td>
                    </tr>
                  );
                })}
              />
            </section>
          )}
        </div>
      </div>

      {selectedScoreLog && (
        <ScoreDetailModal log={selectedScoreLog} onClose={() => setSelectedScoreLog(null)} />
      )}
      {selectedInquiryDetail && (
        <InquiryDetailModal detail={selectedInquiryDetail} onClose={() => setSelectedInquiryDetail(null)} />
      )}
    </main>
  );
}