import re


CAPTCHA_THEME_PRESETS = {
    "orange": {"label": "연주황", "accent": "#FF8A3D", "soft": "#FBEBDD"},
    "purple": {"label": "보라", "accent": "#7C5CE7", "soft": "#EEE9FF"},
    "blue": {"label": "파랑", "accent": "#2F75DC", "soft": "#E7F0FF"},
}

DEFAULT_CAPTCHA_THEME = "orange"
HEX_COLOR_PATTERN = re.compile(r"^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def normalize_captcha_theme(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in CAPTCHA_THEME_PRESETS:
        return normalized
    if not HEX_COLOR_PATTERN.fullmatch(normalized):
        return None

    hex_value = normalized.removeprefix("#")
    if len(hex_value) == 3:
        hex_value = "".join(channel * 2 for channel in hex_value)
    return f"#{hex_value.upper()}"


def _mix_with_white(hex_color: str, white_ratio: float = 0.88) -> str:
    channels = [int(hex_color[index:index + 2], 16) for index in (1, 3, 5)]
    mixed = [round(channel * (1 - white_ratio) + 255 * white_ratio) for channel in channels]
    return "#" + "".join(f"{channel:02X}" for channel in mixed)


def _foreground_for(hex_color: str) -> str:
    red, green, blue = [int(hex_color[index:index + 2], 16) for index in (1, 3, 5)]
    brightness = (red * 299 + green * 587 + blue * 114) / 1000
    return "#241B15" if brightness >= 160 else "#FFFFFF"


def serialize_captcha_theme(theme_id: str | None) -> dict:
    normalized = normalize_captcha_theme(theme_id) or DEFAULT_CAPTCHA_THEME
    if normalized in CAPTCHA_THEME_PRESETS:
        return {
            "id": normalized,
            "is_custom": False,
            "foreground": "#FFFFFF",
            **CAPTCHA_THEME_PRESETS[normalized],
        }
    return {
        "id": normalized,
        "is_custom": True,
        "label": "직접 설정",
        "accent": normalized,
        "soft": _mix_with_white(normalized),
        "foreground": _foreground_for(normalized),
    }
