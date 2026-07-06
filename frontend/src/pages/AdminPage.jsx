import React, { useEffect, useMemo, useState } from 'react';

const ADMIN_TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'users', label: '사용자 관리' },
  { id: 'sites', label: '사이트 관리' },
  { id: 'apiKeys', label: 'API Key 관리' },
  { id: 'captchas', label: 'CAPTCHA 문제 관리' },
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

const INQUIRY_STATUS_OPTIONS = ['접수', '검토 중', '답변 완료'];

const DASHBOARD_STATS = [
  { label: '전체 사용자 수', value: '1,284', note: '일반/기업 계정 합산' },
  { label: '오늘 CAPTCHA 발급 수', value: '32,410', note: 'type1/type2 합산' },
  { label: '오늘 CAPTCHA 검증 수', value: '30,982', note: '성공/실패 포함' },
  { label: '평균 성공률', value: '96.8%', note: '최근 24시간 기준' },
  { label: '봇 차단률', value: '8.7%', note: 'drag trace 판별 기준' },
];

const MOCK_PERSONAL_USERS = [
  { name: '김민준', userId: 'minjun01', email: 'minjun@example.com', plan: 'Pro', joinedAt: '2026-06-02', status: '활성' },
  { name: '이지아', userId: 'jia-lab', email: 'jia@demo.co.kr', plan: 'Starter', joinedAt: '2026-06-10', status: '활성' },
  { name: '박서준', userId: 'seo-admin', email: 'seo@vlur.test', plan: 'Enterprise', joinedAt: '2026-06-18', status: '점검' },
  { name: '최하린', userId: 'harin77', email: 'harin@example.com', plan: 'Free', joinedAt: '2026-06-24', status: '비활성' },
];

const MOCK_BUSINESS_USERS = [
  { company: 'VLUR Commerce', manager: '정다은', userId: 'vlur-commerce', email: 'ops@vlur-commerce.kr', plan: 'Enterprise', siteCount: 6, monthlyLimit: 500000, status: '활성' },
  { company: 'AI Study Lab', manager: '윤태오', userId: 'study-lab', email: 'admin@study.example.io', plan: 'Pro', siteCount: 3, monthlyLimit: 100000, status: '활성' },
  { company: 'Secure Board Inc.', manager: '한서연', userId: 'secure-board', email: 'contact@secureboard.kr', plan: 'Starter', siteCount: 1, monthlyLimit: 50000, status: '비활성' },
];

const MOCK_SITES = [
  { name: 'VLUR Demo Shop', domain: 'shop.vlur-demo.kr', owner: 'VLUR Commerce', plan: 'Enterprise', monthlyLimit: 500000, monthlyUsage: 312000, status: '활성', createdAt: '2026-06-03' },
  { name: 'AI Study Portal', domain: 'study.example.io', owner: 'AI Study Lab', plan: 'Pro', monthlyLimit: 100000, monthlyUsage: 68400, status: '활성', createdAt: '2026-06-12' },
  { name: 'Secure Board', domain: 'board.sample.kr', owner: 'Secure Board Inc.', plan: 'Starter', monthlyLimit: 50000, monthlyUsage: 12850, status: '비활성', createdAt: '2026-06-21' },
];

const MOCK_API_KEYS = [
  { keyName: 'Production Key', maskedKey: 'sk_live_••••••••1234', owner: '김민준', site: 'VLUR Demo Shop', permission: '발급/검증', createdAt: '2026-06-04', status: '활성' },
  { keyName: 'Test Sandbox', maskedKey: 'sk_test_••••••••5678', owner: '이지아', site: 'AI Study Portal', permission: '테스트', createdAt: '2026-06-13', status: '활성' },
  { keyName: 'Legacy Key', maskedKey: 'sk_live_••••••••9012', owner: '박서준', site: 'Secure Board', permission: '검증 전용', createdAt: '2026-06-19', status: '비활성' },
];

