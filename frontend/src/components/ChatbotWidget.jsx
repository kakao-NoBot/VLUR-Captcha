import React, { useState, useRef, useEffect } from 'react';
import api from '../api/axios';

const FAQ_TREE = [
  {
    q: 'API Key 발급은 어떻게 하나요?',
    a: '이용 신청 페이지에서 요금제를 선택 후 신청하면 즉시 발급됩니다. 마이페이지 > API Key 관리에서도 확인할 수 있어요.',
    follow: ['요금제 종류가 궁금해요', '마이페이지는 어디 있나요?'],
    keywords: ['api key', 'apikey', '키 발급', '발급', '키 신청', '신청'],
  },
  {
    q: '봇 차단율이 얼마나 되나요?',
    a: '자체 데이터셋 기준 분류 정확도는 97.5%, 실제 사람을 봇으로 오판정하는 오탐률은 0.3% 이하입니다. 드래그 궤적 검증으로 스크립트 봇도 탐지합니다.',
    follow: ['CAPTCHA 유형은 몇 가지인가요?', '검증 속도가 궁금해요'],
    keywords: ['차단율', '봇 차단', '정확도', '탐지율', '차단'],
  },
  {
    q: 'CAPTCHA 유형은 몇 가지인가요?',
    a: '현재 두 가지 유형이 있습니다. 둘 다 경유 지점을 지나 정답 보기를 드래그하는 방식이고, 문제를 아스키아트로 보여주는 방식이 다릅니다.\n• 유형 1 — 한글 지시문을 아스키아트로 표현\n• 유형 2 — 이미지를 아스키아트로 표현\n유형 1 실패 시 유형 2로 자동 전환됩니다.',
    follow: ['API Key 발급은 어떻게 하나요?', '요금제 종류가 궁금해요'],
    keywords: ['유형', '캡차 종류', 'captcha 유형', '종류', '타입'],
  },
  {
    q: '요금제 종류가 궁금해요',
    a: '세 가지 요금제가 있습니다.\n• Basic — 무료 (월 10만 호출)\n• Pro — ₩89,000/월 (월 50만 호출)\n• Enterprise — 문의 (무제한)',
    follow: ['결제는 어떻게 하나요?', 'API Key 발급은 어떻게 하나요?'],
    keywords: ['요금제', '가격', '플랜', 'pro', 'basic', 'enterprise', '비용'],
  },
  {
    q: '결제는 어떻게 하나요?',
    a: '카카오페이 단건결제 또는 토스페이먼츠 결제위젯 v2를 지원합니다. 월 단위 구독이며 언제든지 해지 가능합니다.',
    follow: ['요금제 종류가 궁금해요', '토큰 유효 시간이 얼마인가요?'],
    keywords: ['결제', '카카오페이', '토스', '구독', '해지'],
  },
  {
    q: '결제 내역은 어디서 확인하나요?',
    a: '마이페이지 > 결제 내역 탭에서 결제일, 요금제, 결제 금액, 결제 수단, 상태를 확인할 수 있습니다.',
    follow: ['마이페이지는 어디 있나요?', '결제는 어떻게 하나요?'],
    keywords: ['결제 내역', '결제내역', '결제 확인', '영수증'],
  },
  {
    q: '토큰 유효 시간이 얼마인가요?',
    a: '검증 성공 후 발급되는 one-time token의 기본 유효 시간은 180초(3분)입니다. 재사용이 불가하며 만료 시 CAPTCHA를 다시 풀어야 합니다.',
    follow: ['CAPTCHA 유형은 몇 가지인가요?', 'React/Vue SDK 지원하나요?'],
    keywords: ['토큰', '유효시간', '만료', 'token'],
  },
  {
    q: '검증 속도가 궁금해요',
    a: '검증 처리량은 레코드 단위로 초당 25~40건입니다. 정답 키 + 드래그 궤적 채점까지 포함한 기준입니다.',
    follow: ['봇 차단율이 얼마나 되나요?', 'API Key 발급은 어떻게 하나요?'],
    keywords: ['속도', '응답시간', '검증 속도', 'ms', '레이턴시'],
  },
  {
    q: 'React/Vue SDK 지원하나요?',
    a: '네! React, Vue, FastAPI, Node.js, Django 등 다양한 SDK 플러그인을 지원합니다. 이용 신청 완료 후 가이드 페이지에서 확인하세요.',
    follow: ['API Key 발급은 어떻게 하나요?', '요금제 종류가 궁금해요'],
    keywords: ['sdk', 'react', 'vue', 'fastapi', 'django', '연동'],
  },
  {
    q: '마이페이지는 어디 있나요?',
    a: '우측 상단 [로그인] 버튼으로 로그인 후 마이페이지에서 API Key 관리, 사용량 조회 등을 확인할 수 있습니다.',
    follow: ['API Key 발급은 어떻게 하나요?', '결제는 어떻게 하나요?'],
    keywords: ['마이페이지', '로그인', '사용량'],
  },
  {
    q: '비밀번호는 어떻게 변경하나요?',
    a: '마이페이지 > 내 정보 탭에서 [비밀번호 변경] 버튼을 누르고, 현재 비밀번호 확인 후 새 비밀번호(8~16자, 영문 대소문자·숫자·특수문자 포함)를 입력하면 변경됩니다.',
    follow: ['마이페이지는 어디 있나요?', '계정 탈퇴는 어떻게 하나요?'],
    keywords: ['비밀번호', '비밀번호 변경', '패스워드', 'password', '비번'],
  },
  {
    q: '계정 탈퇴는 어떻게 하나요?',
    a: '마이페이지 > 계정 탈퇴 탭에서 진행할 수 있습니다. 탈퇴 시 API Key와 계정 데이터가 삭제되며 복구할 수 없어요.',
    follow: ['마이페이지는 어디 있나요?', '비밀번호는 어떻게 변경하나요?'],
    keywords: ['탈퇴', '계정 삭제', '회원 탈퇴', '계정 탈퇴'],
  },
];

