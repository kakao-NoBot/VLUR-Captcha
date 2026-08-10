// AdminPage.jsx

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import { CAPTCHA_THEME_PRESETS, normalizeHexColor, resolveCaptchaTheme } from '../utils/captchaTheme';

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
  { id: 'completed', label: '답변 완료' },
];

const INQUIRY_STATUS_OPTIONS = ['접수', '검토', '답변'];
const MANAGE_STATUS_OPTIONS = ['활성', '비활성'];
const USER_STATUS_OPTIONS = ['활성', '비활성'];
const PLAN_MONTHLY_LIMITS = {
  Basic: 100000,
  Pro: 500000,
  Enterprise: 800000,
};

const INQUIRY_STATUS_TONE = {
  '접수': 'neutral',
  '검토': 'warning',
  '답변': 'success',
};

const INQUIRY_STATUS_BACKEND_TO_LABEL = {
  new: '접수',
  in_progress: '검토',
  done: '답변',
  spam: '접수',
};

const KEY_ACTIVE_TO_LABEL = {
  true: '활성',
  false: '비활성',
};

const KEY_LABEL_TO_BACKEND = {
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

// 백엔드 plan_name 대소문자/레거시 값 정규화 — free는 실질적으로 무료 요금제인 Basic으로 통합
function normalizePlanName(planName) {
  if (!planName) return '미가입';
  const normalized = String(planName).trim().toLowerCase();
  if (normalized === 'pro') return 'Pro';
  if (normalized === 'basic' || normalized === 'free') return 'Basic';
  if (normalized === 'enterprise') return 'Enterprise';
  return planName;
}

function mapAdminUser(row) {
  const keyActive = row.api_key_active === true || row.api_key_active === 1;
  const shared = {
    internalId: row.user_id,
    userId: row.user_id,
    socialProvider: getSocialProvider(row.user_id),
    email: row.email,
    plan: normalizePlanName(row.plan_name),
    joinedAt: row.created_at ? String(row.created_at).slice(0, 10) : '-',
    status: keyActive ? '활성' : '비활성',
    apiKey: row.masked_api_key || '미발급',
    captchaTheme: row.captcha_theme || 'orange',
    themeCustomizationAllowed: row.theme_customization_allowed !== false && row.theme_customization_allowed !== 0,
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
    createdAtRaw: row.created_at || null,
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

/* ── 봇 점수 판정 기준 ──
   서버가 최종 인증 결과를 내려주지 않는 레거시 응답의 표시용 fallback 기준.
   실제 최근 로그의 성공/실패는 서버 verification_status를 사용한다. */
const BOT_SCORE_THRESHOLD = { FAIL: 70, SUSPECT: 40 };

function getResultFromScore(score) {
  if (!Number.isFinite(score)) return '미채점';
  if (score >= BOT_SCORE_THRESHOLD.FAIL) return '실패';
  if (score >= BOT_SCORE_THRESHOLD.SUSPECT) return '의심';
  return '성공';
}

function formatBotScore(score) {
  return Number.isFinite(score) ? `${score}점` : '미채점';
}

// 카테고리별 배점 비중 (총 100점 만점 — ScoreGauge의 100점 만점과 통일)
const SCORE_CATEGORY_WEIGHTS = [
  { label: '드래그 궤적 자연스러움', max: 25 },
  { label: '이동 속도 변화', max: 20 },
  { label: '반응 시간', max: 20 },
  { label: '실패 횟수', max: 15 },
  { label: '정답 위치 정확도', max: 10 },
  { label: '반복 패턴', max: 10 },
];

// botScore를 카테고리별로 비례 배분해서, 항상 세부 채점표 합계 === botScore가 되도록 계산
function getScoreBreakdown(botScore) {
  const clamped = Math.min(100, Math.max(0, botScore));
  const raw = SCORE_CATEGORY_WEIGHTS.map((cat) => ({
    ...cat,
    score: Math.round((clamped * cat.max) / 100),
  }));

  // 반올림 오차 보정: 합계와 botScore 차이를 가장 배점이 큰 카테고리에서 흡수
  const diff = clamped - raw.reduce((sum, c) => sum + c.score, 0);
  if (diff !== 0) {
    const idx = raw.reduce((best, c, i) => (c.max > raw[best].max ? i : best), 0);
    raw[idx].score = Math.min(raw[idx].max, Math.max(0, raw[idx].score + diff));
  }

  return raw;
}

const PLAN_USAGE_TABS = ['Basic', 'Pro', 'Enterprise'];
const PLAN_USAGE_SORT_OPTIONS = [
  { value: 'calls_desc', label: '호출량 많은 순' },
  { value: 'usage_desc', label: '사용률 높은 순' },
  { value: 'fail_rate_desc', label: '실패율 높은 순' },
  { value: 'recent_desc', label: '최근 호출순' },
];

function parseSafeDate(value) {
  if (!value) return 0;
  const normalized = String(value).replace(' ', 'T') + 'Z';
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getStatusTone(status) {
  if (status === '활성' || status === '성공' || status === '정상' || status === '답변') return 'success';
  if (status === '의심' || status === '점검' || status === '검토') return 'warning';
  if (status === '실패' || status === '비활성') return 'danger';
  return 'neutral';
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function clampUsageToLimit(used, limit) {
  const numericUsed = Number(used || 0);
  const numericLimit = Number(limit || 0);
  if (!numericLimit) return numericUsed;
  return Math.min(numericUsed, numericLimit);
}

function getPlanMonthlyLimit(plan, fallbackLimit) {
  return Number(fallbackLimit || 0) || PLAN_MONTHLY_LIMITS[plan] || 0;
}

function formatUsage(used, limit) {
  return `${formatNumber(clampUsageToLimit(used, limit))} / ${formatNumber(limit)}`;
}

function getPercent(used, limit) {
  if (!limit) return 0;
  return Math.round((clampUsageToLimit(used, limit) / limit) * 100);
}

function getPrecisePercent(used, limit) {
  if (!limit) return 0;
  return (clampUsageToLimit(used, limit) / limit) * 100;
}

const STAT_VALUE_STYLE = {
  fontFamily: 'var(--disp)',
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--ink)',
  lineHeight: 1.15,
  fontVariantNumeric: 'tabular-nums',
};

/* ── 상태 뱃지 (읽기 전용: 모달, 인증 로그 결과 등) ── */
const STATUS_TONE_STYLE = {
  success: { color: '#1f8a54', background: 'rgba(46,163,107,0.14)', dot: '#2ea36b' },
  warning: { color: '#a5720f', background: 'rgba(224,165,44,0.16)', dot: '#e0a52c' },
  danger:  { color: '#c0392b', background: 'rgba(192,57,43,0.13)', dot: '#c0392b' },
  neutral: { color: 'var(--ink-soft)', background: 'rgba(60,45,32,0.06)', dot: 'var(--muted)' },
};

function toneBadgeStyle(tone, s) {
  return {
    color: `var(--status-badge-ink-${tone}, ${s.color})`,
    background: `var(--status-badge-bg, ${s.background})`,
    boxShadow: 'var(--status-badge-fx, none)',
  };
}

function StatusBadge({ children, tone = 'neutral', style }) {
  const s = STATUS_TONE_STYLE[tone] || STATUS_TONE_STYLE.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 46, width: 'fit-content', height: 26, padding: '0 10px', borderRadius: 999,
        fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
        ...toneBadgeStyle(tone, s),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

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
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minWidth, height: 28, padding: '0 10px', borderRadius: 999,
          border: isOpen ? `1px solid ${s.dot}` : '1px solid transparent',
          fontSize: 12, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
          ...toneBadgeStyle(tone, s),
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

function BotTrendChart({ data }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  if (!data || data.length === 0) return null;
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
    <div className="admin-scroll-x" style={{ width: '100%' }}>
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
        {hovered && (
          <text x={hovered.x} y={hovered.y - 14} textAnchor="middle" fontSize="13" fill="var(--ink)">
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
          minHeight: 40,
          boxSizing: 'border-box',
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
        {columns.some((c) => c.width) && (
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width || 'auto' }} />
            ))}
          </colgroup>
        )}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>{formatUsage(used, limit)}</span>
        <b style={{ color: 'var(--orange-2)', fontWeight: 700 }}>{percent}%</b>
      </div>
      <div
        style={{
          width: '100%',
          height: 6,
          borderRadius: 999,
          background: 'var(--line)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, var(--gold), var(--orange))',
          }}
        />
      </div>
    </div>
  );
}

function ScoreGauge({ score, max = 100 }) {
  const hasScore = Number.isFinite(score);
  const percent = hasScore ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  const color = !hasScore ? 'var(--muted)' : percent >= 60 ? '#c0392b' : percent >= 30 ? '#e0a52c' : '#2ea36b';

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
        <strong style={{ fontSize: hasScore ? 28 : 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>
          {hasScore ? score : '미채점'}
        </strong>
        {hasScore && <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>/ 100점</span>}
      </div>
    </div>
  );
}

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

        <div className="admin-modal-scroll" style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
          {children}
        </div>

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

  // 로그의 botScore 기준으로 세부 채점표를 매번 계산 → 게이지/판정/채점표가 항상 일치
  const hasScore = Number.isFinite(log.botScore);
  const breakdown = hasScore ? getScoreBreakdown(log.botScore) : [];

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
            {hasScore
              ? 'CNN 로짓을 보정한 위험 지수이며, 점수가 높을수록 봇 의심 가능성이 높습니다.'
              : 'CNN 채점이 적용되기 전에 생성된 과거 인증 로그입니다.'}
          </p>
        </div>
      </div>

      {hasScore && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {breakdown.map((item) => {
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
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
        <span>{log.time}</span>
        <span>·</span>
        <span>{log.site}</span>
        <span>·</span>
        <span>{log.captchaType}</span>
        <span>·</span>
        <span>{log.answerCorrect ? '정답' : '오답'}</span>
      </div>
    </AdminModalShell>
  );
}

function InquiryDetailModal({ detail, onClose, onStatusChange }) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

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
                <StatusDropdown
                  status={inquiry.status}
                  options={INQUIRY_STATUS_OPTIONS}
                  resolveTone={(status) => INQUIRY_STATUS_TONE[status] || 'neutral'}
                  isOpen={statusMenuOpen}
                  onToggle={() => setStatusMenuOpen((v) => !v)}
                  onSelect={(option) => {
                    onStatusChange(option);
                    setStatusMenuOpen(false);
                  }}
                />
              ) : value}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>문의 내용</span>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 14,
            color: 'var(--ink)',
            lineHeight: 1.6,
            background: 'var(--paper)',
            borderRadius: 12,
            padding: '14px 16px',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {inquiry.message}
        </p>
      </div>
    </AdminModalShell>
  );
}

