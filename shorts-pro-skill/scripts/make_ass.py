#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_ass.py — 자막 큐(captions.json)를 한국어 모션 자막(.ass)으로 변환한다.

프리셋(15종)은 같은 폴더의 presets.json에서 읽는다. 외부 패키지 없이 표준 라이브러리만 쓴다.

사용 예:
  python3 scripts/make_ass.py captions.json -o build/subs.ass --preset pop-bounce
  python3 scripts/make_ass.py captions.json -o build/subs.ass --preset chip-wipe --font "Malgun Gothic"
  python3 scripts/make_ass.py captions.json -o build/subs.ass --letter-spacing 2 --line-height 1.35
  python3 scripts/make_ass.py captions.json -o build/subs.ass --style-by-caption
  python3 scripts/make_ass.py --list

captions.json 형식:
{
  "captions": [
    {"start": 0.0, "end": 1.6, "text": "카메라가 놓친", "highlight": "놓친", "style": "pop-bounce"},
    {"start": 1.6, "end": 3.4, "text": "오른쪽 4명 칼군무"},
    {"start": 3.4, "end": 5.0, "text": "조회수 120만 돌파", "style": "count-up"}
  ]
}
- words: [{"w": "카메라가", "s": 0.0, "e": 0.7}, ...] 를 주면 낱말 타이밍을 그대로 쓴다(Whisper 결과).
- highlight: 그 낱말만 강조색/확대로 표시(word-highlight 프리셋에서 사용).
- style: 큐별 프리셋 id (없으면 --preset 값).
"""
import argparse
import json
import pathlib
import random
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_PRESETS = HERE.parent / "presets.json"


# ---------------------------------------------------------------- utilities
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def ass_time(sec):
    sec = max(0.0, float(sec))
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ass_hex(rgb):
    """#RRGGBB -> &H00BBGGRR"""
    rgb = rgb.lstrip("#")
    if len(rgb) != 6:
        return "&H00FFFFFF"
    r, g, b = rgb[0:2], rgb[2:4], rgb[4:6]
    return f"&H00{b}{g}{r}".upper().replace("&H00", "&H00")


def wrap_words(text, max_chars):
    """낱말 단위 줄바꿈. 반환: [[word, ...], ...]"""
    words = text.split()
    if not words:
        return [[]]
    lines, cur, cur_len = [], [], 0
    for w in words:
        add = len(w) + (1 if cur else 0)
        if cur and cur_len + add > max_chars:
            lines.append(cur)
            cur, cur_len = [w], len(w)
        else:
            cur.append(w)
            cur_len += add
    if cur:
        lines.append(cur)
    return lines


def fmt(tpl, **kw):
    """ASS 태그 템플릿의 {placeholder}만 치환(중괄호 태그는 그대로)."""
    out = tpl
    for k, v in kw.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def num_tokens(text):
    return list(re.finditer(r"\d[\d,\.]*", text))


