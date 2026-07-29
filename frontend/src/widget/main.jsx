// main.jsx (widget entry)
// 제3자 사이트가 <script src=".../vlur-captcha.js" async defer></script>로 불러오는
// 임베드 스크립트의 시작점. DOM에서 아래 계약을 만족하는 엘리먼트를 찾아 자동으로 마운트한다.
//
//   <div class="vlur-captcha" data-sitekey="pk-..." data-callback="onVlurVerified"></div>
//
// - data-sitekey: 필수. 발급받은 Site Key(GuidePage 참고).
// - data-callback: 선택. 검증 성공 시 호출할 전역 함수 이름(reCAPTCHA와 동일한 관례).
//
// 호스트 페이지 스타일과 절대 섞이지 않도록 각 마운트 지점을 Shadow DOM으로 격리하고,
// widget/captcha-widget.css를 그 안에 직접 주입한다 — 별도 CSS 요청이 필요 없는 완전한
// 자기완결형 번들이 되도록 vite.widget.config.js에서 이 파일 하나를 IIFE로 빌드한다.
//
// 티켓온처럼 모달을 열 때만 .vlur-captcha 엘리먼트를 렌더링하는 SPA도 지원해야 하므로,
// 스크립트 로드 시점의 1회성 스캔에 더해 MutationObserver로 이후에 추가되는 엘리먼트도
// 계속 감시해서 마운트한다.

import React from 'react';
import { createRoot } from 'react-dom/client';
import CaptchaWidget from './CaptchaWidgetCore';
import widgetCss from './captcha-widget.css?inline';

const MOUNT_SELECTOR = '.vlur-captcha[data-sitekey]';
const MOUNTED_ATTR = 'data-vlur-mounted';

function detectThemeMode() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function mount(el) {
  if (!(el instanceof HTMLElement) || el.getAttribute(MOUNTED_ATTR) === 'true') return;
  el.setAttribute(MOUNTED_ATTR, 'true');

  const siteKey = el.getAttribute('data-sitekey');
  const callbackName = el.getAttribute('data-callback');

  const shadow = el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = widgetCss;
  shadow.appendChild(style);
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  // 드래그 중 커서를 따라다니는 고스트 타일은 .demo(overflow:hidden) 밖으로 자유롭게
  // 나가야 해서 React portal로 렌더링된다 — 이 컨테이너를 shadow root의 mountPoint와
  // 형제로 둬서, document.body(shadow 밖, 위젯 CSS가 안 닿는 곳)로 새지 않게 한다.
  const portalHost = document.createElement('div');
  shadow.appendChild(portalHost);

  const handleVerified = () => {
    const callback = callbackName && window[callbackName];
    if (typeof callback === 'function') callback();
  };

  createRoot(mountPoint).render(
    <CaptchaWidget
      siteKey={siteKey}
      themeMode={detectThemeMode()}
      onVerified={handleVerified}
      portalContainer={portalHost}
    />
  );
}

function scan(root) {
  root.querySelectorAll(MOUNT_SELECTOR).forEach(mount);
}

function observeFutureMounts() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.(MOUNT_SELECTOR)) mount(node);
        node.querySelectorAll?.(MOUNT_SELECTOR).forEach(mount);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  scan(document);
  observeFutureMounts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 필요하면 호스트 페이지가 직접 특정 엘리먼트를 렌더링하도록 여는 창구(선택 사용).
window.VlurCaptcha = { render: mount };