function TypingBubble() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--orange)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z"/>
        </svg>
      </div>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '4px 14px 14px 14px',
        padding: '12px 16px', display: 'flex', gap: 4, alignItems: 'center',
        boxShadow: '0 1px 4px rgba(36,27,21,.07)',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-soft)',
            opacity: 0.5, animation: `chatbot-blink 1.2s ${i * 0.2}s infinite`,
          }}/>
        ))}
        <style>{'@keyframes chatbot-blink { 0%, 60%, 100% { opacity: .25 } 30% { opacity: .9 } }'}</style>
      </div>
    </div>
  );
}

function BotBubble({ text }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--orange)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z"/>
        </svg>
      </div>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '4px 14px 14px 14px',
        padding: '10px 14px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6,
        maxWidth: '82%', whiteSpace: 'pre-line',
        boxShadow: '0 1px 4px rgba(36,27,21,.07)',
      }}>
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: 'var(--orange)', color: '#fff',
        borderRadius: '14px 4px 14px 14px',
        padding: '10px 14px', fontSize: 13.5, lineHeight: 1.6,
        maxWidth: '82%',
      }}>
        {text}
      </div>
    </div>
  );
}

// FAQ 트리거 바로 위에 작게 뜨는 카드 위젯(ChatGPT의 + 메뉴 참고). 화면을 덮지 않고
// 항목 4개 정도가 보이도록 하고, 그 이상은 스크롤로 본다.
function FaqSheet({ onSelect, onClose, triggerRef }) {
  const cardRef = useRef(null);

  // 전체를 덮는 오버레이 대신 바깥 클릭만 감지 — 오버레이를 두면 뒤 채팅 스크롤이 막혀버림.
  // 토글 버튼(triggerRef)까지 "바깥"으로 치면 mousedown이 먼저 닫고 뒤이은 click이 다시 열어
  // 버튼이 안 먹는 것처럼 보이므로, 버튼 클릭은 바깥 클릭 판정에서 제외한다.
  useEffect(() => {
    const handleClickAway = (e) => {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      if (triggerRef?.current && triggerRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [onClose, triggerRef]);

  return (
    <div
      ref={cardRef}
      style={{
        position: 'absolute', left: 10, right: 10, bottom: 60,
        zIndex: 50, background: 'var(--paper)', border: '1px solid var(--line)',
        borderRadius: 18, boxShadow: '0 14px 32px -12px rgba(36,27,21,.32)',
        overflow: 'hidden',
        animation: 'chatbot-sheet-in .16s cubic-bezier(.22,.85,.4,1) both',
      }}
    >
      {/* 스크롤바가 둥근 모서리를 뚫고 나오지 않도록 스크롤은 안쪽 레이어에서만 처리한다.
          참고 이미지처럼 항목 수를 딱 맞추려 하지 않고 자연스럽게 넘치면 스크롤로 본다. */}
      <div
        className="chatbot-suggest-scroll"
        style={{ maxHeight: 110, overflowY: 'auto', padding: '10px' }}
      >
        {FAQ_TREE.map((item) => (
          <button
            key={item.q}
            onClick={() => onSelect(item.q)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
              background: 'var(--paper)', border: 'none',
              borderRadius: 14, marginBottom: 6,
              padding: '9px 12px 9px 8px', fontSize: 13.5, color: 'var(--ink)',
              textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--body)', fontWeight: 500,
              transition: '.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--peach)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: '50%', background: 'var(--peach)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.4" strokeLinecap="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z"/>
              </svg>
            </span>
            {item.q}
          </button>
        ))}
      </div>
      <style>{`
        @keyframes chatbot-sheet-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: 'bot', text: '안녕하세요! VLUR CAPTCHA 챗봇입니다.\n궁금한 내용을 선택하거나 직접 질문해 주세요.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [faqSheetOpen, setFaqSheetOpen] = useState(false);
  const bottomRef = useRef(null);
  const faqButtonRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  const handleSelect = (question) => {
    const item = FAQ_TREE.find(f => f.q === question);
    const newMsgs = [
      ...messages,
      { type: 'user', text: question },
      { type: 'bot', text: item ? item.a : '죄송해요, 해당 질문에 대한 답변을 찾지 못했습니다. 가이드 페이지를 확인하거나 직접 문의해 주세요.' },
    ];
    setMessages(newMsgs);
    setFaqSheetOpen(false);
  };

  // 자유 입력 질문에서 FAQ 키워드가 발견되면 API 호출 없이 즉시 정확한 답변을 준다.
  // 배열 순서상 먼저 나온 항목이 아니라, 가장 길게(구체적으로) 일치하는 키워드를 가진 항목을 고른다
  // (예: "결제 내역"이 "결제"보다 더 구체적이므로 우선 매칭되어야 함).
  const matchFaqByKeyword = (text) => {
    const normalized = text.toLowerCase();
    let best = null;
    let bestLength = 0;
    for (const item of FAQ_TREE) {
      for (const kw of item.keywords) {
        const kwLower = kw.toLowerCase();
        if (normalized.includes(kwLower) && kwLower.length > bestLength) {
          best = item;
          bestLength = kwLower.length;
        }
      }
    }
    return best;
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const withUser = [...messages, { type: 'user', text: q }];
    setMessages(withUser);

    const matched = matchFaqByKeyword(q);
    if (matched) {
      setMessages([...withUser, { type: 'bot', text: matched.a }]);
      return;
    }

    setLoading(true);

    try {
      const history = withUser.slice(-10).map(m => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
      const { data } = await api.post('/chatbot', { messages: history });
      setMessages([...withUser, { type: 'bot', text: data.answer }]);
    } catch (err) {
      setMessages([
        ...withUser,
        {
          type: 'bot',
          text: typeof err.response?.data?.detail === 'string'
            ? err.response.data.detail
            : err.response?.data?.detail?.message
              || '죄송해요, 지금은 답변을 드리기 어려워요. 잠시 후 다시 시도하거나 아래 자주 묻는 질문을 이용해 주세요.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        className="fab"
        aria-label="챗봇 열기"
        onClick={() => setOpen(o => !o)}
        style={{ zIndex: 60 }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z"/>
          </svg>
        )}
      </button>

      {/* Chat window — 바깥 래퍼는 overflow를 자르지 않아서 FaqSheet가 창 경계를 넘어 커질 수 있다 */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 96,
          zIndex: 200,
          width: 360,
          maxWidth: 'calc(100vw - 48px)',
          height: 'min(540px, calc(100dvh - 196px), calc(100vh - 196px))',
        }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 20, boxShadow: '0 24px 60px -16px rgba(36,27,21,.28)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(120deg, var(--orange), var(--gold))',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z"/>
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 14 }}>VLUR CAPTCHA 챗봇</div>
              <div style={{ color: 'rgba(255,255,255,.8)', fontSize: 11 }}>자주 묻는 질문 안내</div>
            </div>
          </div>

          {/* Messages */}
          <div className="chatbot-suggest-scroll" style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {messages.map((m, i) =>
              m.type === 'bot'
                ? <BotBubble key={i} text={m.text} />
                : <UserBubble key={i} text={m.text} />
            )}

            {loading && <TypingBubble />}
            <div ref={bottomRef}/>
          </div>

          {/* 입력창 */}
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 8 }}>
            <button
              ref={faqButtonRef}
              type="button"
              onClick={() => setFaqSheetOpen(o => !o)}
              disabled={loading}
              aria-label="자주 묻는 질문"
              style={{
                background: faqSheetOpen ? 'var(--orange)' : 'var(--card)',
                border: faqSheetOpen ? 'none' : '1.5px solid var(--line)',
                borderRadius: 10,
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading ? 'default' : 'pointer', flexShrink: 0, opacity: loading ? 0.5 : 1,
                zIndex: 2,
              }}
            >
              {faqSheetOpen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              )}
            </button>

            <input
              className="pg-input"
              placeholder="직접 질문하기..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                // 한글 등 IME 조합 중 Enter는 조합 확정용이라 전송하면 안 됨 (마지막 글자가 분리되어 다시 전송되는 버그 방지)
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend();
              }}
              disabled={loading}
              style={{ flex: 1, padding: '9px 12px', fontSize: 13.5, borderRadius: 10, zIndex: 2 }}
            />
            <button onClick={handleSend} disabled={loading} style={{
              background: 'var(--orange)', border: 'none', borderRadius: 10,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'default' : 'pointer', flexShrink: 0, opacity: loading ? 0.5 : 1,
              zIndex: 2,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/>
              </svg>
            </button>
          </div>
        </div>

        {faqSheetOpen && (
          <FaqSheet
            onSelect={handleSelect}
            onClose={() => setFaqSheetOpen(false)}
            triggerRef={faqButtonRef}
          />
        )}
        </div>
      )}
    </>
  );
}