# ---------------------------------------------------------------- ass writer
class AssBuilder:
    def __init__(self, presets, font="Noto Sans CJK KR", font_size=None, accent=None,
                 margin_v=None, bottom_safe=True, letter_spacing=0, line_height=None):
        st = presets["ass_style"]
        self.p = presets
        self.motions = {m["id"]: m for m in presets["subtitle_motions"]}
        self.font = font
        self.size = font_size or st["font_px"]
        self.margin_v = margin_v if margin_v is not None else st["margin_v"]
        self.margin_lr = st["margin_lr"]
        self.max_chars = st["max_chars_per_line"]
        self.accent = accent or st["primary"]
        self.extra_spacing = int(letter_spacing or 0)
        self.line_height = float(line_height) if line_height else None
        self.events = []
        self.styles = {}
        self.line_h = int(self.size * (self.line_height or 1.18))

    # -- 좌표 ---------------------------------------------------------
    def pos_y(self):
        return 1920 - self.margin_v

    # -- 텍스트 조립 ---------------------------------------------------
    def plain_lines(self, text):
        return [" ".join(l) for l in wrap_words(text, self.max_chars)]

    def join_lines(self, lines):
        return r"\N".join(lines)

    def word_chunks(self, lines, tags_fn, highlight=None):
        """낱말별 인라인 태그를 붙인 텍스트."""
        out_lines = []
        idx = 0
        for line in lines:
            chunks = []
            for w in line:
                t = tags_fn(idx, w)
                if t:
                    chunks.append(t.replace("{w}", w))
                else:
                    chunks.append(w)
                idx += 1
            out_lines.append(" ".join(chunks))
        return out_lines

    def emit(self, start, end, style, text):
        self.events.append((max(0.0, start), max(start + 0.05, end), text, style))

    def emit_block(self, start, end, style, tags, lines, base_y=None):
        """여러 줄 자막을 한 이벤트로 내보내되, --line-height 가 있으면 줄마다 \\pos 로 배치한다.

        ASS에는 행간 속성이 없어서 줄 위치를 직접 잡는다(gap = fontsize × line-height).
        한 줄짜리 큐는 그대로 한 이벤트다.
        """
        if self.line_height is None or len(lines) <= 1:
            self.emit(start, end, style, tags + self.join_lines(lines))
            return
        base = self.pos_y() if base_y is None else base_y
        n = len(lines)
        gap = int(self.size * self.line_height)
        for i, line in enumerate(lines):
            y = base + int(round((i - (n - 1) / 2.0) * gap))
            if "\\pos(" in tags:
                t = re.sub(r"\\pos\(\s*\d+\s*,\s*\d+\s*\)", r"\\pos(540,%d)" % y, tags)
            else:
                t = "{\\an5\\pos(540,%d)}" % y + tags
            self.emit(start, end, style, t + line)

    def style_for(self, motion):
        """프리셋별 ASS 스타일 등록(칩 배경/외곽선 두께가 프리셋마다 다르다)."""
        sid = motion["id"]
        if sid in self.styles:
            return "P_" + sid
        st = self.p["ass_style"]
        a = motion["ass"]
        self.styles[sid] = dict(
            border_style=int(a.get("border_style", 1)),
            outline=int(a.get("outline_px", st["outline_px"])),
            shadow=int(a.get("shadow_px", st["shadow_px"])),
            outline_colour=a.get("box_ass", st["outline_color"]),
            spacing=int(a.get("fsp", 0)) + self.extra_spacing,
        )
        return "P_" + sid

    # -- 큐 하나 처리 ---------------------------------------------------
    def add_caption(self, cap, preset_id, opts):
        motion = self.motions[preset_id]
        a = motion["ass"]
        mode = a["mode"]
        start, end = float(cap["start"]), float(cap["end"])
        text = cap.get("text", "").strip()
        if not text:
            return
        cur_style = self.style_for(motion)
        wrapped = wrap_words(text, self.max_chars)
        lines = [" ".join(w) for w in wrapped]
        joined = self.join_lines(lines)
        hl = cap.get("highlight")
        P = dict(posX=540, posY=self.pos_y(), xLeft=self.margin_lr,
                 lineY=self.pos_y(), lineFrom=self.pos_y() + 46)
        tags = fmt(a.get("tags", "{\\fad(0,0)}"), **P)

        if mode == "line":
            self.emit_block(start, end, cur_style, tags, lines)

        elif mode == "line-highlight":
            hl_tpl = a.get("hl_tags", "{\\c&H00F0A93C&}")
            reset = a.get("hl_reset", "")
            targets = [hl] if isinstance(hl, str) else list(hl or [])
            out = []
            for line in wrapped:
                chunks = []
                for w in line:
                    if any(t and t in w for t in targets):
                        chunks.append(hl_tpl + w + reset)
                    else:
                        chunks.append(w)
                out.append(" ".join(chunks))
            self.emit_block(start, end, cur_style, tags, out)

        elif mode == "typewriter":
            step = int(a.get("step_ms", 45))
            cursor = a.get("cursor", "")
            shown = joined.replace(r"\N", "")
            step = max(8, step)
            n = 0
            t = start
            while n <= len(shown) and t < end:
                frag = shown[:n]
                # 줄바꿈 위치 복원
                frag = self._reinsert_breaks(frag, lines)
                cur = cursor if n < len(shown) else ""
                self.emit(t, min(end, t + step / 1000.0), cur_style, tags + frag + cur)
                n += 1
                t += step / 1000.0
            if t < end:  # 다 찍은 뒤에는 완성 문장을 큐 끝까지 유지
                self.emit(min(t, end - 0.01), end, cur_style, tags + joined)

        elif mode == "per-word":
            stagger = a.get("stagger_ms", 90)
            wtpl = a.get("wtag", "{\\alpha&H00&}")
            wtimes = self._word_times(cap, wrapped, start, end)

            def tagfn(i, w):
                d0 = wtimes[i] if i < len(wtimes) else start + i * stagger / 1000.0
                d0 = int(max(0, (d0 - start) * 1000))
                d1 = d0 + 110
                return fmt(wtpl, d0=d0, d1=d1) + "{w}"

            self.emit_block(start, end, cur_style, tags, self.word_chunks(wrapped, tagfn))

        elif mode == "per-line":
            stagger = a.get("stagger_ms", 110)
            from_px = a.get("from_px", 46)
            n = len(lines)
            for i, line in enumerate(lines):
                y = self.pos_y() + int((i - (n - 1) / 2) * self.line_h)
                y0 = y + from_px
                t0 = start + i * stagger / 1000.0
                ln_tags = fmt(a["tags"], posX=540, posY=y, lineY=y, lineFrom=y0)
                self.emit(t0, end, cur_style, ln_tags + line)

        elif mode == "append-glyph":
            glyph = a.get("glyph", "🔥")
            g_tags = a.get("glyph_tags", "{\\alpha&H00&}")
            out = list(lines)
            out[-1] = out[-1] + " " + g_tags + glyph
            self.emit_block(start, end, cur_style, tags, out)

        elif mode == "count":
            self._add_count(cap, a, tags, start, end, cur_style)

        elif mode == "per-char-random":
            seed = a.get("seed", 7)
            maxd = a.get("max_delay_ms", 320)
            rnd = random.Random(seed)
            blocks = []
            for ch in joined.replace(r"\N", "\x00"):
                if ch == "\x00":
                    blocks.append(r"\N")
                    continue
                if ch == " ":
                    blocks.append(" ")
                    continue
                d0 = rnd.randint(0, maxd)
                blocks.append(
                    "{\\alpha&HFF&\\fscx120\\fscy120\\t(%d,%d,\\alpha&H00&\\fscx100\\fscy100)}%s"
                    % (d0, d0 + 90, ch))
            # 줄바꿈 복원
            self.emit(start, end, cur_style, tags.replace("{chars}", "") + "".join(blocks))

        elif mode == "per-char":
            blocks = []
            for ch in joined.replace(r"\N", "\x00"):
                if ch == "\x00":
                    blocks.append(r"\N")
                    continue
                if ch == " ":
                    blocks.append(" ")
                    continue
                j = random.Random(hash(ch) & 0xFFFF).randint(-9, 9)
                blocks.append(
                    "{\\frz%d\\fscx88\\fscy112\\t(0,140,\\frz%d\\fscx108\\fscy94)"
                    "\\t(140,260,\\frz0\\fscx100\\fscy100)}%s" % (j, -j // 2, ch))
            self.emit(start, end, cur_style, tags.replace("{chars}", "") + "".join(blocks))
        else:
            self.emit(start, end, cur_style, tags + joined)

    def _reinsert_breaks(self, frag, lines):
        """타자기 진행 중 줄바꿈 위치 복원."""
        out, i = [], 0
        for li, line in enumerate(lines):
            if li:
                out.append(r"\N")
            take = line[: max(0, len(frag) - i)]
            out.append(take)
            i += len(line) + 1
            if len(take) < len(line):
                break
        return "".join(out)

    def _word_times(self, cap, lines, start, end):
        words = cap.get("words")
        flat = [w for line in lines for w in line]
        if words and isinstance(words, list):
            times = []
            for w in flat:
                hit = None
                for x in words:
                    if x.get("w", "").strip() == w:
                        hit = x
                        break
                times.append(float(hit["s"]) if hit else None)
            # 누락분은 균등 분배
            for i, t in enumerate(times):
                if t is None:
                    times[i] = start + (end - start) * i / max(1, len(times))
            return times
        n = max(1, len(flat))
        span = min(end - start, 0.09 * n + 0.2)
        return [start + span * i / n for i in range(n)]

    def _add_count(self, cap, a, tags, start, end, style="Default"):
        text = cap.get("text", "")
        m = num_tokens(text)
        steps = int(a.get("steps", 12))
        dur = a.get("duration_ms", 700) / 1000.0
        if not m:
            self.emit(start, end, cur_style, tags + self.join_lines(self.plain_lines(text)))
            return
        tok = m[-1]
        raw = tok.group(0).replace(",", "")
        try:
            target = float(raw)
        except ValueError:
            self.emit(start, end, cur_style, tags + self.join_lines(self.plain_lines(text)))
            return
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        has_comma = "," in tok.group(0)
        for i in range(steps + 1):
            v = target * i / steps
            s = f"{v:,.{decimals}f}" if has_comma else f"{v:.{decimals}f}"
            acc = a.get("accent_ass_count", "")
            if acc:
                shown = (text[: tok.start()] + "{\\1c" + acc + "&}" + s +
                         "{\\1c" + self.p["ass_style"]["primary"] + "&}" + text[tok.end():])
            else:
                shown = text[: tok.start()] + s + text[tok.end():]
            t0 = start + dur * i / steps
            t1 = start + dur * (i + 1) / steps if i < steps else end
            self.emit(t0, min(end, max(t1, t0 + 0.04)), style,
                      tags + self.join_lines(self.plain_lines(shown)))

    # -- 출력 ----------------------------------------------------------
    def render(self, title="shorts-pro", video_bottom_safe=True):
        st = self.p["ass_style"]
        head = [
            "[Script Info]",
            "; shorts-pro 1.2.0 — generated by scripts/make_ass.py",
            f"Title: {title}",
            "ScriptType: v4.00+",
            "WrapStyle: 2",
            "ScaledBorderAndShadow: yes",
            "YCbCr Matrix: TV.709",
            "PlayResX: 1080",
            "PlayResY: 1920",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
            "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
            "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        ]
        for sid, cfg in self.styles.items():
            head.append(
                "Style: P_%s,%s,%d,%s,&H000000FF,%s,%s,%d,0,0,0,100,100,%d,0,%d,%d,%d,2,%d,%d,%d,1"
                % (sid, self.font, self.size, st["primary"], cfg["outline_colour"],
                   st["shadow_color"], 1 if st.get("bold") else 0, cfg["spacing"],
                   cfg["border_style"], cfg["outline"], cfg["shadow"],
                   self.margin_lr, self.margin_lr, self.margin_v))
        head += [
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
        body = []
        for s, e, txt, stl in sorted(self.events, key=lambda x: x[0]):
            body.append(f"Dialogue: 0,{ass_time(s)},{ass_time(e)},{stl},,0,0,0,,{txt}")
        return "\n".join(head + body) + "\n"


# ---------------------------------------------------------------- cli
def main(argv=None):
    ap = argparse.ArgumentParser(description="자막 큐 JSON -> 한국어 모션 자막 .ass")
    ap.add_argument("captions", nargs="?", help="captions.json 경로")
    ap.add_argument("-o", "--out", default="subs.ass", help="출력 .ass 경로")
    ap.add_argument("--preset", default="pop-bounce", help="기본 모션 프리셋 id")
    ap.add_argument("--style-by-caption", action="store_true",
                    help="큐의 style 필드를 우선 사용")
    ap.add_argument("--font", default=None, help="한국어 폰트 이름 (OS에 설치된 이름)")
    ap.add_argument("--size", type=int, default=None, help="자막 크기(px)")
    ap.add_argument("--margin-v", type=int, default=None, help="아래 여백(px, 클수록 위로)")
    ap.add_argument("--letter-spacing", type=int, default=0,
                    help="자간(px, -4~+12). Style Spacing + 프리셋 fsp")
    ap.add_argument("--line-height", type=float, default=None,
                    help="행간 배수(1.0~1.8). 여러 줄 자막을 줄마다 \\pos 로 배치")
    ap.add_argument("--presets", default=str(DEFAULT_PRESETS), help="presets.json 경로")
    ap.add_argument("--list", action="store_true", help="프리셋 목록 출력")
    args = ap.parse_args(argv)

    presets = load_json(args.presets)
    if args.list:
        print(f"{'id':<16}{'이름':<12}특징")
        for m in presets["subtitle_motions"]:
            print(f"{m['id']:<16}{m['name']:<12}{m['when']}")
        return 0

    if not args.captions:
        ap.error("captions.json 경로가 필요합니다. (--list 로 프리셋 확인)")

    data = load_json(args.captions)
    caps = data.get("captions") or data.get("cues") or []
    if not caps:
        print("captions 배열이 비어 있습니다.", file=sys.stderr)
        return 2

    font = args.font or presets["ass_style"]["font"]
    b = AssBuilder(presets, font=font, font_size=args.size, margin_v=args.margin_v,
                   letter_spacing=args.letter_spacing, line_height=args.line_height)
    used = set()
    for cap in caps:
        pid = cap.get("style") if (args.style_by_caption and cap.get("style")) else args.preset
        if pid not in b.motions:
            print(f"알 수 없는 프리셋: {pid} -> {args.preset} 로 대체", file=sys.stderr)
            pid = args.preset
        used.add(pid)
        b.add_caption(cap, pid, {})
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(b.render(), encoding="utf-8")
    print(f"OK {out}  events={len(b.events)}  presets={sorted(used)}  font={font}"
          f"  ls={args.letter_spacing}px  lh={args.line_height or 'default'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