const MOCK_CAPTCHAS = [
  {
    id: 'CAP-DRAG-001',
    captchaType: 'type1_drag',
    label: '드래그형',
    description: '아스키 아트 이미지를 목표 영역으로 드래그',
    status: '유형 1',
    updatedAt: '2026-07-01',
  },
  {
    id: 'CAP-ID-001',
    captchaType: 'type2_identify',
    label: '식별형',
    description: '드래그형 실패 또는 시간초과 시 추가로 사용하는 식별 인증',
    status: '유형 2',
    updatedAt: '2026-06-29',
  },
];

const MOCK_GENERAL_INQUIRIES = [
  { id: 'GEN-001', requester: '이지아', email: 'jia@demo.co.kr', type: 'API Key 문의', message: '마이페이지에서 API Key를 어디서 확인하는지 궁금합니다.', receivedAt: '2026-07-03', status: '답변 완료' },
  { id: 'GEN-002', requester: '최하린', email: 'harin@example.com', type: '결제/요금제 문의', message: 'Basic에서 Pro 요금제로 변경 가능한지 문의드립니다.', receivedAt: '2026-07-02', status: '접수' },
  { id: 'GEN-003', requester: '김민준', email: 'minjun@example.com', type: '기술 문의', message: 'CAPTCHA 검증 로그를 기간별로 확인할 수 있는지 궁금합니다.', receivedAt: '2026-07-01', status: '검토 중' },
];

const MOCK_BUSINESS_INQUIRIES = [
  { id: 'ENT-001', company: '준수커머스', manager: '김준수', phone: '010-2931-1335', email: 'contact@junsucommerce.kr', estimatedCalls: '1,000,000회 이상', message: '대량 CAPTCHA 호출 한도와 전용 지원 문의', receivedAt: '2026-07-03', status: '검토 중' },
  { id: 'ENT-002', company: 'VLUR Commerce', manager: '정다은', phone: '010-1234-5678', email: 'ops@vlur-commerce.kr', estimatedCalls: '3,000,000회 이상', message: '월 호출량 증설과 SLA 적용 가능 여부 문의', receivedAt: '2026-07-02', status: '답변 완료' },
  { id: 'ENT-003', company: 'AI Study Lab', manager: '윤태오', phone: '010-9876-5432', email: 'admin@aistudy.io', estimatedCalls: '500,000회', message: '교육 포털 연동 테스트 환경 문의', receivedAt: '2026-06-30', status: '접수' },
];

const SCORE_BREAKDOWN = [
  { label: '드래그 궤적 자연스러움', score: 18, max: 30 },
  { label: '이동 속도 변화', score: 12, max: 20 },
  { label: '반응 시간', score: 15, max: 20 },
  { label: '실패 횟수', score: 10, max: 15 },
  { label: '정답 위치 정확도', score: 8, max: 10 },
  { label: '반복 패턴', score: 9, max: 10 },
];

const MOCK_LOGS = [
  { time: '2026-07-03 09:42', site: 'VLUR Demo Shop', captchaType: 'type1_drag', result: '성공', duration: '1.8초', botScore: 8, verdict: '정상' },
  { time: '2026-07-03 09:38', site: 'AI Study Portal', captchaType: 'type2_identify', result: '성공', duration: '2.7초', botScore: 21, verdict: '정상' },
  { time: '2026-07-03 09:34', site: 'VLUR Demo Shop', captchaType: 'type1_drag', result: '의심', duration: '0.9초', botScore: 72, verdict: '의심' },
  { time: '2026-07-03 09:29', site: 'Secure Board', captchaType: 'type1_drag', result: '실패', duration: '4.2초', botScore: 58, verdict: '실패' },
  { time: '2026-07-03 09:21', site: 'AI Study Portal', captchaType: 'type2_identify', result: '실패', duration: '3.4초', botScore: 43, verdict: '실패' },
];

const PLAN_USAGE = [
  { plan: 'Free', accounts: 812, used: 182000, limit: 300000 },
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

const LOG_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'success', label: '성공' },
  { id: 'failed', label: '실패' },
  { id: 'suspicious', label: '의심' },
];

