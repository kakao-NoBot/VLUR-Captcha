import React, { useState } from 'react';
import api from '../api/axios';

export default function ApplyDonePage({ openPage, closePage }) {
  const [integTab, setIntegTab] = useState('fe');
  const [secretKey, setSecretKey] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [siteDomain, setSiteDomain] = useState('');
  const [secretIssued, setSecretIssued] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  const issueSecret = async () => {
    if (secretIssued) {
      setIssueError('Secret Key는 1회만 표시됩니다. 이미 발급되었습니다.');
      return;
    }
    if (issuing) return;
    if (!siteDomain.trim()) {
      setIssueError('Site Key를 사용할 사이트 도메인을 입력해 주세요.');
      return;
    }
    setIssuing(true);
    setIssueError('');
    try {
      const { data } = await api.post('/api-keys', { site_domain: siteDomain });
      setSecretKey(data.plain_key);
      setSiteKey(data.site_key);
      setSecretIssued(true);
      setStep2Done(true);
    } catch (err) {
      if (err.response?.status === 409) {
        setIssueError('이미 사용 중인 API Key가 있습니다. 마이페이지 > API Key 관리에서 확인하세요.');
      } else {
        setIssueError(err.response?.data?.detail || 'API Key 발급에 실패했습니다.');
      }
    } finally {
      setIssuing(false);
    }
  };

  const [copyLabel, setCopyLabel] = useState('복사');
  const copy = (val) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopyLabel('복사됨 ✓');
    setTimeout(() => setCopyLabel('복사'), 1500);
  };

  return (
    <div className="po-body">
      <div className="pg-eyebrow">SC-15b · 이용 신청 완료</div>
      <h1 className="pg-h1">AICAPTCHA를 웹사이트/앱에 연동하세요</h1>
      <p className="pg-sub">Sitekey와 Secret Key를 발급받고 아래 안내에 따라 연동을 진행하세요.</p>

      <div className="pg-card">
        {/* Step 1 */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className={`step-circle${siteKey ? ' done' : ''}`}>{siteKey ? '✓' : '1'}</div>
            <div className="step-line"/>
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="pg-h3" style={{ marginBottom: 10 }}>Site Key와 도메인 등록</h3>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 12 }}>Site Key는 프론트엔드(React 위젯, 스크립트 태그)에서 사용하는 공개 키입니다. 사용하는 사이트 도메인을 함께 등록해 주세요.</p>
            <label htmlFor="site-domain" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700 }}>사이트 도메인</label>
            <input
              id="site-domain"
              className="pg-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              value={siteDomain}
              onChange={(event) => setSiteDomain(event.target.value)}
              disabled={secretIssued}
              style={{ marginBottom: 10 }}
            />
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>개발 환경은 `http://localhost:5173`처럼 포트까지 입력해 주세요.</p>
            <div className="key-box">
              <span style={{ color: siteKey ? 'inherit' : 'var(--muted)', fontSize: 13 }}>
                {siteKey ? `sitekey: ${siteKey}` : 'sitekey: (Secret Key 발급 시 함께 생성)'}
              </span>
              <button className="pg-btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => copy(siteKey)} disabled={!siteKey}>{copyLabel}</button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className={`step-circle${step2Done ? ' done' : ''}`}>{step2Done ? '✓' : '2'}</div>
            <div className="step-line"/>
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="pg-h3" style={{ marginBottom: 10 }}>Secret Key 발급</h3>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 4 }}>Secret Key는 백엔드에서 CAPTCHA 응답 토큰을 검증할 때 사용하는 비공개 키입니다.</p>
            <p style={{ fontSize: 13, color: '#c0392b', marginBottom: 12 }}>⚠ 발급 후에는 다시 확인할 수 없으니 안전한 곳에 보관하세요.</p>
            <button className="pg-btn primary" style={{ fontSize: 13, padding: '9px 18px', marginBottom: 12 }} onClick={issueSecret} disabled={issuing}>
              {issuing ? '발급 중...' : 'Site Key와 Secret Key 발급받기'}
            </button>
            <div className="key-box">
              <span style={{ color: secretKey ? 'inherit' : 'var(--muted)', fontSize: 13 }}>
                {secretKey ? `secret_key: ${secretKey}` : 'secret_key: (발급 버튼 클릭 시 1회 표시)'}
              </span>
            </div>
            {issueError && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#c0392b' }}>{issueError}</p>
            )}
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="step-circle" style={{ borderColor: step2Done ? 'var(--orange)' : undefined, color: step2Done ? 'var(--orange)' : undefined }}>3</div>
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="pg-h3" style={{ marginBottom: 16 }}>CAPTCHA 연동하기</h3>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Method 1 · SDK / 플러그인</h4>
            <div className="sdk-grid">
              {['React','Vue','FastAPI','Node.js','Django'].map(s => (
                <div className="sdk-badge" key={s}>{s}</div>
              ))}
              <div className="sdk-badge" style={{ color: 'var(--orange)' }}>더보기 +</div>
            </div>
            <hr className="pg-divider"/>
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Method 2 · 커스텀 연동</h4>
            <div className="tab-bar">
              {[['fe','프론트엔드'],['be','백엔드 검증']].map(([id, label]) => (
                <button key={id} className={`tab${integTab === id ? ' active' : ''}`} onClick={() => setIntegTab(id)}>{label}</button>
              ))}
            </div>
            {integTab === 'fe' ? (
              <pre className="pg-code">{`<form method="POST">
  <div class="ai-captcha"
    data-sitekey="${siteKey || 'YOUR_SITE_KEY'}">
  </div>
  <script src="https://js.aicaptcha.dev/v1/api.js"
    async defer></script>
</form>`}</pre>
            ) : (
              <pre className="pg-code">{`curl -s https://api.aicaptcha.dev/v1/siteverify \\
  -X POST \\
  --data-urlencode "secret=YOUR_SECRET_KEY" \\
  --data-urlencode "response=TOKEN_FROM_CLIENT" \\
  --data-urlencode "sitekey=${siteKey || 'YOUR_SITE_KEY'}"

# {"success": true, "error-codes": [], "host": "example.com"}`}</pre>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button className="pg-btn" onClick={closePage}>나중에 하기</button>
        <button className="pg-btn primary" onClick={() => openPage('mypage')}>완료 (마이페이지로 이동)</button>
      </div>
    </div>
  );
}
