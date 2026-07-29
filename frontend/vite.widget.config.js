// vite.widget.config.js
// vlur-captcha.js — 제3자 사이트가 <script src="https://vlur.site/static/widget/vlur-captcha.js">로
// 불러오는 자기완결형 임베드 번들. React/ReactDOM을 포함해 통째로 IIFE 하나로 묶고
// (호스트 페이지가 React를 갖고 있을 거라고 가정하지 않는다), CSS는 widget/main.jsx에서
// ?inline으로 문자열째 가져와 JS 안에 직접 주입하므로 별도 .css 산출물이 없다.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // vite build.lib 모드는 "다른 번들러가 소비할 라이브러리"를 만드는 걸 전제로 해서
  // process.env.NODE_ENV를 일부러 치환하지 않는다 — 근데 이 위젯은 그냥 브라우저에 바로
  // <script>로 박히는 독립 실행 스크립트라 process 자체가 없다(React 내부가
  // process.env.NODE_ENV를 참조해서 "process is not defined"로 죽는다). 명시적으로 치환.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/widget/main.jsx',
      name: 'VlurCaptchaWidget',
      formats: ['iife'],
      fileName: () => 'vlur-captcha.js',
    },
    rollupOptions: {
      output: {
        // IIFE 빌드에선 청크 분리를 안 하므로 산출물은 항상 vlur-captcha.js 하나.
        inlineDynamicImports: true,
      },
    },
  },
});