function AdminCaptchaPreview({ theme }) {
  const palette = resolveCaptchaTheme(theme);
  return (
    <div className="admin-theme-preview" style={{ '--captcha-accent': palette.accent, '--captcha-soft': palette.soft, '--captcha-foreground': palette.foreground }}>
      <div className="admin-theme-preview-head">
        <span aria-hidden="true">V</span>
        <div><strong>사람인지 확인해 주세요</strong><small>같은 이미지를 선택하세요.</small></div>
      </div>
      <div className="admin-theme-preview-tiles" aria-hidden="true"><i /><i className="selected">✓</i><i /></div>
      <b>확인</b>
    </div>
  );
}

function ThemeSettingsModal({ user, onClose, onSaved }) {
  const [theme, setTheme] = useState(user?.captchaTheme || 'orange');
  const [allowed, setAllowed] = useState(user?.themeCustomizationAllowed !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!user) return null;
  const resolvedTheme = resolveCaptchaTheme(theme);
  const isThemeValid = Boolean(CAPTCHA_THEME_PRESETS[theme] || normalizeHexColor(theme));

  const save = async () => {
    setSaving(true);
    setError('');
    let savedTheme = CAPTCHA_THEME_PRESETS[theme] ? theme : normalizeHexColor(theme);
    try {
      if (user.apiKey !== '미발급' && theme !== user.captchaTheme) {
        const { data } = await api.patch(`/admin/users/${user.internalId}/api-key-theme`, { theme: savedTheme });
        savedTheme = data.captcha_theme || savedTheme;
      }
      if (allowed !== user.themeCustomizationAllowed) {
        await api.patch(`/admin/users/${user.internalId}/theme-permission`, { allowed });
      }
      onSaved({ theme: user.apiKey === '미발급' ? user.captchaTheme : savedTheme, allowed });
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || '테마 설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModalShell
      eyebrow="CAPTCHA THEME"
      title={`${user.company || user.name || user.userId} 테마 설정`}
      onClose={onClose}
      labelledBy="admin-theme-settings-title"
      footer={(
        <div className="admin-theme-footer">
          <button type="button" className="pg-btn" onClick={onClose}>취소</button>
          <button type="button" className="pg-btn primary" onClick={save} disabled={saving || !isThemeValid}>
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      )}
    >
      <div className="admin-theme-modal-grid">
        <div>
          <div className="admin-theme-custom selected">
            <label htmlFor="admin-captcha-theme-hex">브랜드 HEX 색상</label>
            <div>
              <input
                type="color"
                value={normalizeHexColor(theme) || resolvedTheme.accent}
                onChange={(event) => { setTheme(event.target.value.toUpperCase()); setError(''); }}
                aria-label="관리자 CAPTCHA 테마 색상 선택"
                disabled={user.apiKey === '미발급'}
              />
              <input
                id="admin-captcha-theme-hex"
                className="pg-input"
                type="text"
                maxLength={7}
                autoComplete="off"
                spellCheck={false}
                placeholder="#7C5CE7"
                value={CAPTCHA_THEME_PRESETS[theme]?.accent || theme}
                onChange={(event) => { setTheme(event.target.value); setError(''); }}
                onBlur={() => {
                  const normalized = normalizeHexColor(theme);
                  if (normalized) setTheme(normalized);
                }}
                disabled={user.apiKey === '미발급'}
              />
            </div>
            {!isThemeValid && <p className="admin-theme-error">#RRGGBB 형식으로 입력해 주세요.</p>}
          </div>
          <button
            type="button"
            className="admin-theme-reset"
            onClick={() => setTheme('orange')}
            disabled={user.apiKey === '미발급' || theme === 'orange'}
          >기본 색상으로 초기화</button>

          <label className="admin-theme-permission">
            <input type="checkbox" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} />
            <span><strong>고객 직접 변경 허용</strong><small>끄면 마이페이지에서 색상을 볼 수만 있습니다.</small></span>
          </label>
          {user.apiKey === '미발급' && <p className="admin-theme-error">API Key 발급 후 색상을 지정할 수 있습니다.</p>}
          {error && <p className="admin-theme-error" role="alert">{error}</p>}
        </div>
        <AdminCaptchaPreview theme={theme} />
      </div>
    </AdminModalShell>
  );
}

const INQUIRY_PAGE_SIZE = 10;
const USAGE_PLAN_PAGE_SIZE = 5;
const COMPLETED_INQUIRY_PAGE_SIZE = 10;

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const PAGE_GROUP_SIZE = 5;
  const currentGroup = Math.floor((page - 1) / PAGE_GROUP_SIZE);
  const start = currentGroup * PAGE_GROUP_SIZE + 1;
  const end = Math.min(totalPages, start + PAGE_GROUP_SIZE - 1);

  const pages = [];
  for (let i = start; i <= end; i += 1) pages.push(i);

  const hasPrevGroup = start > 1;
  const hasNextGroup = end < totalPages;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 6, marginTop: 16,
    }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, start - 1))}
        disabled={!hasPrevGroup}
        style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)',
          background: 'var(--card)', cursor: hasPrevGroup ? 'pointer' : 'default',
          opacity: hasPrevGroup ? 1 : 0.4, fontSize: 13,
        }}
      >‹</button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: p === page ? '1px solid var(--orange)' : '1px solid var(--line)',
            background: p === page ? 'var(--orange)' : 'var(--card)',
            color: p === page ? '#fff' : 'var(--ink)',
            fontWeight: p === page ? 700 : 500,
            cursor: 'pointer', fontSize: 13,
          }}
        >{p}</button>
      ))}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, end + 1))}
        disabled={!hasNextGroup}
        style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)',
          background: 'var(--card)', cursor: hasNextGroup ? 'pointer' : 'default',
          opacity: hasNextGroup ? 1 : 0.4, fontSize: 13,
        }}
      >›</button>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeUserType, setActiveUserType] = useState('personal');
  const [userSearch, setUserSearch] = useState('');
  const [activeUsagePlan, setActiveUsagePlan] = useState('Basic');
  const [usagePlanSearch, setUsagePlanSearch] = useState('');
  const [usagePlanSort, setUsagePlanSort] = useState('calls_desc');
  const [usagePlanSortOpen, setUsagePlanSortOpen] = useState(false);
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
  const [sites, setSites] = useState([]);
  const [sitesError, setSitesError] = useState('');
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [botTrend, setBotTrend] = useState([]);
  const [planUsage, setPlanUsage] = useState([]);
  const [planUsageDetails, setPlanUsageDetails] = useState([]);
  const [selectedScoreLog, setSelectedScoreLog] = useState(null);
  const [selectedInquiryDetail, setSelectedInquiryDetail] = useState(null);
  const [selectedThemeUser, setSelectedThemeUser] = useState(null);
  const [openStatusMenu, setOpenStatusMenu] = useState(null);
  const [toast, setToast] = useState(null);
  const [generalPage, setGeneralPage] = useState(1);
  const [businessPage, setBusinessPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [personalUserPage, setPersonalUserPage] = useState(1);
  const [businessUserPage, setBusinessUserPage] = useState(1);
  const [sitePage, setSitePage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [usagePlanPage, setUsagePlanPage] = useState(1);

  // 문의 알림 관련: 마지막으로 "문의 관리" 탭을 연 시각(ms) → 그 이후 접수된 문의만 "새 문의"로 취급
  const [inquiryLastSeen, setInquiryLastSeen] = useState(() => (
    Number(localStorage.getItem('admin_inquiries_last_seen') || 0)
  ));
  const [showInquiryTip, setShowInquiryTip] = useState(false);

  const activeUsers = activeUserType === 'personal' ? personalUsers : businessUsers;
  const activeInquiries = activeInquiryType === 'general' ? generalInquiries : businessInquiries;

  useEffect(() => {
    let ignore = false;

    const fetchInquiries = async () => {
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
    };

    fetchInquiries();
    const interval = setInterval(fetchInquiries, 30000);

    return () => { ignore = true; clearInterval(interval); };
  }, []);

  // "문의 관리" 탭을 열면 현재 시각을 저장해 그 시점까지의 문의를 읽음 처리
  useEffect(() => {
    if (activeTab === 'inquiries') {
      const now = Date.now();
      localStorage.setItem('admin_inquiries_last_seen', String(now));
      setInquiryLastSeen(now);
    }
  }, [activeTab]);

  const unreadInquiryCount = useMemo(() => {
    const isNew = (row) => parseSafeDate(row.createdAtRaw) > inquiryLastSeen;
    return [...generalInquiries, ...businessInquiries].filter(isNew).length;
  }, [generalInquiries, businessInquiries, inquiryLastSeen]);

  const unreadGeneralCount = useMemo(() => {
    const isNew = (row) => parseSafeDate(row.createdAtRaw) > inquiryLastSeen;
    return generalInquiries.filter(isNew).length;
  }, [generalInquiries, inquiryLastSeen]);

  const unreadBusinessCount = useMemo(() => {
    const isNew = (row) => parseSafeDate(row.createdAtRaw) > inquiryLastSeen;
    return businessInquiries.filter(isNew).length;
  }, [businessInquiries, inquiryLastSeen]);

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

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/dashboard/summary');
        if (!ignore) setDashboardStats(data);
      } catch {
        if (!ignore) setDashboardStats(null);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/dashboard/bot-trend');
        if (!ignore) setBotTrend(data.trend || []);
      } catch {
        if (!ignore) setBotTrend([]);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/dashboard/plan-usage');
        if (!ignore) setPlanUsage(data.plans || []);
      } catch {
        if (!ignore) setPlanUsage([]);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get(`/admin/dashboard/plan-usage/${activeUsagePlan}`);
        if (!ignore) setPlanUsageDetails(data.rows || []);
      } catch {
        if (!ignore) setPlanUsageDetails([]);
      }
    })();
    return () => { ignore = true; };
  }, [activeUsagePlan]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const offset = (logPage - 1) * INQUIRY_PAGE_SIZE;
        const { data } = await api.get('/admin/dashboard/logs', {
          params: { limit: INQUIRY_PAGE_SIZE, offset, search: logSearch.trim() },
        });
        const rows = (data.logs || []).map((log) => ({
          ...log,
          result: log.result || getResultFromScore(log.botScore),
        }));
        if (!ignore) {
          setLogs(rows);
          setLogsTotal(data.total || 0);
        }
      } catch {
        if (!ignore) {
          setLogs([]);
          setLogsTotal(0);
        }
      }
    })();
    return () => { ignore = true; };
  }, [logPage, logSearch]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/sites');
        if (!ignore) {
          setSites(data.sites || []);
          setSitesError('');
        }
      } catch (err) {
        if (!ignore) {
          setSites([]);
          setSitesError(err.response?.data?.detail || '사이트 정보를 불러오지 못했습니다.');
        }
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

  // 일반/기업 문의 중 "답변" 상태인 것만 합쳐서 통합 답변완료 테이블에 사용
  const completedInquiries = useMemo(() => {
    const combined = [
      ...generalInquiries
        .filter((inquiry) => inquiry.status === '답변')
        .map((inquiry) => ({ ...inquiry, sourceType: 'general', displayName: inquiry.requester })),
      ...businessInquiries
        .filter((inquiry) => inquiry.status === '답변')
        .map((inquiry) => ({ ...inquiry, sourceType: 'business', displayName: inquiry.manager })),
    ];

    const query = inquirySearch.trim().toLowerCase();
    const filtered = query
      ? combined.filter((inquiry) => (
        [inquiry.email, inquiry.displayName, inquiry.message]
          .some((field) => String(field || '').toLowerCase().includes(query))
      ))
      : combined;

    return filtered.sort((a, b) => (b.createdAtRaw || '').localeCompare(a.createdAtRaw || ''));
  }, [generalInquiries, businessInquiries, inquirySearch]);

  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) => (
      Object.values(site).some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [sites, siteSearch]);

  const usagePlanRows = useMemo(() => {
    const query = usagePlanSearch.trim().toLowerCase();
    const baseRows = planUsageDetails;
    const searchedRows = query
      ? baseRows.filter((row) => (
        Object.values(row).some((value) => String(value).toLowerCase().includes(query))
      ))
      : baseRows;

    return [...searchedRows].sort((a, b) => {
      const aMonthlyCalls = clampUsageToLimit(a.monthlyCalls, a.monthlyLimit);
      const bMonthlyCalls = clampUsageToLimit(b.monthlyCalls, b.monthlyLimit);
      const aUsage = getPrecisePercent(a.monthlyCalls, a.monthlyLimit);
      const bUsage = getPrecisePercent(b.monthlyCalls, b.monthlyLimit);
      const aFailRate = aMonthlyCalls ? a.failCount / aMonthlyCalls : 0;
      const bFailRate = bMonthlyCalls ? b.failCount / bMonthlyCalls : 0;
      if (usagePlanSort === 'usage_desc') return bUsage - aUsage;
      if (usagePlanSort === 'fail_rate_desc') return bFailRate - aFailRate;
      if (usagePlanSort === 'recent_desc') return b.lastCalledAt.localeCompare(a.lastCalledAt);
      return bMonthlyCalls - aMonthlyCalls;
    });
  }, [planUsageDetails, usagePlanSearch, usagePlanSort]);

  // 검색어와 무관하게 항상 선택된 요금제 "전체" 데이터를 기준으로 계산 (검색 필터링 영향 X)
