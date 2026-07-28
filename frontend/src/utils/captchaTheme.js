export const CAPTCHA_THEME_PRESETS = {
  orange: { label: '연주황', accent: '#FF8A3D', soft: '#FBEBDD' },
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
  const sourceHex = normalizeHexColor(color) || '#FF8A3D';
  const targetHex = normalizeHexColor(target) || '#FFFFFF';
  const ratio = Math.min(1, Math.max(0, targetRatio));
  const mixChannel = (start) => Math.round(
    parseInt(sourceHex.slice(start, start + 2), 16) * (1 - ratio)
      + parseInt(targetHex.slice(start, start + 2), 16) * ratio
  );
  return `#${[1, 3, 5].map((start) => mixChannel(start).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hexToHsv(value) {
  const hex = normalizeHexColor(value) || CAPTCHA_THEME_PRESETS.orange.accent;
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    h: hue,
    s: max ? (delta / max) * 100 : 0,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, Number(s))) / 100;
  const value = Math.min(100, Math.max(0, Number(v))) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  let channels;

  if (hue < 60) channels = [chroma, x, 0];
  else if (hue < 120) channels = [x, chroma, 0];
  else if (hue < 180) channels = [0, chroma, x];
  else if (hue < 240) channels = [0, x, chroma];
  else if (hue < 300) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];

  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
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
