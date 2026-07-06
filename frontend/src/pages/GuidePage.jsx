import React, { useState, useRef, useEffect } from 'react';

const WIDGET_CODE = '<div class="vlur-captcha" data-sitekey="YOUR_SITE_KEY"></div>\n'
  + '<script src="https://js.vlur.dev/v1/api.js" async defer><' + '/script>';

const STEPS = [
  {
    n: '01',
    color: 'var(--orange)',
    shadow: '0 0 0 1px rgba(240,105,30,.22), 0 12px 36px rgba(240,105,30,.32)',
    title: 'API Key 발급',
    desc: '마이페이지 또는 이용신청에서 API Key를 발급받으세요.',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          VLUR CAPTCHA를 서비스에 연동하려면 먼저 API Key가 필요합니다.<br/>
          API Key는 요청 인증에 사용되며, 반드시 서버 환경에서만 관리하세요.
        </p>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>발급 절차</div>
          {[
            { n: 1, label: '회원가입 / 로그인', desc: 'VLUR CAPTCHA 계정을 생성합니다.' },
            { n: 2, label: '이용 신청', desc: '플랜을 선택하고 서비스를 신청합니다. (Free 플랜은 즉시 발급)' },
            { n: 3, label: 'API Key 확인', desc: '마이페이지 → API Key 탭에서 키를 복사합니다.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>API Key 형식</div>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#C8E87A', padding: '14px 16px', borderRadius: 10, fontSize: 13, fontFamily: 'monospace', lineHeight: 1.7 }}>
{`vlur_live_sk_AbC1dEfGhIjKlMnOpQ23rStUvWxYz`}
          </pre>
        </div>

        <div style={{ background: 'var(--peach)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--orange)', marginBottom: 8 }}>⚠ 보안 주의사항</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
            <li>API Key는 서버 환경변수(.env)에만 저장하세요.</li>
            <li>클라이언트(브라우저) 코드에 절대 포함하지 마세요.</li>
            <li>GitHub 등 공개 저장소에 커밋하지 마세요.</li>
          </ul>
          <pre style={{ margin: '10px 0 0', background: '#1a1a1a', color: '#aaa', padding: '10px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
{`# .env
VLUR_API_KEY=vlur_live_sk_AbC1dEfG...`}
          </pre>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    color: 'var(--gold)',
    shadow: '0 0 0 1px rgba(202,138,4,.22), 0 12px 36px rgba(202,138,4,.32)',
    title: 'CAPTCHA 요청',
    desc: '엔드포인트 + API Key로 ASCII 아트 CAPTCHA 문제를 요청합니다.',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          백엔드 서버에서 VLUR API에 CAPTCHA 문제를 요청합니다.<br/>
          응답으로 ASCII 아트 이미지와 문제 유형이 반환됩니다.
        </p>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>요청</div>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#C8E87A', padding: '14px 16px', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
{`GET https://api.vlur.dev/v1/captcha
Authorization: Bearer $VLUR_API_KEY`}
          </pre>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>응답 예시</div>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#93c5fd', padding: '14px 16px', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
{`{
  "captcha_id": "cap_abc123",
  "ascii_image": "░░██░░\\n░████░\\n...",
  "ui_type": "choice",
  "options": ["banana", "apple", "orange", "grape"]
}`}
          </pre>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>ui_type 종류</div>
          {[
            { type: 'choice', color: 'var(--orange)', desc: 'ASCII 아트 이미지를 보고 정답 항목을 선택하는 방식' },
            { type: 'drag',   color: 'var(--ok)',     desc: '드래그 궤적을 분석해 사람 여부를 판별하는 방식' },
          ].map(t => (
            <div key={t.type} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
              <span style={{ background: t.color, color: '#fff', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{t.type}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{t.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'rgba(244,166,42,.12)', border: '1px solid rgba(244,166,42,.45)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)', marginBottom: 6 }}>💡 권장 구현</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            CAPTCHA 문제는 사용자 행동이 필요한 시점 직전에 요청하세요.<br/>
            (예: 결제 버튼 클릭 → CAPTCHA 요청 → 사용자에게 표시)
          </p>
        </div>
      </div>
    ),
  },
  {
    n: '03',
    color: 'var(--ok)',
    shadow: '0 0 0 1px rgba(34,197,94,.22), 0 12px 36px rgba(34,197,94,.32)',
    title: '검증 / Token',
    desc: '사용자 응답 전송 후 일회성 통과 Token을 수신합니다.',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          사용자가 CAPTCHA를 완료하면 서버에서 응답을 검증합니다.<br/>
          검증 성공 시 일회성 Token이 발급되며, 이후 요청에 사용합니다.
        </p>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>검증 요청</div>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#C8E87A', padding: '14px 16px', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
{`POST https://api.vlur.dev/v1/verify
Authorization: Bearer $VLUR_API_KEY
Content-Type: application/x-www-form-urlencoded

captcha_id=cap_abc123&answer=banana`}
          </pre>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>응답 예시</div>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#86efac', padding: '14px 16px', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
{`{
  "success": true,
  "token": "vlur_tok_7f3aB2xYz...",
  "expires_in": 180
}`}
          </pre>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Token 활용</div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink-soft)' }}>발급된 Token을 이후 결제·주문 요청 헤더에 포함하세요.</p>
          <pre style={{ margin: 0, background: '#1a1a1a', color: '#93c5fd', padding: '14px 16px', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.8 }}>
{`POST /api/orders
X-Captcha-Token: vlur_tok_7f3aB2xYz...
Content-Type: application/json

{ "seat_id": "B-12-08", "amount": 134000 }`}
          </pre>
        </div>

        <div style={{ background: 'rgba(46,158,107,.12)', border: '1px solid rgba(46,158,107,.4)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ok)', marginBottom: 6 }}>✓ Token 규칙</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
            <li>1회 사용 후 즉시 만료됩니다.</li>
            <li>발급 후 <strong>180초(3분)</strong> 이내에 사용해야 합니다.</li>
            <li>서버에서 Token 유효성을 재검증한 뒤 주문을 처리하세요.</li>
          </ul>
        </div>
      </div>
    ),
  },
];

function StepModal({ stepIndex, onClose, onMove }) {
  const step = STEPS[stepIndex];
  const total = STEPS.length;
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [stepIndex]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(36,27,21,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 'var(--r)', width: '100%', maxWidth: 580, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: 11, color: step.color, fontWeight: 700, letterSpacing: '.12em' }}>STEP {step.n} / 0{total}</span>
              <h2 style={{ margin: '5px 0 0', fontSize: 20, fontFamily: 'var(--disp)', fontWeight: 700, letterSpacing: '-.02em' }}>{step.title}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', lineHeight: 1, padding: 4 }}>✕</button>
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => onMove(i)}
                style={{
                  width: i === stepIndex ? 24 : 8, height: 8, borderRadius: 999,
                  background: i === stepIndex ? step.color : 'var(--line)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'width .2s, background .2s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          style={{ overflowY: 'auto', overflowAnchor: 'none', padding: '20px 24px', flex: 1 }}
        >
          {step.body}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => onMove(stepIndex - 1)}
            disabled={stepIndex === 0}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'none', cursor: stepIndex === 0 ? 'default' : 'pointer', fontSize: 14, color: stepIndex === 0 ? 'var(--muted)' : 'var(--ink)', fontWeight: 600, opacity: stepIndex === 0 ? 0.4 : 1 }}
          >
            이전
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{stepIndex + 1} / {total}</span>
          {stepIndex < total - 1 ? (
            <button
              onClick={() => onMove(stepIndex + 1)}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: step.color, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
            >
              다음
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: step.color, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
            >
              완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuidePage({ openPage }) {
  const [hovered, setHovered] = useState(null);
  const [modalStep, setModalStep] = useState(null);

  return (
    <section className="band" id="guide">
      <div className="wrap">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">Guide · API 사용법</span>
          <h2>VLUR CAPTCHA 연동 가이드</h2>
          <p>3단계로 봇 차단을 시작하세요. API Key 발급부터 토큰 검증까지 모두 안내합니다.</p>
        </div>

        <div className="flow" style={{ marginBottom: 48 }}>
          {STEPS.map((s, i) => {
            const isHovered = hovered === s.n;
            return (
              <div
                className="step"
                key={s.n}
                data-reveal
                data-reveal-delay={i * 200}
                onClick={() => setModalStep(i)}
                style={{
                  borderTop: `3px solid ${s.color}`,
                  transition: 'opacity 0.6s cubic-bezier(0.25, 0.10, 0.25, 1.00), transform 0.18s ease, box-shadow 0.18s ease',
                  transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: isHovered ? s.shadow : undefined,
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHovered(s.n)}
                onMouseLeave={() => setHovered(null)}
              >
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <span style={{ fontSize: 12, color: s.color, fontWeight: 700, marginTop: 8, display: 'inline-block' }}>자세히 보기 →</span>
              </div>
            );
          })}
        </div>

        <div className="case-card" data-reveal style={{ marginTop: 0, background: 'var(--peach)', border: '1px solid var(--peach-deep)' }}>
          <div className="case-icon">📌</div>
          <h3>빠른 연동 — 위젯 한 줄</h3>
          <p>프론트엔드에 스크립트 태그 하나로 위젯을 추가할 수 있습니다.</p>
          <pre className="pg-code" style={{ margin: '10px 0 0' }}>{WIDGET_CODE}</pre>
        </div>
      </div>

      {modalStep !== null && (
        <StepModal
          stepIndex={modalStep}
          onClose={() => setModalStep(null)}
          onMove={setModalStep}
        />
      )}
    </section>
  );
}
