export const CAPTCHA_THEME_PRESETS = {
  orange: { label: '연주황', accent: '#F0691E', soft: '#FBEBDD' },
  purple: { label: '보라', accent: '#7C5CE7', soft: '#EEE9FF' },
  blue: { label: '파랑', accent: '#2F75DC', soft: '#E7F0FF' },
};

export function normalizeHexColor(value) {
  const matched = String(value || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!matched) return null;
  let hex = matched[1];
  if (hex.length === 3) hex = [...hex].map((channel) => channel + channel).join('');
  return `#${hex.toUpperCase()}`;
}

export function mixHexColors(color, target = '#FFFFFF', targetRatio = 0.5) {
  const sourceHex = normalizeHexColor(color) || '#F0691E';
  const targetHex = normalizeHexColor(target) || '#FFFFFF';
  const ratio = Math.min(1, Math.max(0, targetRatio));
  const mixChannel = (start) => Math.round(
    parseInt(sourceHex.slice(start, start + 2), 16) * (1 - ratio)
      + parseInt(targetHex.slice(start, start + 2), 16) * ratio
  );
  return `#${[1, 3, 5].map((start) => mixChannel(start).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function resolveCaptchaTheme(value) {
  if (CAPTCHA_THEME_PRESETS[value]) return { id: value, isCustom: false, foreground: '#FFFFFF', ...CAPTCHA_THEME_PRESETS[value] };
  const accent = normalizeHexColor(value) || CAPTCHA_THEME_PRESETS.orange.accent;
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(accent.slice(start, start + 2), 16));
  const foreground = (red * 299 + green * 587 + blue * 114) / 1000 >= 160 ? '#241B15' : '#FFFFFF';
  return {
    id: accent,
    isCustom: true,
    label: '직접 설정',
    accent,
    soft: mixHexColors(accent, '#FFFFFF', 0.88),
    foreground,
  };
}
