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
    a: '현재 목표 지표는 봇 차단율 99.2%, 분류 정확도 98.6%입니다. 드래그 궤적 검증으로 스크립트 봇도 탐지합니다.',
    follow: ['CAPTCHA 유형은 몇 가지인가요?', '검증 속도가 궁금해요'],
    keywords: ['차단율', '봇 차단', '정확도', '탐지율', '차단'],
  },
  {
    q: 'CAPTCHA 유형은 몇 가지인가요?',
    a: '현재 두 가지 유형이 있습니다.\n• 유형 1 — 드래그-투-타깃\n• 유형 2 — 4지선다 클릭\n유형 2 실패 시 유형 1로 자동 폴백됩니다.',
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
    a: 'KakaoPay 단건결제 또는 토스페이먼츠 결제위젯 v2를 지원합니다. 월 단위 구독이며 언제든지 해지 가능합니다.',
    follow: ['요금제 종류가 궁금해요', '토큰 유효 시간이 얼마인가요?'],
    keywords: ['결제', '카카오페이', '토스', '구독', '해지'],
  },
  {
    q: '토큰 유효 시간이 얼마인가요?',
    a: '검증 성공 후 발급되는 one-time token의 기본 유효 시간은 180초(3분)입니다. 재사용이 불가하며 만료 시 CAPTCHA를 다시 풀어야 합니다.',
    follow: ['CAPTCHA 유형은 몇 가지인가요?', 'React/Vue SDK 지원하나요?'],
    keywords: ['토큰', '유효시간', '만료', 'token'],
  },
  {
    q: '검증 속도가 궁금해요',
    a: '평균 검증 응답 속도는 약 120ms입니다. 정답 키 + 드래그 궤적 채점까지 포함한 서버 응답 기준입니다.',
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
];

const QUICK_STARTS = [
  'API Key 발급은 어떻게 하나요?',
  '봇 차단율이 얼마나 되나요?',
  'CAPTCHA 유형은 몇 가지인가요?',
  '요금제 종류가 궁금해요',
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

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: 'bot', text: '안녕하세요! VLUR CAPTCHA 챗봇입니다 👋\n궁금한 내용을 선택하거나 직접 질문해 주세요.' },
  ]);
  const [follows, setFollows] = useState(QUICK_STARTS);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

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
    setFollows(item?.follow || QUICK_STARTS);
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const withUser = [...messages, { type: 'user', text: q }];
    setMessages(withUser);
    setFollows([]);
    setLoading(true);

    try {
      const history = withUser.map(m => ({
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
          text: err.response?.data?.detail
            || '죄송해요, 지금은 답변을 드리기 어려워요. 잠시 후 다시 시도하거나 아래 자주 묻는 질문을 이용해 주세요.',
        },
      ]);
    } finally {
      setLoading(false);
      setFollows(QUICK_STARTS);
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

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 96,
          top: 100,
          zIndex: 200,
          width: 360,
          maxWidth: 'calc(100vw - 48px)',
          height: 'min(540px, calc(100dvh - 196px), calc(100vh - 196px))',
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
          <div style={{
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

            {/* Follow-up suggestions */}
            {follows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {follows.map(f => (
                  <button key={f} onClick={() => handleSelect(f)} style={{
                    background: 'var(--card)', border: '1.5px solid var(--line)',
                    borderRadius: 10, padding: '8px 12px', fontSize: 12.5,
                    color: 'var(--ink-soft)', textAlign: 'left', cursor: 'pointer',
                    transition: '.15s', fontFamily: 'var(--body)', fontWeight: 500,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.color = 'var(--orange-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 8 }}>
            <input
              className="pg-input"
              placeholder="직접 질문하기..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={loading}
              style={{ flex: 1, padding: '9px 12px', fontSize: 13, borderRadius: 10 }}
            />
            <button onClick={handleSend} disabled={loading} style={{
              background: 'var(--orange)', border: 'none', borderRadius: 10,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'default' : 'pointer', flexShrink: 0, opacity: loading ? 0.5 : 1,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}