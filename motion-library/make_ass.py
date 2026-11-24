#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make_ass.py — 큐(cues) + 프리셋을 한국어 모션 자막 .ass 로 컴파일한다.

프리셋·테마 정의는 `presets/korean-motion-presets.json` 하나만 읽는다(단일 기준).
motions.js(브라우저 Canvas)와 같은 숫자를 쓰므로 미리보기와 결과물이 어긋나지 않는다.

  python3 make_ass.py --cues presets/cues-sample.json --preset pop-bounce --theme reels-dark -o out/subs.ass
  python3 make_ass.py --cues cues.json --preset chip-wipe --burn in.mp4 --video-out out/graphics.mp4
  python3 make_ass.py --list-presets

지원 모드(프리셋의 mode 값) — Canvas 렌더 경로와 1:1 대응:
  none, line, lines, chip, word, char(≈word), karaoke, typewriter, count, shake, glitch

ASS에서 구현한 핵심 기법(insta-reel-editor-skill의 FFmpeg 엔진에서 검증된 방식):
  · PlayResX/Y = 1080x1920 (없으면 384x288 기준이 되어 크기가 어긋난다)
  · WrapStyle 2 — 자동 줄바꿈을 끄고 우리가 \\N 으로 직접 끊는다(한국어 줄바꿈 규칙 적용)
  · 색은 &HAABBGGRR (알파 먼저, 그다음 BGR)
  · 카라오케/팝 = 낱말 구간마다 Dialogue 이벤트 1개, 페이지 전체를 다시 쓰고 활성 낱말만 태그로 강조
    → 레이아웃이 흔들리지 않고 단어 동기가 정확하다. 아직 안 나온 낱말은 {\\alpha&HFF&} 로 숨긴다(자리 유지).
  · libass는 CSS px보다 글자를 작게 읽으므로 fontScale(기본 1.2)을 곱한다.

외부 패키지 없음(표준 라이브러리만).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_PRESETS = HERE / "presets" / "korean-motion-presets.json"

# libass는 Fontsize를 '폰트의 em 상자' 기준으로 해석해 CSS px보다 훨씬 작게 그린다.
# 실측(Noto Sans CJK KR, 1080x1920, PlayRes 동일):
#   Fontsize 100 → 한글 '가' advance 63.7px (0.637 em), 잉크 높이 63px
#   Chromium Canvas 62.1px(굵게) → 같은 줄 잉크높이 58px
# 둘을 맞추는 값이 1.45 (글자 높이 기준). 폰트가 바뀌면 --font-scale 로 조정한다.
LIBASS_SCALE = 1.45


# ----------------------------------------------------------------- 유틸
def eprint(*a) -> None:
    print(*a, file=sys.stderr, flush=True)