function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

function getInquiryStatusClass(status) {
  if (status === '답변 완료') return 'status-done';
  if (status === '검토 중') return 'status-review';
  return 'status-received';
}

function getStatusTone(status) {
  if (status === '활성' || status === '성공' || status === '유형 1' || status === '정상' || status === '답변 완료') return 'success';
  if (status === '의심' || status === '점검' || status === '유형 2' || status === '검토 중') return 'warning';
  if (status === '실패' || status === '비활성') return 'danger';
  return 'neutral';
}

function getLogFilterId(result) {
  if (result === '성공') return 'success';
  if (result === '실패') return 'failed';
  if (result === '의심') return 'suspicious';
  return 'all';
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

function AdminTable({ columns, rows, emptyMessage, wrapperClassName = '', tableClassName = '' }) {
  return (
    <div className={`admin-table-wrap${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <table className={`admin-table${tableClassName ? ` ${tableClassName}` : ''}`}>
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
    <div className="admin-score-overlay" role="presentation" onClick={onClose}>
      <section
        className="admin-score-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-score-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-score-header">
          <div>
            <p className="pg-eyebrow">BOT SCORE DETAIL</p>
            <h2 id="admin-score-title">봇 점수 채점표</h2>
          </div>
          <button type="button" className="admin-score-close" aria-label="채점표 닫기" onClick={onClose}>×</button>
        </div>

        <div className="admin-score-summary">
          <div>
            <span>최종 봇 점수</span>
            <strong>{log.botScore}점</strong>
          </div>
          <div>
            <span>판정 결과</span>
            <StatusBadge tone={getStatusTone(log.verdict)}>{log.verdict}</StatusBadge>
          </div>
        </div>

        <p className="admin-score-help">점수가 높을수록 봇 의심 가능성이 높습니다.</p>

        <div className="admin-score-list" aria-label="봇 점수 평가 항목">
          {SCORE_BREAKDOWN.map((item) => (
            <div className="admin-score-item" key={item.label}>
              <div className="admin-score-item-head">
                <span>{item.label}</span>
                <b>{item.score} / {item.max}</b>
              </div>
              <div className="admin-progress" aria-hidden="true">
                <span style={{ width: `${getPercent(item.score, item.max)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="admin-score-meta">
          <span>{log.time}</span>
          <span>{log.site}</span>
          <span>{log.captchaType}</span>
        </div>

        <div className="admin-score-actions">
          <button type="button" className="pg-btn primary" onClick={onClose}>확인</button>
        </div>
      </section>
    </div>
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
    <div className="admin-score-overlay" role="presentation" onClick={onClose}>
      <section
        className="admin-score-modal admin-inquiry-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-inquiry-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-score-header">
          <div>
            <p className="pg-eyebrow">INQUIRY DETAIL</p>
            <h2 id="admin-inquiry-detail-title">{title}</h2>
          </div>
          <button type="button" className="admin-score-close" aria-label="문의 상세 닫기" onClick={onClose}>×</button>
        </div>

        <dl className="admin-inquiry-detail-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {label === '상태' ? (
                  <StatusBadge tone={getStatusTone(value)}>{value}</StatusBadge>
                ) : value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="admin-inquiry-detail-message">
          <span>문의 내용</span>
          <p>{inquiry.message}</p>
        </div>

        <div className="admin-score-actions">
          <button type="button" className="pg-btn primary" onClick={onClose}>확인</button>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeUserType, setActiveUserType] = useState('personal');
  const [userSearch, setUserSearch] = useState('');
  const [activeInquiryType, setActiveInquiryType] = useState('general');
  const [inquirySearch, setInquirySearch] = useState('');
  const [generalInquiries, setGeneralInquiries] = useState(MOCK_GENERAL_INQUIRIES);
  const [businessInquiries, setBusinessInquiries] = useState(MOCK_BUSINESS_INQUIRIES);
  const [logFilter, setLogFilter] = useState('all');
  const [selectedScoreLog, setSelectedScoreLog] = useState(null);
  const [selectedInquiryDetail, setSelectedInquiryDetail] = useState(null);
  const [openInquiryStatusMenu, setOpenInquiryStatusMenu] = useState(null);

  const activeUsers = activeUserType === 'personal' ? MOCK_PERSONAL_USERS : MOCK_BUSINESS_USERS;
  const activeInquiries = activeInquiryType === 'general' ? generalInquiries : businessInquiries;

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return activeUsers;
    return activeUsers.filter((user) => (
      Object.values(user).some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [activeUsers, userSearch]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return MOCK_LOGS;
    return MOCK_LOGS.filter((log) => getLogFilterId(log.result) === logFilter);
  }, [logFilter]);

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

  useEffect(() => {
    if (!openInquiryStatusMenu) return undefined;

    const closeInquiryStatusMenu = () => setOpenInquiryStatusMenu(null);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeInquiryStatusMenu();
    };

    document.addEventListener('click', closeInquiryStatusMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', closeInquiryStatusMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openInquiryStatusMenu]);

  const notifyUiOnly = (label) => {
    window.alert(`${label} 기능은 관리자 프로토타입 UI입니다.`);
  };

  const updateInquiryStatus = (type, key, nextStatus) => {
    const updater = (inquiries) => inquiries.map((inquiry) => {
      return inquiry.id === key ? { ...inquiry, status: nextStatus } : inquiry;
    });

    if (type === 'general') {
      setGeneralInquiries(updater);
      return;
    }

    setBusinessInquiries(updater);
  };

  const renderInquiryStatusTrigger = (status, menuKey) => {
    const isOpen = openInquiryStatusMenu === menuKey;

    return (
      <button
        type="button"
        className={`admin-inquiry-status-trigger ${getInquiryStatusClass(status)}${isOpen ? ' open' : ''}`}
        aria-label="문의 상태 변경"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setOpenInquiryStatusMenu(isOpen ? null : menuKey);
        }}
      >
        <span>{status}</span>
        <span className="admin-inquiry-status-trigger-arrow" aria-hidden="true">
          {isOpen ? '⌃' : '⌄'}
        </span>
      </button>
    );
  };

  const renderInquiryStatusOption = (type, id, currentStatus, option) => {
    const selected = currentStatus === option;

    return (
      <button
        key={option}
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        className={`admin-inquiry-status-option ${getInquiryStatusClass(option)}${selected ? ' is-selected' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          updateInquiryStatus(type, id, option);
          setOpenInquiryStatusMenu(null);
        }}
      >
        <span>{option}</span>
        {selected && <span className="admin-inquiry-status-check" aria-hidden="true">✓</span>}
      </button>
    );
  };

  const renderInquiryStatusControl = (type, id, status) => {
    const menuKey = `${type}-${id}`;
    const isOpen = openInquiryStatusMenu === menuKey;

    return (
      <div
        className={`admin-inquiry-status-wrap${isOpen ? ' is-open' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {renderInquiryStatusTrigger(status, menuKey)}

        {isOpen && (
          <div
            className="admin-inquiry-status-menu"
            role="menu"
            aria-label="문의 상태 선택"
            onClick={(event) => event.stopPropagation()}
          >
            {INQUIRY_STATUS_OPTIONS.map((option) => (
              renderInquiryStatusOption(type, id, status, option)
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="po-body admin-page">
      <section className="admin-hero">
        <div>
          <p className="pg-eyebrow">ADMIN CONSOLE</p>
          <h1 className="pg-h1">관리자 페이지</h1>
          <p className="pg-sub">AI CAPTCHA 운영 현황을 한눈에 확인하고 관리합니다.</p>
        </div>
        <div className="admin-hero-chip">AI CAPTCHA v1.4</div>
      </section>

      <section className="admin-console" aria-label="관리자 기능">
        <aside className="admin-sidebar" aria-label="관리자 메뉴">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-nav-item${activeTab === tab.id ? ' active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="admin-content">
          {activeTab === 'dashboard' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">AI CAPTCHA 운영 현황</h2>
                  <p className="admin-muted">오늘의 발급, 검증, 차단 지표와 최근 운영 흐름을 mock 데이터로 표시합니다.</p>
                </div>
              </div>

              <div className="admin-stat-grid">
                {DASHBOARD_STATS.map((stat) => (
                  <article className="admin-stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </article>
                ))}
              </div>

              <div className="admin-dashboard-grid">
                <section className="admin-overview-card admin-overview-card-wide" aria-labelledby="admin-recent-log-title">
                  <div className="admin-card-head">
                    <h3 id="admin-recent-log-title">최근 인증 로그</h3>
                    <span>최근 5건</span>
                  </div>
                  <div className="admin-compact-log-list">
                    {MOCK_LOGS.slice(0, 5).map((log) => (
                      <div className="admin-compact-log-row" key={`${log.time}-${log.site}`}>
                        <span>{log.time.slice(11)}</span>
                        <b>{log.site}</b>
                        <StatusBadge tone={getStatusTone(log.result)}>{log.result}</StatusBadge>
                        <button type="button" className="admin-score-link" onClick={() => setSelectedScoreLog(log)}>
                          {log.botScore}점
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-overview-card" aria-labelledby="admin-plan-usage-title">
                  <div className="admin-card-head">
                    <h3 id="admin-plan-usage-title">요금제별 사용량</h3>
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
                    <h3 id="admin-bot-trend-title">봇 차단 추이</h3>
                    <span>최근 7일</span>
                  </div>
                  <div className="admin-trend-chart" aria-label="최근 7일 봇 차단률 추이">
                    {BOT_BLOCK_TREND.map((item) => (
                      <div className="admin-trend-bar" key={item.label}>
                        <div className="admin-trend-track">
                          <span style={{ height: `${item.value * 8}%` }} />
                        </div>
                        <b>{item.value}%</b>
                        <small>{item.label}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeTab === 'users' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">사용자 관리</h2>
                  <p className="admin-muted">일반 사용자와 기업/회사 사용자를 구분해 요금제 상태를 확인합니다.</p>
                </div>
                <input
                  className="pg-input admin-search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="이름/아이디/이메일 검색"
                  aria-label="사용자 검색"
                />
              </div>

              <div className="admin-segmented" aria-label="사용자 유형">
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

              {activeUserType === 'personal' ? (
                <AdminTable
                  columns={[
                    { key: 'name', label: '이름' },
                    { key: 'userId', label: '아이디' },
                    { key: 'email', label: '이메일' },
                    { key: 'plan', label: '요금제' },
                    { key: 'joinedAt', label: '가입일' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage="검색 결과가 없습니다."
                  rows={filteredUsers.map((user) => (
                    <tr key={user.userId}>
                      <td>{user.name}</td>
                      <td>{user.userId}</td>
                      <td>{user.email}</td>
                      <td>{user.plan}</td>
                      <td>{user.joinedAt}</td>
                      <td><StatusBadge tone={getStatusTone(user.status)}>{user.status}</StatusBadge></td>
                    </tr>
                  ))}
                />
              ) : (
                <AdminTable
                  columns={[
                    { key: 'company', label: '회사명' },
                    { key: 'manager', label: '담당자' },
                    { key: 'userId', label: '아이디' },
                    { key: 'email', label: '이메일' },
                    { key: 'plan', label: '요금제' },
                    { key: 'siteCount', label: '등록 사이트 수' },
                    { key: 'monthlyLimit', label: '월 호출 한도' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage="검색 결과가 없습니다."
                  rows={filteredUsers.map((user) => (
                    <tr key={user.userId}>
                      <td>{user.company}</td>
                      <td>{user.manager}</td>
                      <td>{user.userId}</td>
                      <td>{user.email}</td>
                      <td>{user.plan}</td>
                      <td>{user.siteCount}</td>
                      <td>{formatNumber(user.monthlyLimit)}</td>
                      <td><StatusBadge tone={getStatusTone(user.status)}>{user.status}</StatusBadge></td>
                    </tr>
                  ))}
                />
              )}
            </section>
          )}

          {activeTab === 'sites' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">사이트 관리</h2>
                  <p className="admin-muted">등록된 클라이언트 사이트의 요금제, 호출 한도, 이번 달 사용량을 확인합니다.</p>
                </div>
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
                emptyMessage="등록된 사이트가 없습니다."
                rows={MOCK_SITES.map((site) => (
                  <tr key={site.domain}>
                    <td>{site.name}</td>
                    <td>{site.domain}</td>
                    <td>{site.owner}</td>
                    <td>{site.plan}</td>
                    <td>{formatNumber(site.monthlyLimit)}</td>
                    <td><UsageMeter used={site.monthlyUsage} limit={site.monthlyLimit} /></td>
                    <td><StatusBadge tone={getStatusTone(site.status)}>{site.status}</StatusBadge></td>
                    <td>{site.createdAt}</td>
                  </tr>
                ))}
              />
            </section>
          )}

          {activeTab === 'apiKeys' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">API Key 관리</h2>
                  <p className="admin-muted">실제 secret 노출 없이 마스킹된 키만 표시합니다.</p>
                </div>
              </div>
              <div className="admin-api-key-grid">
                {MOCK_API_KEYS.map((apiKey) => (
                  <article className="admin-api-key-card" key={`${apiKey.keyName}-${apiKey.owner}`}>
                    <div className="admin-api-key-head">
                      <div>
                        <span>키 이름</span>
                        <h3>{apiKey.keyName}</h3>
                      </div>
                      <StatusBadge tone={getStatusTone(apiKey.status)}>{apiKey.status}</StatusBadge>
                    </div>

                    <div className="admin-api-key-main">
                      <code className="admin-key-mask admin-key-mask-pill">{apiKey.maskedKey}</code>

                      <dl className="admin-api-key-meta">
                        <div>
                          <dt>소유자</dt>
                          <dd>{apiKey.owner}</dd>
                        </div>
                        <div>
                          <dt>연결 사이트</dt>
                          <dd>{apiKey.site}</dd>
                        </div>
                        <div>
                          <dt>권한</dt>
                          <dd>{apiKey.permission}</dd>
                        </div>
                        <div>
                          <dt>생성일</dt>
                          <dd>{apiKey.createdAt}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="admin-api-key-actions">
                      <button type="button" className="admin-mini-btn" onClick={() => notifyUiOnly('API Key 보기')}>보기</button>
                      <button type="button" className="admin-mini-btn danger" onClick={() => notifyUiOnly('API Key 비활성화')}>비활성화</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'captchas' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">CAPTCHA 문제 관리</h2>
                  <p className="admin-muted">v1.4 규칙에 맞는 type1_drag, type2_identify 문제만 관리합니다.</p>
                </div>
              </div>
              <div className="admin-problem-grid">
                {MOCK_CAPTCHAS.map((captcha) => (
                  <article className="admin-problem-card" key={captcha.id}>
                    <div className="admin-problem-top">
                      <span className="admin-captcha-id">{captcha.id}</span>
                      <StatusBadge tone={getStatusTone(captcha.status)}>{captcha.status}</StatusBadge>
                    </div>
                    <h3>{captcha.label}</h3>
                    <p>{captcha.description}</p>
                    <dl>
                      <div>
                        <dt>captcha_type</dt>
                        <dd>{captcha.captchaType}</dd>
                      </div>
                      <div>
                        <dt>최근 수정일</dt>
                        <dd>{captcha.updatedAt}</dd>
                      </div>
                    </dl>
                    <div className="admin-card-actions">
                      <button type="button" className="pg-btn" onClick={() => notifyUiOnly('CAPTCHA 미리보기')}>미리보기</button>
                      <button type="button" className="pg-btn primary" onClick={() => notifyUiOnly('CAPTCHA 사용/중지')}>사용/중지</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'inquiries' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">문의 관리</h2>
                  <p className="admin-muted">일반 문의와 Enterprise 도입 문의를 구분해 확인합니다.</p>
                </div>
                <input
                  className="pg-input admin-search"
                  value={inquirySearch}
                  onChange={(event) => setInquirySearch(event.target.value)}
                  placeholder="이름/회사명/이메일 검색"
                  aria-label="문의 검색"
                />
              </div>

              <div className="admin-segmented" aria-label="문의 유형">
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

              {activeInquiryType === 'general' ? (
                <AdminTable
                  wrapperClassName="admin-inquiry-table-wrap"
                  tableClassName="admin-readable-table admin-general-inquiry-table"
                  columns={[
                    { key: 'email', label: '회신 이메일' },
                    { key: 'requester', label: '이름' },
                    { key: 'type', label: '유형' },
                    { key: 'message', label: '문의 내용' },
                    { key: 'receivedAt', label: '접수일' },
                    { key: 'status', label: '상태' },
                  ]}
                  emptyMessage="검색 결과가 없습니다."
                  rows={filteredInquiries.map((inquiry) => (
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
                      <td className="admin-nowrap-cell">{inquiry.receivedAt}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {renderInquiryStatusControl('general', inquiry.id, inquiry.status)}
                      </td>
                    </tr>
                  ))}
                />
              ) : (
                <AdminTable
                  wrapperClassName="admin-inquiry-table-wrap"
                  tableClassName="admin-readable-table admin-business-inquiry-table"
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
                  rows={filteredInquiries.map((inquiry) => (
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
                      <td className="admin-nowrap-cell">{inquiry.receivedAt}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {renderInquiryStatusControl('business', inquiry.id, inquiry.status)}
                      </td>
                    </tr>
                  ))}
                />
              )}
            </section>
          )}

          {activeTab === 'logs' && (
            <section>
              <div className="admin-section-head">
                <div>
                  <h2 className="pg-h2">인증 로그</h2>
                  <p className="admin-muted">CAPTCHA 검증 결과와 봇 점수를 mock 로그로 표시합니다.</p>
                </div>
                <div className="admin-filter-row" aria-label="로그 필터">
                  {LOG_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`admin-filter-btn${logFilter === filter.id ? ' active' : ''}`}
                      onClick={() => setLogFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <AdminTable
                columns={[
                  { key: 'time', label: '시간' },
                  { key: 'site', label: '사이트' },
                  { key: 'captchaType', label: '유형' },
                  { key: 'result', label: '결과' },
                  { key: 'duration', label: '소요시간' },
                  { key: 'botScore', label: '봇 점수' },
                ]}
                emptyMessage="선택한 조건의 인증 로그가 없습니다."
                rows={filteredLogs.map((log) => (
                  <tr key={`${log.time}-${log.site}-${log.result}`}>
                    <td>{log.time}</td>
                    <td>{log.site}</td>
                    <td>{log.captchaType}</td>
                    <td><StatusBadge tone={getStatusTone(log.result)}>{log.result}</StatusBadge></td>
                    <td>{log.duration}</td>
                    <td>
                      <button type="button" className="admin-score-link" onClick={() => setSelectedScoreLog(log)}>
                        {log.botScore}점
                      </button>
                    </td>
                  </tr>
                ))}
              />
            </section>
          )}
        </div>
      </section>

      {selectedScoreLog && (
        <ScoreDetailModal log={selectedScoreLog} onClose={() => setSelectedScoreLog(null)} />
      )}
      {selectedInquiryDetail && (
        <InquiryDetailModal detail={selectedInquiryDetail} onClose={() => setSelectedInquiryDetail(null)} />
      )}
    </main>
  );
}