const usagePlanBaseRows = planUsageDetails;

const usagePlanSummary = useMemo(() => {
  const rows = usagePlanBaseRows;
  const totalCalls = rows.reduce((sum, row) => sum + clampUsageToLimit(row.monthlyCalls, row.monthlyLimit), 0);
  const totalLimit = rows.reduce((sum, row) => sum + row.monthlyLimit, 0);
  const averageUsage = rows.length
    ? rows.reduce((sum, row) => sum + getPrecisePercent(row.monthlyCalls, row.monthlyLimit), 0) / rows.length
    : 0;
  const riskyAccounts = rows.filter((row) => getPrecisePercent(row.monthlyCalls, row.monthlyLimit) >= 80).length;
  return {
    accountCount: rows.length,
    totalCalls,
    totalLimit,
    averageUsage,
    riskyAccounts,
  };
}, [usagePlanBaseRows]);

  const openUsagePlanDetail = (plan) => {
    setActiveUsagePlan(plan);
    setUsagePlanSearch('');
    setUsagePlanSort('calls_desc');
    setUsagePlanPage(1);
    setActiveTab('usage-plans');
  };

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

  useEffect(() => {
    if (!usagePlanSortOpen) return undefined;
    const close = () => setUsagePlanSortOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [usagePlanSortOpen]);

  useEffect(() => {
    setGeneralPage(1);
    setBusinessPage(1);
    setCompletedPage(1);
  }, [inquirySearch, activeInquiryType]);

  useEffect(() => {
    setPersonalUserPage(1);
    setBusinessUserPage(1);
  }, [userSearch, activeUserType]);

  useEffect(() => {
    setSitePage(1);
  }, [siteSearch]);

  useEffect(() => {
    setLogPage(1);
  }, [logSearch]);

  useEffect(() => {
    setUsagePlanPage(1);
  }, [usagePlanSearch, usagePlanSort, activeUsagePlan]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 라벨 → 백엔드 값 역매핑 (INQUIRY_STATUS_BACKEND_TO_LABEL의 반대)
  const INQUIRY_LABEL_TO_BACKEND = {
    '접수': 'new',
    '검토': 'in_progress',
    '답변': 'done',
  };

  const updateInquiryStatus = async (type, key, nextStatus) => {
    const backendStatus = INQUIRY_LABEL_TO_BACKEND[nextStatus];
    if (!backendStatus) return;

    const updater = (inquiries) => inquiries.map((inquiry) => (
      inquiry.id === key ? { ...inquiry, status: nextStatus } : inquiry
    ));
    const setInquiries = type === 'general' ? setGeneralInquiries : setBusinessInquiries;

    let previousStatus = null;
    let alreadyDone = false;
    setInquiries((inquiries) => inquiries.map((inquiry) => {
      if (inquiry.id === key) {
        previousStatus = inquiry.status;
        alreadyDone = inquiry.status === '답변';
      }
      return inquiry;
    }));
    setInquiries(updater); // 먼저 화면에 반영 (낙관적 업데이트)

    // 기업 문의를 '답변'으로 바꾸는 경우, 서버 응답을 기다리지 않고 미리 안내 토스트를 띄운다.
    // (이미 '답변' 상태였던 문의는 계정이 이미 만들어졌을 가능성이 높아 제외)
    const willAutoProvision = type === 'business' && nextStatus === '답변' && !alreadyDone;
    if (willAutoProvision) {
      setToast({ type: 'success', message: '기업 계정을 생성하고 안내 메일을 발송하는 중입니다...' });
    }

    try {
      const { data } = await api.patch(`/admin/inquiries/${key}/status`, { status: backendStatus });
      if (data?.account_created) {
        setToast({ type: 'success', message: '기업 계정이 자동 생성되어 안내 메일이 발송되었습니다.' });
      } else if (willAutoProvision) {
        // 이미 가입된 이메일 등으로 계정이 생성되지 않은 경우, 조용히 토스트를 닫는다.
        setToast(null);
      }
    } catch (err) {
      // 실패하면 원래 상태로 롤백
      setInquiries((inquiries) => inquiries.map((inquiry) => (
        inquiry.id === key ? { ...inquiry, status: previousStatus ?? inquiry.status } : inquiry
      )));
      setToast({ type: 'error', message: '문의 상태 변경에 실패했습니다.' });
    }
  };

  const updateUserApiKeyStatus = async (type, internalId, nextStatus) => {
    const backendStatus = KEY_LABEL_TO_BACKEND[nextStatus];
    if (!backendStatus) return;

    const setUsers = type === 'personal' ? setPersonalUsers : setBusinessUsers;
    const applyStatus = (users) => users.map((user) => (
      user.internalId === internalId ? { ...user, status: nextStatus } : user
    ));

    let previousStatus = null;
    setUsers((users) => users.map((user) => {
      if (user.internalId === internalId) previousStatus = user.status;
      return user;
    }));
    setUsers(applyStatus);
    setUsersError('');

    try {
      await api.patch(`/admin/users/${internalId}/api-key-status`, { status: backendStatus });
    } catch (err) {
      setUsers((users) => users.map((user) => (
        user.internalId === internalId ? { ...user, status: previousStatus ?? user.status } : user
      )));
      setUsersError(err.response?.data?.detail || 'API Key 상태를 변경하지 못했습니다.');
    }
  };

  const updateSiteStatus = async (apiKeyId, nextStatus) => {
    let previousStatus = null;
    setSites((prev) => prev.map((site) => {
      if (site.apiKeyId === apiKeyId) previousStatus = site.status;
      return site.apiKeyId === apiKeyId ? { ...site, status: nextStatus } : site;
    }));
    setSitesError('');

    try {
      await api.patch(`/admin/sites/${apiKeyId}/status`, { status: nextStatus });
    } catch (err) {
      setSites((prev) => prev.map((site) => (
        site.apiKeyId === apiKeyId ? { ...site, status: previousStatus ?? site.status } : site
      )));
      setSitesError(err.response?.data?.detail || '사이트 상태를 변경하지 못했습니다.');
    }
  };

  const applySavedThemeSettings = ({ theme, allowed }) => {
    const update = (users) => users.map((user) => (
      user.internalId === selectedThemeUser?.internalId
        ? { ...user, captchaTheme: theme, themeCustomizationAllowed: allowed }
        : user
    ));
    setPersonalUsers(update);
    setBusinessUsers(update);
    setToast({ type: 'success', message: 'CAPTCHA 테마 설정이 저장되었습니다.' });
  };

  // 문의 행 렌더링 (진행 중 테이블 / 답변 완료 테이블 양쪽에서 재사용)
  const renderGeneralInquiryRow = (inquiry) => {
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
          <span>
            {inquiry.message.length > 20
              ? `${inquiry.message.slice(0, 20)}...`
              : inquiry.message}
          </span>
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
  };

  const renderBusinessInquiryRow = (inquiry) => {
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
          <span>
            {inquiry.message.length > 20
              ? `${inquiry.message.slice(0, 20)}...`
              : inquiry.message}
          </span>
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
  };

  const GENERAL_INQUIRY_COLUMNS = [
    { key: 'email', label: '회신 이메일', width: 200 },
    { key: 'requester', label: '이름', width: 80 },
    { key: 'type', label: '유형', width: 110 },
    { key: 'message', label: '문의 내용', width: 230 },
    { key: 'receivedAt', label: '접수일', width: 120 },
    { key: 'status', label: '상태', width: 100 },
  ];

  const BUSINESS_INQUIRY_COLUMNS = [
    { key: 'company', label: '회사/서비스명', width: 160 },
    { key: 'manager', label: '담당자명', width: 90 },
    { key: 'phone', label: '전화번호', width: 130 },
    { key: 'email', label: '이메일', width: 200 },
    { key: 'estimatedCalls', label: '예상 월 호출량', width: 120 },
    { key: 'message', label: '문의 내용', width: 230 },
    { key: 'receivedAt', label: '접수일', width: 120 },
    { key: 'status', label: '상태', width: 100 },
  ];

  // 일반/기업 문의를 합쳐서 보여주는 "답변 완료" 통합 테이블용 컬럼·행 렌더러
  const COMPLETED_INQUIRY_COLUMNS = [
    { key: 'typeLabel', label: '구분', width: 70 },
    { key: 'email', label: '이메일', width: 200 },
    { key: 'name', label: '이름 / 담당자', width: 110 },
    { key: 'message', label: '문의 내용', width: 230 },
    { key: 'receivedAt', label: '접수일', width: 120 },
    { key: 'status', label: '상태', width: 100 },
  ];

  const renderCompletedInquiryRow = (inquiry) => {
    const isBusiness = inquiry.sourceType === 'business';
    const menuKey = `${inquiry.sourceType}-${inquiry.id}`;
    return (
      <tr
        key={`completed-${inquiry.sourceType}-${inquiry.id}`}
        className="admin-inquiry-row"
        onClick={() => setSelectedInquiryDetail({ type: inquiry.sourceType, inquiry })}
      >
        <td className="admin-nowrap-cell">{isBusiness ? '기업' : '일반'}</td>
        <td className="admin-nowrap-cell" title={inquiry.email}>{inquiry.email}</td>
        <td className="admin-ellipsis-cell" title={inquiry.displayName}>{inquiry.displayName}</td>
        <td className="admin-message-cell" title={inquiry.message}>
          <span>
            {inquiry.message.length > 20
              ? `${inquiry.message.slice(0, 20)}...`
              : inquiry.message}
          </span>
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
              updateInquiryStatus(inquiry.sourceType, inquiry.id, option);
              setOpenStatusMenu(null);
            }}
          />
        </td>
      </tr>
    );
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
        .admin-table th {
          text-align: left;
          padding-top: 17px;
          padding-bottom: 17px;
          box-sizing: border-box;
        }
        .admin-table td {
          text-align: left;
          vertical-align: middle;
          padding-top: 15px;
          padding-bottom: 15px;
          box-sizing: border-box;
        }
        .admin-readable-table {
          table-layout: auto;
          width: max-content;
          min-width: 100%;
        }
        .admin-readable-table th,
        .admin-readable-table td {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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

        .admin-compact-log-row {
          transition: background .15s ease;
        }
        .admin-compact-log-row:hover {
          background: var(--paper);
        }
        [data-theme="dark"] .admin-compact-log-row:hover {
          background: var(--peach) !important;
        }
        [data-theme="dark"] .admin-plan-usage-button:hover {
          background: var(--peach) !important;
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
        .admin-static-table tbody tr {
          cursor: default;
       }
        .admin-static-table tbody tr:hover td,
        [data-theme="dark"] .admin-static-table tbody tr:hover td {
          background: inherit !important;
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
          {ADMIN_TABS.map((tab) => {
            const isInquiries = tab.id === 'inquiries';
            const isActive = activeTab === tab.id || (tab.id === 'dashboard' && activeTab === 'usage-plans');
            return (
              <div
                key={tab.id}
                style={{ position: 'relative' }}
                onMouseEnter={() => { if (isInquiries) setShowInquiryTip(true); }}
                onMouseLeave={() => { if (isInquiries) setShowInquiryTip(false); }}
              >
                <button
                  type="button"
                  className={`mp-nav-item${isActive ? ' active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {tab.label}
                  {isInquiries && unreadInquiryCount > 0 && (
                    <span
                      aria-hidden="true"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: '#c0392b', flexShrink: 0 }}
                    />
                  )}
                </button>

                {isInquiries && showInquiryTip && unreadInquiryCount > 0 && (
                  <div
                    role="status"
                    style={{
                      position: 'absolute', top: 0, left: 'calc(100% + 12px)', zIndex: 500,
                      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
                      boxShadow: '0 16px 32px -8px rgba(36,27,21,.18)', padding: '14px 16px',
                      minWidth: 240, whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute', top: 14, left: -6,
                        width: 11, height: 11, background: 'var(--card)',
                        borderLeft: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
                        transform: 'rotate(45deg)',
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 6, height: 6, borderRadius: '50%', background: '#c0392b', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                        새 문의 알림
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {unreadGeneralCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 13, color: 'var(--ink)' }}>
                          <span>일반 사용자 문의</span>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--orange)',
                            background: 'rgba(224,120,44,0.12)', borderRadius: 999, padding: '2px 8px',
                          }}>
                            +{unreadGeneralCount}
                          </span>
                        </div>
                      )}
                      {unreadBusinessCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 13, color: 'var(--ink)' }}>
                          <span>기업/회사 문의</span>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--orange)',
                            background: 'rgba(224,120,44,0.12)', borderRadius: 999, padding: '2px 8px',
                          }}>
                            +{unreadBusinessCount}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
                {[
                  { label: '전체 사용자 수', value: dashboardStats ? formatNumber(dashboardStats.total_users) : '-', note: '일반/기업 계정 합산' },
                  { label: '오늘 CAPTCHA 발급 수', value: dashboardStats ? formatNumber(dashboardStats.today_issued) : '-', note: 'type1/type2 합산' },
                  { label: '오늘 CAPTCHA 검증 수', value: dashboardStats ? formatNumber(dashboardStats.today_verified) : '-', note: '성공/실패 포함' },
                  { label: '오늘 완료율', value: dashboardStats ? `${dashboardStats.success_rate}%` : '-', note: '발급 대비 검증 완료 비율' },
                  { label: '오늘 봇 차단률', value: dashboardStats ? `${dashboardStats.bot_block_rate}%` : '-', note: 'CNN 모델 판정 기준' },
                ].map((stat) => (
                  <article className="admin-stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong style={STAT_VALUE_STYLE}>{stat.value}</strong>
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
                    {logs.slice(0, 5).map((log, index) => {
                      return (
                        <div
                          className="admin-compact-log-row"
                          key={log.id ?? `${log.time}-${log.site}-${index}`}
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <span style={{ flex: '0 0 44px' }}>{log.time.slice(11)}</span>
                          <b style={{ flex: '1 1 0%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.site}</b>
                          <StatusBadge tone={getStatusTone(log.result)} style={{ flex: '0 0 auto' }}>{log.result}</StatusBadge>
                          <span style={{ flex: '0 0 52px', color: 'var(--orange-2)', fontWeight: 500, textAlign: 'right' }}>{formatBotScore(log.botScore)}</span>
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
                    {planUsage.map((plan) => (
                      <button
                        type="button"
                        className="admin-plan-usage-row admin-plan-usage-button"
                        key={plan.plan}
                        onClick={() => openUsagePlanDetail(plan.plan)}
                      >
                        <div>
                          <b>{plan.plan}</b>
                          <span>{formatNumber(plan.accounts)}개 계정</span>
                        </div>
                        <UsageMeter used={plan.used} limit={plan.limit} />
                      </button>
                    ))}
                  </div>
                </section>

                <section className="admin-overview-card admin-overview-card-full" aria-labelledby="admin-bot-trend-title">
                  <div className="admin-card-head">
                    <h3 id="admin-bot-trend-title" className="pg-h3">봇 차단 추이</h3>
                    <span>최근 7일</span>
                  </div>
                  <BotTrendChart data={botTrend} />
                </section>
              </div>
            </section>
          )}

          {activeTab === 'usage-plans' && (
            <section>
              <div className="admin-section-head admin-usage-detail-head">
                <div>
                  <h2 className="pg-h2">요금제별 사용량</h2>
                </div>
              </div>

              <div className="admin-usage-summary-grid" aria-label="요금제별 사용량 요약">
                <article className="admin-stat-card">
                  <span>총 계정 수</span>
                  <strong style={STAT_VALUE_STYLE}>{formatNumber(usagePlanSummary.accountCount)}</strong>
                  <small>{activeUsagePlan} 요금제</small>
                </article>
                <article className="admin-stat-card">
                  <span>총 월 호출량</span>
                  <strong style={STAT_VALUE_STYLE}>{formatNumber(usagePlanSummary.totalCalls)}</strong>
                  <small>선택한 계정 전체 합산</small>
                </article>
                <article className="admin-stat-card">
                  <span>평균 사용률</span>
                  <strong style={STAT_VALUE_STYLE}>{usagePlanSummary.averageUsage.toFixed(1)}%</strong>
                  <small>월 호출량 / 월 한도</small>
                </article>
                <article className="admin-stat-card">
                  <span>한도 위험 계정</span>
                  <strong style={STAT_VALUE_STYLE}>{formatNumber(usagePlanSummary.riskyAccounts)}</strong>
                  <small>사용률 80% 이상</small>
                </article>
              </div>

              <div className="admin-usage-detail-card">
                <div className="admin-usage-detail-toolbar">
                  <div className="admin-segmented admin-usage-plan-tabs" aria-label="요금제 선택" style={{ marginTop: 0, marginBottom: 0 }}>
                    {PLAN_USAGE_TABS.map((plan) => (
                      <button
                        key={plan}
                        type="button"
                        className={activeUsagePlan === plan ? 'active' : ''}
                        onClick={() => { setActiveUsagePlan(plan); setUsagePlanPage(1); }}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                  <div className="admin-usage-detail-controls">
                    <AdminSearchInput
                      value={usagePlanSearch}
                      onChange={(event) => setUsagePlanSearch(event.target.value)}
                      placeholder="검색"
                      ariaLabel="요금제별 사용량 검색"
                    />
                    <div className="admin-sort-dropdown" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`admin-sort-trigger${usagePlanSortOpen ? ' open' : ''}`}
                        onClick={() => setUsagePlanSortOpen((v) => !v)}
                        aria-haspopup="listbox"
                        aria-expanded={usagePlanSortOpen}
                      >
                        <span>{PLAN_USAGE_SORT_OPTIONS.find((o) => o.value === usagePlanSort)?.label}</span>
                        <span className="admin-sort-trigger-arrow">▼</span>
                      </button>
                      {usagePlanSortOpen && (
                        <div className="admin-sort-menu" role="listbox">
                          {PLAN_USAGE_SORT_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={usagePlanSort === option.value}
                              className={`admin-sort-option${usagePlanSort === option.value ? ' selected' : ''}`}
                              onClick={() => {
                                setUsagePlanSort(option.value);
                                setUsagePlanSortOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(() => {
                  const totalPages = Math.max(1, Math.ceil(usagePlanRows.length / USAGE_PLAN_PAGE_SIZE));
                  const pageRows = usagePlanRows.slice((usagePlanPage - 1) * USAGE_PLAN_PAGE_SIZE, usagePlanPage * USAGE_PLAN_PAGE_SIZE);
                  return (
                    <>
                      <AdminTable
                        columns={[
                          { key: 'siteName', label: '사이트명', width: 160 },
                          { key: 'userName', label: '사용자', width: 100 },
                          { key: 'email', label: '이메일', width: 200 },
                          { key: 'plan', label: '요금제', width: 90 },
                          { key: 'monthlyCalls', label: '월 호출량', width: 110 },
                          { key: 'monthlyLimit', label: '월 한도', width: 110 },
                          { key: 'usage', label: '사용률', width: 160 },
                          { key: 'successCount', label: '성공', width: 100 },
                          { key: 'failCount', label: '실패', width: 100 },
                          { key: 'botBlockedCount', label: '봇 차단', width: 100 },
                          { key: 'lastCalledAt', label: '최근 호출', width: 120 },
                        ]}
                        tableStyle={{ tableLayout: 'fixed', width: 1350 }}
                        emptyMessage="검색 결과가 없습니다."
                        rows={pageRows.map((row) => {
                          const monthlyCalls = clampUsageToLimit(row.monthlyCalls, row.monthlyLimit);
                          const usagePercent = getPrecisePercent(row.monthlyCalls, row.monthlyLimit);
                          return (
                            <tr key={row.id}>
                              <td>{row.siteName}</td>
                              <td>{row.userName}</td>
                              <td>{row.email}</td>
                              <td>{row.plan}</td>
                              <td>{formatNumber(monthlyCalls)}</td>
                              <td>{formatNumber(row.monthlyLimit)}</td>
                              <td>
                                <div className="admin-usage-percent-cell">
                                  <div className="admin-usage-percent-top">
                                    <b>{usagePercent.toFixed(1)}%</b>
                                  </div>
                                  <div className="admin-usage-progress" aria-hidden="true">
                                    <span style={{ width: `${Math.min(100, usagePercent)}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td>{formatNumber(row.successCount)}</td>
                              <td>{formatNumber(row.failCount)}</td>
                              <td>{formatNumber(row.botBlockedCount)}</td>
                              <td>{row.lastCalledAt}</td>
                            </tr>
                          );
                        })}
                      />
                      <Pagination page={usagePlanPage} totalPages={totalPages} onChange={setUsagePlanPage} />
                    </>
                  );
                })()}
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

              {activeUserType === 'personal' ? (() => {
                const columns = [
                  { key: 'name', label: '이름', width: 100 },
                  { key: 'userId', label: '아이디', width: 120 },
                  { key: 'email', label: '이메일', width: 200 },
                  { key: 'plan', label: '요금제', width: 90 },
                  { key: 'apiKey', label: 'API Key', width: 90 },
                  { key: 'captchaTheme', label: 'CAPTCHA 테마', width: 130 },
                  { key: 'joinedAt', label: '가입일', width: 120 },
                  { key: 'status', label: '상태', width: 120 },
                ];
                const totalPages = Math.max(1, Math.ceil(filteredUsers.length / INQUIRY_PAGE_SIZE));
                const pageRows = filteredUsers.slice((personalUserPage - 1) * INQUIRY_PAGE_SIZE, personalUserPage * INQUIRY_PAGE_SIZE);
                return (
                  <>
                    <AdminTable
                      tableClassName="admin-fixed-table admin-left-table admin-static-table"
                      tableStyle={{ tableLayout: 'fixed', width: 1040 }}
                      columns={columns}
                      emptyMessage={usersLoading ? '사용자 정보를 불러오는 중입니다.' : '검색 결과가 없습니다.'}
                      rows={pageRows.map((user) => {
                        const menuKey = `user-personal-${user.internalId}`;
                        return (
                          <tr key={user.internalId}>
                            <td>{user.name}</td>
                            <td>{user.socialProvider ? <SocialProviderLogo provider={user.socialProvider} /> : user.userId}</td>
                            <td>{user.email}</td>
                            <td>{user.plan}</td>
                            <td>{user.apiKey === '미발급' ? '미발급' : '발급'}</td>
                            <td>
                              <button type="button" className="admin-theme-cell" onClick={() => setSelectedThemeUser(user)}>
                                <span style={{ background: resolveCaptchaTheme(user.captchaTheme).accent }} aria-hidden="true" />
                                {CAPTCHA_THEME_PRESETS[user.captchaTheme]?.label || user.captchaTheme}
                                {!user.themeCustomizationAllowed && <small>잠금</small>}
                              </button>
                            </td>
                            <td>{user.joinedAt}</td>
                            <td>
                              <StatusDropdown
                                status={user.status}
                                options={USER_STATUS_OPTIONS}
                                isOpen={openStatusMenu === menuKey}
                                onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                                onSelect={(option) => {
                                  updateUserApiKeyStatus('personal', user.internalId, option);
                                  setOpenStatusMenu(null);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    />
                    <Pagination page={personalUserPage} totalPages={totalPages} onChange={setPersonalUserPage} />
                  </>
                );
              })() : (() => {
                const columns = [
                  { key: 'company', label: '회사명', width: 160 },
                  { key: 'manager', label: '담당자', width: 100 },
                  { key: 'userId', label: '아이디', width: 120 },
                  { key: 'email', label: '이메일', width: 200 },
                  { key: 'plan', label: '요금제', width: 90 },
                  { key: 'apiKey', label: 'API Key', width: 90 },
                  { key: 'captchaTheme', label: 'CAPTCHA 테마', width: 130 },
                  { key: 'siteCount', label: '등록 사이트 수', width: 120 },
                  { key: 'monthlyLimit', label: '월 호출 한도', width: 110 },
                  { key: 'status', label: '상태', width: 120 },
                ];
                const totalPages = Math.max(1, Math.ceil(filteredUsers.length / INQUIRY_PAGE_SIZE));
                const pageRows = filteredUsers.slice((businessUserPage - 1) * INQUIRY_PAGE_SIZE, businessUserPage * INQUIRY_PAGE_SIZE);
                return (
                  <>
                    <AdminTable
                      tableClassName="admin-fixed-table admin-left-table admin-static-table"
                      tableStyle={{ tableLayout: 'fixed', width: 1310 }}
                      columns={columns}
                      emptyMessage={usersLoading ? '사용자 정보를 불러오는 중입니다.' : '검색 결과가 없습니다.'}
                      rows={pageRows.map((user) => {
                        const menuKey = `user-business-${user.internalId}`;
                        return (
                          <tr key={user.internalId}>
                            <td>{user.company}</td>
                            <td>{user.manager}</td>
                            <td>{user.socialProvider ? <SocialProviderLogo provider={user.socialProvider} /> : user.userId}</td>
                            <td>{user.email}</td>
                            <td>{user.plan}</td>
                            <td>{user.apiKey === '미발급' ? '미발급' : '발급'}</td>
                            <td>
                              <button type="button" className="admin-theme-cell" onClick={() => setSelectedThemeUser(user)}>
                                <span style={{ background: resolveCaptchaTheme(user.captchaTheme).accent }} aria-hidden="true" />
                                {CAPTCHA_THEME_PRESETS[user.captchaTheme]?.label || user.captchaTheme}
                                {!user.themeCustomizationAllowed && <small>잠금</small>}
                              </button>
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
                                  updateUserApiKeyStatus('business', user.internalId, option);
                                  setOpenStatusMenu(null);
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    />
                    <Pagination page={businessUserPage} totalPages={totalPages} onChange={setBusinessUserPage} />
                  </>
                );
              })()}
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

              {(() => {
                const columns = [
                  { key: 'name', label: '사이트명', width: 160 },
                  { key: 'domain', label: '도메인', width: 160 },
                  { key: 'owner', label: '소유자', width: 150 },
                  { key: 'plan', label: '요금제', width: 90 },
                  { key: 'monthlyLimit', label: '월 호출 한도', width: 110 },
                  { key: 'monthlyUsage', label: '이번 달 사용량', width: 200 },
                  { key: 'status', label: '상태', width: 120 },
                  { key: 'createdAt', label: '등록일', width: 120 },
                ];
                const totalPages = Math.max(1, Math.ceil(filteredSites.length / INQUIRY_PAGE_SIZE));
                const pageRows = filteredSites.slice((sitePage - 1) * INQUIRY_PAGE_SIZE, sitePage * INQUIRY_PAGE_SIZE);
                return (
                  <>
                    <AdminTable
                      tableClassName="table-ink-orange admin-fixed-table admin-static-table"
                      tableStyle={{ tableLayout: 'fixed', width: 1110 }}
                      columns={columns}
                      emptyMessage="검색 결과가 없습니다."
                      rows={pageRows.map((site) => {
                        const menuKey = `site-${site.apiKeyId}`;
                        const monthlyLimit = getPlanMonthlyLimit(site.plan, site.monthlyLimit);
                        const monthlyUsage = clampUsageToLimit(site.monthlyUsage, monthlyLimit);
                        return (
                          <tr key={site.apiKeyId}>
                            <td>{site.name}</td>
                            <td>{site.domain}</td>
                            <td>{site.owner}</td>
                            <td>{site.plan}</td>
                            <td>{formatNumber(monthlyLimit)}</td>
                            <td><UsageMeter used={monthlyUsage} limit={monthlyLimit} /></td>
                            <td>
                              <StatusDropdown
                                status={site.status}
                                options={MANAGE_STATUS_OPTIONS}
                                isOpen={openStatusMenu === menuKey}
                                onToggle={() => setOpenStatusMenu(openStatusMenu === menuKey ? null : menuKey)}
                                onSelect={(option) => {
                                  updateSiteStatus(site.apiKeyId, option);
                                  setOpenStatusMenu(null);
                                }}
                              />
                            </td>
                            <td>{site.createdAt}</td>
                          </tr>
                        );
                      })}
                    />
                    <Pagination page={sitePage} totalPages={totalPages} onChange={setSitePage} />
                  </>
                );
              })()}
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

              {activeInquiryType === 'general' && (() => {
                const rows = filteredInquiries.filter((inquiry) => inquiry.status !== '답변');
                const totalPages = Math.max(1, Math.ceil(rows.length / INQUIRY_PAGE_SIZE));
                const pageRows = rows.slice((generalPage - 1) * INQUIRY_PAGE_SIZE, generalPage * INQUIRY_PAGE_SIZE);
                return (
                  <>
                    <AdminTable
                      wrapperClassName="admin-inquiry-table-wrap"
                      tableClassName="admin-readable-table admin-general-inquiry-table"
                      tableStyle={{ tableLayout: 'fixed', width: 840 }}
                      columns={GENERAL_INQUIRY_COLUMNS}
                      emptyMessage="검색 결과가 없습니다."
                      rows={pageRows.map(renderGeneralInquiryRow)}
                    />
                    <Pagination page={generalPage} totalPages={totalPages} onChange={setGeneralPage} />
                  </>
                );
              })()}

              {activeInquiryType === 'business' && (() => {
                const rows = filteredInquiries.filter((inquiry) => inquiry.status !== '답변');
                const totalPages = Math.max(1, Math.ceil(rows.length / INQUIRY_PAGE_SIZE));
                const pageRows = rows.slice((businessPage - 1) * INQUIRY_PAGE_SIZE, businessPage * INQUIRY_PAGE_SIZE);
                return (
                  <>
                    <AdminTable
                      wrapperClassName="admin-inquiry-table-wrap"
                      tableClassName="admin-readable-table admin-business-inquiry-table"
                      tableStyle={{ tableLayout: 'fixed', width: 1150 }}
                      columns={BUSINESS_INQUIRY_COLUMNS}
                      emptyMessage="검색 결과가 없습니다."
                      rows={pageRows.map(renderBusinessInquiryRow)}
                    />
                    <Pagination page={businessPage} totalPages={totalPages} onChange={setBusinessPage} />
                  </>
                );
              })()}

              {activeInquiryType === 'completed' && (() => {
                const totalPages = Math.max(1, Math.ceil(completedInquiries.length / COMPLETED_INQUIRY_PAGE_SIZE));
                const pageRows = completedInquiries.slice(
                  (completedPage - 1) * COMPLETED_INQUIRY_PAGE_SIZE,
                  completedPage * COMPLETED_INQUIRY_PAGE_SIZE
                );
                return (
                  <>
                    <AdminTable
                      wrapperClassName="admin-inquiry-table-wrap"
                      tableClassName="admin-readable-table admin-completed-inquiry-table"
                      tableStyle={{ tableLayout: 'fixed', width: 830 }}
                      columns={COMPLETED_INQUIRY_COLUMNS}
                      emptyMessage="답변 완료된 문의가 없습니다."
                      rows={pageRows.map(renderCompletedInquiryRow)}
                    />
                    <Pagination page={completedPage} totalPages={totalPages} onChange={setCompletedPage} />
                  </>
                );
              })()}
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

              {(() => {
                const columns = [
                  { key: 'time', label: '시간', width: 160 },
                  { key: 'site', label: '사이트', width: 170 },
                  { key: 'captchaType', label: '유형', width: 160 },
                  { key: 'result', label: '결과', width: 110 },
                  { key: 'duration', label: '소요시간', width: 120 },
                  { key: 'botScore', label: '봇 점수', width: 110 },
                ];
                const totalPages = Math.max(1, Math.ceil(logsTotal / INQUIRY_PAGE_SIZE));
                const pageRows = logs;
                return (
                  <>
                    <AdminTable
                      tableClassName="admin-logs-table admin-fixed-table"
                      tableStyle={{ tableLayout: 'fixed', width: 830 }}
                      columns={columns}
                      emptyMessage="검색 결과가 없습니다."
                      rows={pageRows.map((log, index) => {
                        const rowKey = log.id ?? `${log.time}-${log.site}-${log.result}-${index}`;
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
                            <td style={{ color: 'var(--orange-2)' }}>{formatBotScore(log.botScore)}</td>
                          </tr>
                        );
                      })}
                    />
                    <Pagination page={logPage} totalPages={totalPages} onChange={setLogPage} />
                  </>
                );
              })()}
            </section>
          )}
        </div>
      </div>

      {selectedScoreLog && (
        <ScoreDetailModal log={selectedScoreLog} onClose={() => setSelectedScoreLog(null)} />
      )}
      {selectedInquiryDetail && (
        <InquiryDetailModal
          detail={selectedInquiryDetail}
          onClose={() => setSelectedInquiryDetail(null)}
          onStatusChange={(option) => {
            const sourceType = selectedInquiryDetail.inquiry.sourceType || selectedInquiryDetail.type;
            updateInquiryStatus(sourceType, selectedInquiryDetail.inquiry.id, option);
            setSelectedInquiryDetail((prev) => (
              prev ? { ...prev, inquiry: { ...prev.inquiry, status: option } } : prev
            ));
          }}
        />
      )}
      {selectedThemeUser && (
        <ThemeSettingsModal
          user={selectedThemeUser}
          onClose={() => setSelectedThemeUser(null)}
          onSaved={applySavedThemeSettings}
        />
      )}
      {toast && (
        <div role="status" className={`admin-toast ${toast.type === 'error' ? 'error' : 'success'}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="닫기"
            className="admin-toast-close"
          >×</button>
        </div>
      )}
    </main>
  );
}