def load_json(path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def ffmpeg_bin() -> str:
    """ffmpeg 실행 파일 경로. PATH → imageio-ffmpeg 번들 순서로 찾는다."""
    env = os.environ.get("FFMPEG")
    if env and pathlib.Path(env).exists():
        return env
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        raise SystemExit("ffmpeg를 찾지 못했습니다. FFMPEG 환경변수로 경로를 지정하세요.")


def media_duration(path) -> float:
    """ffprobe 없이도 동작하도록 ffmpeg -i 의 stderr를 파싱한다."""
    probe = shutil.which("ffprobe")
    if probe:
        r = subprocess.run([probe, "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
        try:
            return float(r.stdout.strip())
        except ValueError:
            pass
    r = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)],
                       capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr)
    if not m:
        raise SystemExit(f"길이를 읽지 못했습니다: {path}")
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def media_size(path) -> tuple[int, int]:
    probe = shutil.which("ffprobe")
    if probe:
        r = subprocess.run([probe, "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
                           capture_output=True, text=True)
        m = re.match(r"(\d+)x(\d+)", r.stdout.strip())
        if m:
            return int(m.group(1)), int(m.group(2))
    r = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", r.stderr)
    if m:
        return int(m.group(1)), int(m.group(2))
    return 1080, 1920


def ass_time(sec: float) -> str:
    """초 → H:MM:SS.cc. 반올림 대신 내림을 쓴다.

    ASS 타임스탬프는 1/100초 단위다. 반올림하면 이어지는 두 이벤트가 같은 시각을
    함께 갖게 되어(예: 3.475 → 둘 다 3.48) 한 프레임에 두 조각이 겹쳐 보인다.
    내림이면 경계값이 정확히 맞아떨어져 겹치지 않는다.
    """
    cs_total = int(math.floor(max(0.0, float(sec)) * 100 + 1e-6))
    h, rem = divmod(cs_total, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ass_color(css: str, alpha: float = 1.0) -> str:
    """'#RRGGBB' / 'rgba(r,g,b,a)' → '&HAABBGGRR'."""
    css = (css or "#FFFFFF").strip()
    a = 1.0 - alpha
    m = re.match(r"rgba?\(([^)]+)\)", css)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        r, g, b = (int(float(x)) for x in parts[:3])
        if len(parts) > 3:
            a = 1.0 - float(parts[3]) * alpha
    else:
        h = css.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) != 6:
            h = "FFFFFF"
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"&H{max(0, min(255, int(round(a * 255)))):02X}{b:02X}{g:02X}{r:02X}"



def rounded_rect_path(w: float, h: float, r: float) -> str:
    r"""ASS 벡터(\p1) 둥근 사각형. 'b'는 3차 베지어(제어점 2개 + 끝점)."""
    r = max(0.0, min(r, w / 2, h / 2))
    if r <= 0.5:
        return f"m 0 0 l {w:.0f} 0 l {w:.0f} {h:.0f} l 0 {h:.0f}"
    k = 0.5523 * r
    return (f"m {r:.0f} 0 l {w - r:.0f} 0 "
            f"b {w - r + k:.0f} 0 {w:.0f} {r - k:.0f} {w:.0f} {r:.0f} "
            f"l {w:.0f} {h - r:.0f} "
            f"b {w:.0f} {h - r + k:.0f} {w - r + k:.0f} {h:.0f} {w - r:.0f} {h:.0f} "
            f"l {r:.0f} {h:.0f} "
            f"b {r - k:.0f} {h:.0f} 0 {h - r + k:.0f} 0 {h - r:.0f} "
            f"l 0 {r:.0f} "
            f"b 0 {r - k:.0f} {r - k:.0f} 0 {r:.0f} 0")


def ass_escape(t: str) -> str:
    """ASS는 '{' 로 태그를 시작하므로 본문의 중괄호·역슬래시를 중화한다."""
    return (t.replace("\\", "/").replace("{", "(").replace("}", ")")
             .replace("\r", " ").replace("\n", " "))


# ------------------------------------------------------- 한국어 폭 추정/줄바꿈
LATIN_W = {" ": 0.26, "i": 0.24, "l": 0.24, "j": 0.24, "t": 0.32, "f": 0.32,
           "r": 0.36, "I": 0.27, "m": 0.82, "w": 0.74, "M": 0.84, "W": 0.92, "J": 0.44}

NO_LINE_START = re.compile(r"^[)\]}〉》」』】〕”’\"'.,!?;:·…%]$")
NO_LINE_END = re.compile(r"[([{〈《「『【〔“‘\"']$")
UNIT_AFTER_NUMBER = re.compile(
    r"^(\d[\d,.]*)\s*(%|원|만|억|천|개|명|분|초|시간|일|주|개월|년|월|위|등|점|배|번|km|kg|g|ml|l|cm|mm|℃|도)$",
    re.I)


def char_w(ch: str) -> float:
    cp = ord(ch)
    if 0x1100 <= cp <= 0x11FF or 0x3130 <= cp <= 0x318F or 0xAC00 <= cp <= 0xD7A3:
        return 1.0
    if 0x4E00 <= cp <= 0x9FFF or 0x3000 <= cp <= 0x30FF:
        return 1.0
    if cp < 128:
        return LATIN_W.get(ch, 0.62 if ch.isupper() else 0.52)
    return 0.58


def text_width(text: str, size: float) -> float:
    return sum(char_w(c) for c in text) * size


def tokenize(text: str) -> list[str]:
    out: list[str] = []
    for w in str(text or "").split():
        m = UNIT_AFTER_NUMBER.match(w)
        if m:
            w = m.group(1) + m.group(2)
        if out and NO_LINE_START.match(w):
            out[-1] += w
        else:
            out.append(w)
    return out


def wrap_korean(text: str, size: float, max_w: float) -> list[str]:
    """한국어 줄바꿈: 공백 단위 + 숫자·단위 묶음 + 문장부호 규칙 + 긴 낱말 글자 분할."""
    lines: list[str] = []
    cur: list[str] = []
    space = 0.26 * size

    def cur_w() -> float:
        return sum(text_width(t, size) for t in cur) + space * max(0, len(cur) - 1)

    for tok in tokenize(text):
        w = text_width(tok, size)
        if cur and cur_w() + space + w > max_w:
            carry: list[str] = []
            while len(cur) > 1 and (NO_LINE_END.search(cur[-1]) or cur[-1] in ("-", "–", "—")):
                carry.insert(0, cur.pop())
            lines.append(" ".join(cur))
            cur = carry[:]
            if not cur and w > max_w:
                line = ""
                for ch in tok:
                    if line and text_width(line + ch, size) > max_w:
                        lines.append(line)
                        line = ch
                    else:
                        line += ch
                if line:
                    cur = [line]
                continue
            cur.append(tok)
        else:
            cur.append(tok)
    if cur:
        lines.append(" ".join(cur))
    return lines or [""]


def balance_lines(lines: list[str], size: float) -> list[str]:
    """두 줄일 때 줄 길이를 고르게(문장부호 뒤에서 끊는 쪽을 살짝 선호) — motions.js와 같은 규칙."""
    if len(lines) != 2:
        return lines
    flat = " ".join(lines).split()
    best, best_score = lines, abs(text_width(lines[0], size) - text_width(lines[1], size))
    for k in range(1, len(flat)):
        a, b = " ".join(flat[:k]), " ".join(flat[k:])
        if not a or not b:
            continue
        score = abs(text_width(a, size) - text_width(b, size))
        if re.search(r"[,;:!?]$", flat[k - 1]):
            score -= 0.18 * size
        if score < best_score - 1e-6:
            best, best_score = [a, b], score
    return best


def layout_block(text: str, size: float, max_w: float, max_lines: int) -> tuple[float, list[str]]:
    """maxLines 안에 들어오도록 글자 크기를 6%씩 줄이고, 두 줄이면 균형을 맞춘다."""
    s = size
    lines = None
    for _ in range(40):
        lines = wrap_korean(text, s, max_w)
        if len(lines) <= max_lines or s <= 22:
            break
        s *= 0.94
    return s, balance_lines(lines or [], s)


def number_tokens(text: str):
    return [(m.start(), m.group(0), float(m.group(0).replace(",", "")))
            for m in re.finditer(r"\d[\d,.]*", text) if m.group(0)]


def format_count(v: float, comma: bool) -> str:
    n = int(round(v))
    s = str(abs(n))
    if comma or abs(n) >= 10000:
        s = re.sub(r"\B(?=(\d{3})+(?!\d))", ",", s)
    return ("-" if n < 0 else "") + s


def count_text(text: str, p: float) -> str:
    out, last = "", 0
    for idx, raw, val in number_tokens(text):
        out += text[last:idx] + format_count(val * p, "," in raw)
        last = idx + len(raw)
    return out + text[last:]


# ----------------------------------------------------------------- 프리셋 해석
@dataclass
class Theme:
    name: str
    font: str
    weight: int
    size_ratio: float
    line_height: float
    letter_spacing: float
    colors: dict
    outline_em: float
    halo_em: float
    shadow_em: float

    @classmethod
    def from_doc(cls, doc: dict, name: str) -> "Theme":
        t = doc["themes"].get(name) or doc["themes"]["reels-dark"]
        c = t.get("colors", {})
        f = doc.get("ass_style", {}).get("font") or "Noto Sans CJK KR"
        return cls(
            name=name, font=f, weight=int(t.get("weight", 700)),
            size_ratio=float(t.get("sizeRatio", 0.0575)),
            line_height=float(t.get("lineHeight", 1.26)),
            letter_spacing=float(t.get("letterSpacing", 0)),
            colors=c, outline_em=float(t.get("outlineEm", 0)),
            halo_em=float(t.get("haloEm", 0)), shadow_em=float(t.get("shadowEm", 0.03)),
        )


@dataclass
class Cue:
    start: float
    end: float
    text: str
    preset: str = ""
    theme: str = ""
    words: list = field(default_factory=list)


class AssCompiler:
    def __init__(self, doc: dict, theme_name: str, preset_name: str,
                 overrides: dict | None = None, font: str | None = None,
                 font_scale: float = LIBASS_SCALE, fps: int = 30,
                 synthetic_bold: bool = False):
        self.doc = doc
        self.theme_name = theme_name
        self.theme = Theme.from_doc(doc, theme_name)
        if font:
            self.theme.font = font
        self.overrides = overrides or {}
        # 캡션 블록의 '가운데 y'(px)를 직접 지정할 수 있다. None이면 캡션 밴드 아래끝을 쓴다.
        self.anchor_center: float | None = None
        self.preset_name = preset_name
        self.fps = fps
        st = doc.get("ass_style", {})
        self.canvas = doc.get("canvas", {})
        self.W = int(self.canvas.get("W", 1080))
        self.H = int(self.canvas.get("H", 1920))
        safe = self.canvas.get("safe", {})
        band = safe.get("caption_band", {"x0": 140, "x1": 940, "y1": 1240})
        self.margin_lr = int(st.get("marginLr", band["x0"] - 0 if False else 140))
        self.caption_bottom = int(st.get("captionBottomY", band.get("y1", 1240)))
        self.max_w = float(band["x1"] - band["x0"])
        self.base_size = self.theme.size_ratio * self.W
        self.font_scale = font_scale
        self._synth_requested = synthetic_bold
        self.synthetic_bold = synthetic_bold and self.theme.weight >= 600
        self._font_override = font
        self.max_lines = int(st.get("maxLines", 2))
        self.events: list[str] = []
        self._styles: dict[tuple, str] = {}      # (preset_id, theme_name) -> style name
        self._used: dict[str, tuple] = {}        # style name -> (pid, preset, theme)
        self.warnings: list[str] = []

    # ---------------------------------------------------------------- 프리셋
    def preset(self, name: str | None) -> dict:
        p = self.doc["presets"].get(name or self.preset_name)
        if not p:
            self.warnings.append(f"프리셋 '{name}' 없음 → outline-basic 사용")
            p = self.doc["presets"]["outline-basic"]
        return p

    def px(self, em: float, size: float) -> int:
        return int(round(em * size))

    # ---------------------------------------------------------------- 스타일
    def style_for_cue(self, pid: str, p: dict, th: Theme) -> str:
        """큐가 쓰는 (프리셋, 테마) 조합마다 스타일을 하나 만든다."""
        key = (pid, th.name)
        if key in self._styles:
            return self._styles[key]
        name = "Cap" if pid == self.preset_name and th.name == self.theme_name else f"S{len(self._styles)}"
        self._styles[key] = name
        self._used[name] = (pid, p, th)
        return name

    def _style_row(self, name: str, pid: str, p: dict, th: Theme) -> str:
        chip = p.get("mode") == "chip"
        em = round(th.size_ratio * self.W, 2)              # 캔버스 px(외곽선·자간 기준)
        size = em * self.font_scale                        # ASS Fontsize(libass 보정)
        outline = 0 if chip else max(0, round(th.outline_em * em))
        spacing = round(th.letter_spacing * em, 1)
        shadow = round(th.shadow_em * em * 2, 1)
        c = th.colors
        if chip:
            box = ass_color(c.get("chip", "rgba(9,12,18,0.8)"))
            return (f"Style: {name},{th.font},{int(size)},"
                    f"{ass_color(c.get('text', '#fff'))},{ass_color(c.get('accent', '#fff'))},"
                    f"{box},{box},-1,0,0,0,100,100,{spacing},0,3,0,0,2,"
                    f"{self.margin_lr},{self.margin_lr},{self.H - self.caption_bottom},1")
        return (f"Style: {name},{th.font},{int(size)},"
                f"{ass_color(c.get('text', '#fff'))},{ass_color(c.get('accent', '#fff'))},"
                f"{ass_color(c.get('outline', '#000'))},"
                f"{ass_color(c.get('shadow', 'rgba(0,0,0,0.7)'))},"
                f"{-1 if th.weight >= 600 else 0},0,0,0,100,100,{spacing},0,1,"
                f"{outline},{shadow},2,{self.margin_lr},{self.margin_lr},"
                f"{self.H - self.caption_bottom},1")

    def styles_block(self) -> str:
        rows = [self._style_row(name, pid, p, th) for name, (pid, p, th) in self._used.items()]
        # 칩 배경(벡터 도형) 전용 스타일 — 색은 이벤트 태그로 덮어쓰므로 흰색 기준
        rows.append("Style: ChipBox,Noto Sans CJK KR,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
                    "0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1")
        return "\n".join(rows)

    # ------------------------------------------------------------- 텍스트
    def emit_text(self, start: float, end: float, style: str, inner: str, body: str,
                  layer: int = 1, on_chip: bool = False) -> None:
        """안쪽 태그(중괄호 없는)와 본문을 받아 이벤트를 낸다. on_chip 이면 흰 판으로 굵기만 보정."""
        if on_chip and self.synthetic_bold:
            self.add(start, end, style, "{" + inner + "\\bord3\\shad0}" + body, layer - 1, synth=False)
            self.add(start, end, style, "{" + inner + "\\bord0\\shad0}" + body, layer, synth=False)
            return
        self.add(start, end, style, "{" + inner + "}" + body, layer)

    # ---------------------------------------------------------------- 큐
    def layout(self, text: str) -> tuple[float, list[str], float]:
        size = self.base_size
        s, lines = layout_block(text, size, self.max_w, self.max_lines)
        gap = s * self.theme.line_height
        return s, lines, gap

    def add(self, start: float, end: float, style: str, text: str, layer: int = 1,
            synth: bool | None = None) -> None:
        """이벤트 1개를 낸다. synthetic_bold 면 합성 굵기 판을 한 장 더 깐다.

        이 환경의 Noto Sans CJK KR은 Regular 한 벌뿐이라 libass가 Bold를 합성하지 못한다.
        그래서 두 겹으로 그린다:
          1) 뒤 판: \bord{B}(어두운 색) → 글자 실루엣을 B만큼 키운 어두운 덩어리
          2) 앞 판: \bord{B-ring}(글자색) → 글자색 실루엣을 B-ring만큼 키워 위에 얹음
        결과: 글자가 (B-ring)만큼 굵어지고 바깥에 ring 두께의 테두리가 남는다.
        Bold 폰트를 fontsdir에 넣으면 --no-synthetic-bold 로 끄고 Bold=-1 을 그대로 쓴다.
        """
        if end <= start or not text:
            return
        if synth is None:
            synth = self.synthetic_bold
        m = re.match(r"^\{([^{}]*)\}(.*)$", text, re.S)
        if synth and m and "\\p1" not in m.group(1):
            inner, body = m.group(1), m.group(2)
            bord = max(2, int(round(self.theme.outline_em * self.base_size)))
            if bord >= 3 and "\\bord0" not in inner:
                ring = max(2, int(round(bord * 0.55)))
                shadow = int(round(self.theme.shadow_em * self.base_size * 2))
                dark = ass_color(self.theme.colors.get("outline", "#000"))
                tc = ass_color(self.theme.colors.get("text", "#fff"))
                line = f"Dialogue: {layer - 1},{{ts0}},{{ts1}},{style},,0,0,0,,"
                self.events.append(
                    f"Dialogue: {layer - 1},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,"
                    + "{" + inner + f"\\bord{bord}\\shad{shadow}\\1c{dark}\\3c{dark}" + "}" + body)
                self.events.append(
                    f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,"
                    + "{" + inner + f"\\bord{bord - ring}\\shad0\\1c{tc}\\3c{tc}" + "}" + body)
                return
        self.events.append(
            f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}")

    def word_times(self, c: Cue, n: int) -> list[tuple[float, float]]:
        if c.words:
            out = []
            for w in c.words:
                s = float(w.get("s", w.get("start", c.start)))
                e = float(w.get("e", w.get("end", s + 0.2)))
                out.append((s, max(s + 0.02, e)))
            if len(out) == n:
                return out
        span = (c.end - c.start) * 0.82
        per = span / max(1, n)
        return [(c.start + per * i, c.start + per * (i + 1)) for i in range(n)]

    def compile_cue(self, c: Cue) -> None:
        # 큐마다 테마를 바꿀 수 있다(캔버스 렌더러와 같은 규칙)
        th = Theme.from_doc(self.doc, c.theme) if c.theme else Theme.from_doc(self.doc, self.theme_name)
        if self._font_override:
            th.font = self._font_override
        self.theme = th
        self.base_size = th.size_ratio * self.W
        self.synthetic_bold = self._synth_requested and th.weight >= 600

        p = self.preset(c.preset)
        pid = next((k for k, v in self.doc["presets"].items() if v is p), "outline-basic")
        mode = p.get("mode", "line")
        if mode == "none" or not c.text.strip():
            return
        style = self.style_for_cue(pid, p, th)
        size, lines, gap = self.layout(c.text)
        fs = int(round(size * self.font_scale))
        st = p.get("style", {})
        enter, exit_, hold = p.get("enter", {}), p.get("exit", {}), p.get("hold", {})
        frm, to = enter.get("from", {}), exit_.get("to", {})
        accent = ass_color(self.theme.colors.get("accent", "#fff"))
        text_c = ass_color(self.theme.colors.get("text", "#fff"))
        outline_c = ass_color(self.theme.colors.get("outline", "#000"))
        size_tag = f"\\fs{fs}"
        spacing = round(self.theme.letter_spacing * size, 1)
        if spacing:
            size_tag += f"\\fsp{spacing}"
        fade_in = int(p.get("ass", {}).get("fadeIn", 80))
        fade_out = int(p.get("ass", {}).get("fadeOut", 80))
        n = len(lines)
        # \pos(an2)의 y는 위에서부터 잰다 → 캡션 밴드의 '아래끝'(기본 1240)
        # anchor_center 가 있으면 블록 가운데를 그 높이에 맞춘다(웹앱 미리보기와 같은 위치).
        if self.anchor_center is None:
            cap_y = self.caption_bottom
        else:
            cap_y = int(round(self.anchor_center + ((n - 1) * gap + size) / 2))

        def line_pos(i: int) -> int:
            # \an2(아래 중앙) 기준: 마지막 줄이 bottom, 위 줄은 gap 만큼 위
            return int(cap_y - (n - 1 - i) * gap * self.font_scale)

        # ---------------- 등장/퇴장 태그 조합 ----------------
        def enter_tags(k: int = 0) -> str:
            tags = f"{size_tag}\\an2\\pos({self.W // 2},{line_pos(k)})"
            if frm.get("dy"):
                y0 = line_pos(k) - int(frm["dy"] * size)
                tags += f"\\move({self.W // 2},{y0},{self.W // 2},{line_pos(k)},0,{int(enter.get('dur', 0.2) * 1000)})"
            if frm.get("scale") and frm["scale"] != 1:
                sc = int(round(frm["scale"] * 100))
                tags += (f"\\fscx{sc}\\fscy{sc}"
                         f"\\t(0,{int(enter.get('dur', 0.2) * 1000)},\\fscx100\\fscy100)")
            if frm.get("rot"):
                tags += f"\\frz{int(frm['rot'])}"
                tags += (f"\\t(0,{int(enter.get('dur', 0.2) * 1000)},\\frz0)")
            if to.get("scale") and to["scale"] != 1 and exit_.get("dur"):
                d = (c.end - c.start - exit_["dur"]) * 1000
                tags += (f"\\t({int(max(0, d))},{int((c.end - c.start) * 1000)},"
                         f"\\fscx{int(round(to['scale'] * 100))}\\fscy{int(round(to['scale'] * 100))})")
            tags += f"\\fad({fade_in},{fade_out})"
            return tags  # 안쪽 태그만(중괄호는 emit_text가 붙인다)

        if mode in ("line", "lines", "chip"):
            if mode == "lines":
                for i, ln in enumerate(lines):
                    delay = int((i * float(p.get("stagger", 0.06))) * 1000)
                    st0 = c.start + delay / 1000
                    if st0 >= c.end:
                        continue
                    self.emit_text(st0, c.end, style, enter_tags(i), ass_escape(ln))
            elif mode == "chip":
                wipe_ms = int(p.get("ass", {}).get("wipeMs", 280))
                text_delay = int(p.get("ass", {}).get("textDelayMs", 100))
                bw = max(text_width(ln, size) for ln in lines) + size * 1.24 + size * 0.34
                bh = gap * (n - 1) + size * 1.92
                x0 = (self.W - bw) / 2
                y0 = cap_y - bh
                # 칩: \org 로 왼쪽 기준을 잡고 \fscx 0→100 으로 왼쪽→오른쪽 와이프
                draw = (f"{{{size_tag}\\an7\\pos({x0:.0f},{y0:.0f})\\org({x0:.0f},{y0:.0f})"
                        f"\\fscx0\\t(0,{wipe_ms},\\fscx100)\\p1\\bord0\\shad0"
                        f"\\c{ass_color(self.theme.colors.get('chip', 'rgba(9,12,18,0.8)'))}\\alpha&H00&}}"
                        + rounded_rect_path(bw, bh, min(size * 0.30, bh / 2)))
                self.add(c.start, c.end, "ChipBox", draw.replace("\\p1", "\\p1"), layer=0)
                # 강조 바
                if st.get("accentBar"):
                    bx = x0 + size * 0.24
                    by = y0 + bh / 2 - size * 0.52
                    bar = (f"{{{size_tag}\\an7\\pos({bx:.0f},{by:.0f})\\org({bx:.0f},{by:.0f})"
                           f"\\fscx0\\t({wipe_ms},{wipe_ms + 120},\\fscx100)\\p1\\bord0\\shad0"
                           f"\\c{accent}\\alpha&H00&}}m 0 0 l {size * 0.13:.0f} 0 l "
                           f"{size * 0.13:.0f} {size * 1.04:.0f} l 0 {size * 1.04:.0f}")
                    self.add(c.start, c.end, "ChipBox", bar, layer=0)
                for i, ln in enumerate(lines):
                    inner = (f"{size_tag}\\an2\\pos({self.W // 2 + int(size * 0.10)},{line_pos(i)})"
                             f"\\bord0\\shad0\\fad({text_delay},{fade_out})")
                    self.emit_text(c.start, c.end, style, inner, ass_escape(ln), layer=2, on_chip=True)
            else:
                text = "\\N".join(ass_escape(ln) for ln in lines)
                self.emit_text(c.start, c.end, style, enter_tags(), text)
            return

        # ---------------- 낱말/글자 단위 모드 ----------------
        words_per_line = [ln.split() for ln in lines]
        flat = [(li, w) for li, ws in enumerate(words_per_line) for w in ws]
        if not flat:
            return
        times = self.word_times(c, len(flat))
        hl = st.get("highlight", "none")
        step_ms = int(p.get("ass", {}).get("stepMs", 70))

        def render(active, revealed):
            """페이지 전체를 다시 쓰고 활성/공개 상태만 태그로 바꾼다(레이아웃 불변)."""
            out_lines = []
            k = 0
            for li, ws in enumerate(words_per_line):
                parts = []
                for w in ws:
                    t = ass_escape(w)
                    is_active = (active == k)
                    if mode in ("word", "char") and k > revealed:
                        parts.append(r"{\alpha&HFF&}" + t + r"{\alpha&H00&}")
                    elif is_active and hl in ("scale", "pill"):
                        sc = int(round(float(st.get("highlightScale", 1.1)) * 100))
                        parts.append(r"{\c" + accent + r"&\fscx" + str(sc) + r"\fscy" + str(sc) + "}" + t +
                                     r"{\c" + text_c + r"&\fscx100\fscy100}")
                    elif is_active and hl in ("color", "fill"):
                        parts.append(r"{\c" + accent + r"&}" + t + r"{\c" + text_c + r"&}")
                    elif mode == "karaoke" and hl == "fill" and k <= revealed:
                        parts.append(r"{\c" + accent + r"&}" + t + r"{\c" + text_c + r"&}")
                    else:
                        parts.append(t)
                    k += 1
                out_lines.append(" ".join(parts))
            return "\\N".join(out_lines)

        def inner_tags(extra: str = "") -> str:
            return f"{size_tag}\\an2\\pos({self.W // 2},{cap_y}){extra}"

        def flush(segs):
            """조각 목록을 낸다. 페이드는 첫 조각에 in, 마지막 조각에 out만 —
            조각마다 \\fad를 걸면 매 낱말마다 화면이 깜빡인다(insta-reel 엔진도 같은 규칙)."""
            n = len(segs)
            for i, (s0, e0, body) in enumerate(segs):
                fi = fade_in if i == 0 else 0
                fo = fade_out if i == n - 1 else 0
                self.emit_text(s0, e0, style, inner_tags(f"\\fad({fi},{fo})"), body)

        segs = []
        if mode in ("word", "char", "karaoke"):
            # 낱말 구간마다 조각 하나: 페이지 전체 + 활성 낱말 강조
            prev_end = c.start
            for j, (s0, e0) in enumerate(times):
                s = max(c.start, s0)
                e = min(c.end, e0 if j + 1 < len(times) else c.end)
                if s > prev_end + 0.001:
                    segs.append((prev_end, s, render(None, j - 1)))
                if e > s:
                    segs.append((s, e, render(j, j)))
                prev_end = max(prev_end, e)
            if c.end > prev_end + 0.001:
                segs.append((prev_end, c.end, render(None, len(flat) - 1)))
            flush(segs)
            return

        if mode == "typewriter":
            # 줄바꿈 위치를 유지한 채 앞에서부터 n글자
            def prefix(nchars: int) -> str:
                total, out = 0, []
                for ln in lines:
                    take = max(0, min(len(ln), nchars - total))
                    out.append(ln[:take])
                    total += len(ln)
                return "\\N".join(ass_escape(x) for x in out)

            n_total = sum(len(ln) for ln in lines)
            cursor = p.get("ass", {}).get("cursor", "")
            custep = max(1, int(round((1 / float(hold.get("cps", 14))) * 1000)))
            t0 = c.start
            k = 0
            while t0 < c.end and k <= n_total:
                t1 = min(c.end, t0 + custep / 1000)
                txt = prefix(k)
                blink_on = int((t0 - c.start) * (hold.get("cursorBlink", 2.2)) * 2) % 2 == 0
                cur = cursor if (k < n_total or blink_on) else ""
                if txt or cur:
                    segs.append((t0, t1, txt + cur))
                k += 1
                t0 = t1
            flush(segs)
            return

        if mode == "count":
            cd = float(hold.get("countDur", 0.8))
            steps = max(4, int(cd * 1000 / step_ms))
            for i in range(steps + 1):
                t0 = c.start + cd * i / steps
                t1 = (c.start + cd * (i + 1) / steps) if i < steps else c.end
                if t1 <= t0:
                    continue
                txt = c.text if i == steps else count_text(c.text, i / steps)
                _, lines_s = layout_block(txt, size, self.max_w, self.max_lines)
                segs.append((t0, t1, "\\N".join(ass_escape(ln) for ln in lines_s)))
            flush(segs)
            return

        if mode == "shake":
            amp = float(hold.get("shakeAmp", 0.055)) * size
            decay = float(hold.get("shakeDecay", 0.35))
            body = "\\N".join(ass_escape(ln) for ln in lines)
            frame = 0
            t0 = c.start
            step = 2 / 30
            while t0 < c.end:
                age = min(1.0, max(0.0, (t0 - c.start) / decay))
                k = (1 - age) ** 2
                hx = (hash01(frame, 1, 7) * 2 - 1) * amp * k
                hy = (hash01(frame, 2, 7) * 2 - 1) * amp * k * 0.6
                fi = fade_in if frame == 0 else 0
                self.emit_text(t0, min(c.end, t0 + step), style,
                               f"{size_tag}\\an2\\pos({self.W // 2 + hx:.0f},{cap_y + hy:.0f})\\fad({fi},0)",
                               body)
                frame += 1
                t0 += step
            return

        if mode == "glitch":
            gdur = float(hold.get("glitchDur", 0.45))
            split = float(hold.get("splitEm", 0.12)) * size
            jit = float(hold.get("jitterEm", 0.05)) * size
            cols = [ass_color(x) for x in st.get("glitchColors", ["#FF2D55", "#00E5A0", "#4D7CFF"])]
            body = "\\N".join(ass_escape(ln) for ln in lines)
            frame = 0
            t0 = c.start
            step = 2 / 30
            while t0 < c.end:
                in_burst = (t0 - c.start) < gdur
                end = min(c.end, t0 + step)
                if in_burst:
                    # RGB 3중 겹침(레이어 0) + 본문(레이어 2)
                    for ci, col in enumerate(cols):
                        dx = (ci - 1) * split + (hash01(frame, ci + 1, 11) * 2 - 1) * jit
                        dy = (hash01(frame, ci + 5, 11) * 2 - 1) * jit * 0.7
                        self.add(t0, end, style,
                                 f"{{{size_tag}\\an2\\pos({self.W // 2 + dx:.0f},{cap_y + dy:.0f})"
                                 f"\\c{col}\\3c{col}\\bord0\\shad0\\alpha&H40&}}" + body,
                                 layer=0, synth=False)
                gx = (hash01(frame, 9, 13) * 2 - 1) * jit * 0.6 if in_burst else 0
                gy = (hash01(frame, 10, 13) * 2 - 1) * jit * 0.4 if in_burst else 0
                fi = fade_in if frame == 0 else 0
                self.emit_text(t0, end, style,
                               f"{size_tag}\\an2\\pos({self.W // 2 + gx:.0f},{cap_y + gy:.0f})\\fad({fi},0)",
                               body, layer=2)
                frame += 1
                t0 = end
            return

        # 알 수 없는 모드 → 한 줄로
        self.warnings.append(f"모드 '{mode}' 는 ASS로 옮기지 못해 line으로 처리")
        self.emit_text(c.start, c.end, style, enter_tags(), "\\N".join(ass_escape(ln) for ln in lines))

    # ---------------------------------------------------------------- 파일
    def script(self) -> str:
        head = f"""[Script Info]
Title: Korean Motion Library
ScriptType: v4.00+
PlayResX: {self.W}
PlayResY: {self.H}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{self.styles_block()}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        return head + "\n".join(self.events) + "\n"


def hash01(a: int, b: int = 0, seed: int = 1) -> float:
    """motions.js hash01 과 같은 결정적 해시(libass 지터도 같은 값이 나오게)."""
    x = ((a + 1) * 374761393 ^ (b + 7) * 668265263 ^ (seed + 13) * 2147483647) & 0xFFFFFFFF
    x = ((x ^ (x >> 13)) * 1274126177) & 0xFFFFFFFF
    x = (x ^ (x >> 16)) & 0xFFFFFFFF
    return x / 4294967296


# ----------------------------------------------------------------- 번인
def fonts_dir_for(theme_font: str, extra_dirs: list[str] | None = None) -> pathlib.Path | None:
    """libass에 넘길 fontsdir. 시스템에 있는 한국어 폰트 폴더를 그대로 쓴다."""
    cands = list(extra_dirs or [])
    cands += ["/usr/share/fonts/pickle-hwp", "/usr/share/fonts/truetype/noto",
              "/usr/share/fonts/opentype/noto", "/System/Library/Fonts", "C:/Windows/Fonts"]
    for c in cands:
        p = pathlib.Path(c)
        if p.is_dir():
            return p
    return None


def burn(video: pathlib.Path, ass: pathlib.Path, out: pathlib.Path,
         fontsdir: pathlib.Path | None = None, crf: int = 18, preset: str = "medium",
         duration: float | None = None, keep_audio: bool = True) -> subprocess.CompletedProcess:
    ff = ffmpeg_bin()
    # ass 필터는 경로의 ':' 와 '\\' 를 파싱한다 → ASS 폴더로 이동해 상대 경로로 넘긴다
    vf = f"ass={ass.name}"
    if fontsdir:
        try:
            rel = fontsdir.resolve().relative_to(ass.parent.resolve())
            vf += f":fontsdir={rel}"
        except ValueError:
            vf += f":fontsdir={fontsdir}"
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video.resolve()),
           "-vf", vf, "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
           "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    cmd += ["-c:a", "copy"] if keep_audio else ["-an"]
    if duration:
        cmd += ["-t", f"{duration:.3f}"]
    cmd += [str(out.resolve())]
    return subprocess.run(cmd, cwd=str(ass.parent), capture_output=True, text=True)


# ----------------------------------------------------------------- CLI
def load_cues(path) -> list[Cue]:
    doc = load_json(path)
    items = doc.get("cues") if isinstance(doc, dict) else doc
    out = []
    for c in items or []:
        out.append(Cue(
            start=float(c.get("start", 0)), end=float(c.get("end", 0)),
            text=str(c.get("text", "")), preset=c.get("preset", "") or "",
            theme=c.get("theme", "") or "", words=c.get("words") or [],
        ))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cues", help="큐 JSON (배열 또는 {\"cues\":[...]})")
    ap.add_argument("--job", help="작업 JSON {video,cues,theme,preset,out}")
    ap.add_argument("--preset", default="pop-bounce")
    ap.add_argument("--theme", default="reels-dark")
    ap.add_argument("-o", "--out", help="출력 .ass 경로")
    ap.add_argument("--presets-file", default=str(DEFAULT_PRESETS))
    ap.add_argument("--font", help="폰트 패밀리 강제 지정")
    ap.add_argument("--font-scale", type=float, default=LIBASS_SCALE)
    ap.add_argument("--synthetic-bold", dest="synthetic_bold", action="store_true", default=False,
                    help="libass가 합성 굵기를 못 할 때 두 겹으로 굵기를 흉내 낸다")
    ap.add_argument("--no-synthetic-bold", dest="synthetic_bold", action="store_false")
    ap.add_argument("--burn", help="이 영상에 자막을 구워 넣는다")
    ap.add_argument("--video-out", help="번인 결과 mp4 경로")
    ap.add_argument("--fontsdir", help="libass 폰트 폴더")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--list-presets", action="store_true")
    a = ap.parse_args()

    doc = load_json(a.presets_file)
    if a.list_presets:
        for pid, p in doc["presets"].items():
            print(f"{pid:16s} {p.get('mode','?'):11s} {p.get('label','')} — {p.get('note','')}")
        for tid, t in doc["themes"].items():
            print(f"theme {tid:14s} {t.get('label','')}")
        return 0

    job = load_json(a.job) if a.job else {}
    cues_path = a.cues or job.get("cues")
    if not cues_path:
        raise SystemExit("--cues 또는 --job 이 필요합니다")
    cues = load_cues(cues_path)
    theme = job.get("theme", a.theme)
    preset = job.get("preset", a.preset)
    comp = AssCompiler(doc, theme, preset, font=a.font, font_scale=a.font_scale,
                       synthetic_bold=a.synthetic_bold)
    for c in cues:
        comp.compile_cue(c)
    out = pathlib.Path(a.out or job.get("ass") or (pathlib.Path(cues_path).parent / "captions.ass"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(comp.script(), encoding="utf-8")
    eprint(f"[ass] {len(comp.events)}개 이벤트 · 프리셋 {preset} · 테마 {theme} → {out}")
    for w in comp.warnings:
        eprint(f"  ! {w}")

    if a.burn or a.video_out:
        video = pathlib.Path(a.burn or job.get("video"))
        if not video.exists():
            raise SystemExit(f"영상이 없습니다: {video}")
        vout = pathlib.Path(a.video_out or job.get("out") or (video.parent / "graphics.mp4"))
        vout.parent.mkdir(parents=True, exist_ok=True)
        fd = pathlib.Path(a.fontsdir) if a.fontsdir else fonts_dir_for(comp.theme.font)
        r = burn(video, out, vout, fontsdir=fd, crf=a.crf, duration=media_duration(video))
        if r.returncode != 0:
            eprint(r.stderr[-2000:])
            raise SystemExit(f"ffmpeg 실패({r.returncode})")
        eprint(f"[ass] 번인 완료 → {vout}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
