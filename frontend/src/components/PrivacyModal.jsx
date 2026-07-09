import React, { useEffect, useRef } from 'react';

const SECTIONS = [
  {
    title: '1. 수집하는 개인정보 항목',
    body: `VLUR은 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.

• 필수 항목: 이메일 주소, 비밀번호(암호화 저장), 서비스 이용 기록, API 호출 로그, 접속 IP 주소, 쿠키 및 방문 일시
• 선택 항목: 회사명, 담당자 이름, 연락처 (엔터프라이즈 문의 시)

결제 과정에서 카드 번호 등 결제 정보는 PG사(Payment Gateway)를 통해 처리되며, VLUR은 해당 정보를 직접 저장하지 않습니다.`,
  },
  {
    title: '2. 개인정보의 수집 및 이용 목적',
    body: `수집한 개인정보는 다음 목적에 한하여 이용됩니다.

• 회원 가입 및 본인 확인
• API 키 발급 및 서비스 이용 관리
• 요금제 결제 및 이용 내역 제공
• 고객 문의 응대 및 공지사항 전달
• 서비스 품질 개선 및 오류 분석
• 법령에 따른 의무 이행`,
  },
  {
    title: '3. 개인정보의 보유 및 이용 기간',
    body: `회원 탈퇴 시 또는 수집·이용 목적 달성 후 즉시 파기합니다. 단, 관련 법령에 따라 아래 기간 동안 보관합니다.

• 계약 또는 청약 철회 기록: 5년 (전자상거래법)
• 대금 결제 및 재화 공급 기록: 5년 (전자상거래법)
• 소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)
• 접속 로그 및 이용 기록: 3개월 (통신비밀보호법)`,
  },
  {
    title: '4. 개인정보의 제3자 제공',
    body: `VLUR은 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외로 합니다.

• 이용자가 사전에 동의한 경우
• 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우`,
  },
  {
    title: '5. 개인정보 처리의 위탁',
    body: `VLUR은 서비스 향상을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있습니다.

• 클라우드 인프라 운영: Amazon Web Services (AWS) — 서버 및 데이터 저장
• 결제 처리: 토스페이먼츠 — 결제 정보 처리
• 이메일 발송: 외부 이메일 서비스 — 서비스 안내 및 인증 메일 발송

위탁 계약 시 개인정보가 안전하게 관리될 수 있도록 관련 사항을 규정하고 있습니다.`,
  },
  {
    title: '6. 이용자의 권리 및 행사 방법',
    body: `이용자는 언제든지 아래 권리를 행사할 수 있습니다.

• 개인정보 열람 요청
• 오류 정정 요청
• 삭제 요청 (단, 법령에 의해 보관 의무가 있는 정보 제외)
• 처리 정지 요청

권리 행사는 마이페이지 또는 고객센터 이메일(privacy@vlur.io)을 통해 요청하실 수 있으며, 요청 접수 후 10일 이내에 처리 결과를 안내해 드립니다.`,
  },
  {
    title: '7. 개인정보 보호책임자',
    body: `개인정보 처리에 관한 업무를 총괄하고, 이용자의 개인정보 관련 문의 및 불만 처리를 담당하는 책임자는 다음과 같습니다.

• 이름: VLUR 개인정보 보호팀
• 이메일: privacy@vlur.io
• 처리 시간: 평일 09:00 – 18:00 (공휴일 제외)`,
  },
  {
    title: '8. 개인정보처리방침의 변경',
    body: `이 개인정보처리방침은 2025년 1월 1일부터 시행됩니다. 법령·서비스 변경 등으로 내용이 변경될 경우, 변경 7일 전부터 공지사항을 통해 안내드립니다.`,
  },
];

function renderBody(text) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    if (line.startsWith('•')) {
      return (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr)', columnGap: 10, alignItems: 'start', margin: '0 0 4px', paddingLeft: 4 }}>
          <span aria-hidden="true" style={{ width: 8, height: '1.75em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-2px)' }}>
            <span style={{ display: 'block', width: 4, height: 4, borderRadius: 999, background: 'var(--orange)' }} />
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.75 }}>{line.slice(1).trim()}</span>
        </div>
      );
    }
    return <p key={i} style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.8, margin: '0 0 6px' }}>{line}</p>;
  });
}

export default function PrivacyModal({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
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
        aria-labelledby="privacy-modal-title"
        onClick={e => e.stopPropagation()}
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
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 4px' }}>VLUR CAPTCHA</p>
            <h2 id="privacy-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--disp)', letterSpacing: '-.01em' }}>개인정보처리방침</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="개인정보처리방침 닫기"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
          {/* 머리말 */}
          <div style={{
            background: 'var(--peach)', border: '1px solid var(--peach-deep)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 24,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
              VLUR은 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령을 준수합니다.<br />
              본 방침은 <strong>2025년 1월 1일</strong>부터 시행됩니다.
            </p>
          </div>

          {/* 섹션 목록 */}
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ marginBottom: i < SECTIONS.length - 1 ? 28 : 0 }}>
              <p style={{
                fontSize: 14, fontWeight: 700, color: 'var(--ink)',
                margin: '0 0 10px', letterSpacing: '-.01em',
                paddingBottom: 8, borderBottom: '1px solid var(--line-soft)',
              }}>{s.title}</p>
              <div>{renderBody(s.body)}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid var(--line-soft)',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button type="button" className="btn btn-primary" onClick={onClose}
            style={{ fontSize: 14, padding: '9px 22px' }}>확인</button>
        </div>
      </section>
    </div>
  );
}
