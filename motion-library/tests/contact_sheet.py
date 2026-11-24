#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""프리셋 렌더 결과를 PNG로 뽑아 눈으로 검증하는 도구.

  python3 tests/contact_sheet.py              # 전체 콘택트시트 + 프리셋별 애니메이션 스트립 + 시간변화 검사
  python3 tests/contact_sheet.py --themes      # 테마 5종 시트도

산출물(out/):
  contact-presets.png     프리셋 14종 × 3시점(등장/유지/퇴장)
  contact-themes.png      테마 5종 × 2문장
  strip-<preset>.png      프리셋별 5프레임 가로 스트립(애니메이션 확인)
"""
import base64
import os
import pathlib
import sys

# 이 작업 환경에 미리 받아 둔 Chromium이 있으면 그걸 쓰고, 없으면 Playwright 기본 해석에 맡긴다
_PW_BROWSERS = "/workspace/.pw/browsers"
if os.path.isdir(_PW_BROWSERS):
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", _PW_BROWSERS)
    os.environ.setdefault("LD_LIBRARY_PATH", "/workspace/.pw/libs")

from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
JS = (ROOT / "motions.js").read_text(encoding="utf-8")

PRESETS = ["outline-basic", "slide-in-top", "zoom-swap", "chip-wipe", "line-rise",
           "pop-bounce", "shift-key", "word-highlight", "karaoke-fill", "typewriter",
           "count", "shake", "glitch", "char-jelly"]
THEMES = ["reels-dark", "news-dark", "pastel-soft", "mono-hud", "variety-pop"]
# 큐는 0.2~2.6s. 등장 중 / 안정 / 퇴장 중 세 시점.
TIMES = [0.26, 1.00, 2.45]
STRIP_KEYS = ["pop-bounce", "typewriter", "chip-wipe", "line-rise", "count", "glitch", "karaoke-fill"]
STRIP_TIMES = [0.24, 0.34, 0.55, 1.10, 2.45]

SHEET_JS = r"""
(args) => {
  const {items, times, text, cellW, cellH, withLabels, crop} = args;
  const ML = window.KoreanMotion;
  const cw = crop ? crop[2] : cellW, ch = crop ? crop[3] : cellH;
  const off = document.createElement('canvas'); off.width = cellW; off.height = cellH;
  const offx = off.getContext('2d');
  const c = document.createElement('canvas');
  c.width = cw * times.length;
  c.height = ch * items.length + (withLabels ? 26 * items.length : 0);
  const x = c.getContext('2d');
  x.fillStyle = '#0b0d12'; x.fillRect(0, 0, c.width, c.height);
  x.textBaseline = 'middle';
  let y0 = 0;
  items.forEach((it) => {
    if (withLabels) {
      x.fillStyle = '#9aa4b8'; x.font = '600 15px sans-serif';
      x.fillText(it.label, 8, y0 + 13);
      y0 += 26;
    }
    times.forEach((t, ci) => {
      const ox = ci * cw, oy = y0;
      // 1) 오프스크린에 실제 해상도로 한 프레임 렌더
      const g = offx.createLinearGradient(0, 0, 0, cellH);
      g.addColorStop(0, '#243b55'); g.addColorStop(1, '#141e30');
      offx.fillStyle = g; offx.fillRect(0, 0, cellW, cellH);
      offx.globalAlpha = 0.20; offx.fillStyle = '#000';
      for (let i = 0; i < 4; i++) offx.fillRect(0, cellH * 0.18 + i * cellH * 0.16, cellW, cellH * 0.05);
      offx.globalAlpha = 1;
      const info = ML.drawFrame(offx, {
        cues: [{start: 0.2, end: 2.6, text, preset: it.preset, theme: it.theme}],
        t, W: cellW, H: cellH, preset: it.preset, theme: it.theme
      });
      // 2) 필요한 부분만 확대 시트에 복사
      if (crop) x.drawImage(off, crop[0], crop[1], cw, ch, ox, oy, cw, ch);
      else x.drawImage(off, 0, 0, cellW, cellH, ox, oy, cw, ch);
      x.fillStyle = 'rgba(255,255,255,0.62)'; x.font = '600 13px monospace';
      x.fillText('t=' + t.toFixed(2) + 's', ox + 8, oy + ch - 12);
      if (info && withLabels) x.fillText(Math.round(info.size) + 'px/' + info.lines + 'L', ox + cw - 74, oy + ch - 12);
      x.strokeStyle = '#262b36'; x.strokeRect(ox + 0.5, oy + 0.5, cw - 1, ch - 1);
    });
    y0 += ch;
  });
  return c.toDataURL('image/png');
}
"""


def save(pg, name, args):
    data_url = pg.evaluate(SHEET_JS, args)
    png = base64.b64decode(data_url.split(",", 1)[1])
    path = OUT / name
    path.write_bytes(png)
    print(f"  → {path.name}  ({len(png) // 1024} KB)")
    return path


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto("about:blank")
    pg.add_script_tag(content=JS)

    print("① 프리셋 콘택트시트 (등장/유지/퇴장)")
    save(pg, "contact-presets.png", {
        "items": [{"preset": x, "theme": "reels-dark", "label": x} for x in PRESETS],
        "times": TIMES, "cellW": 360, "cellH": 640, "withLabels": True,
        "text": "카메라가 놓친 오른쪽 4명 칼군무",
    })

    print("② 프리셋별 애니메이션 스트립 5프레임")
    for pid in STRIP_KEYS:
        save(pg, f"strip-{pid}.png", {
            "items": [{"preset": pid, "theme": "reels-dark", "label": pid}],
            "times": STRIP_TIMES, "cellW": 360, "cellH": 640, "withLabels": True,
            "text": "조회수 120만 돌파",
        })

    print("③ 캡션 밴드 확대(1080 실크기 크롭, 프리셋별)")
    for pid in STRIP_KEYS:
        save(pg, f"detail-{pid}.png", {
            "items": [{"preset": pid, "theme": "reels-dark", "label": pid}],
            "times": STRIP_TIMES, "cellW": 1080, "cellH": 1920, "withLabels": True,
            "text": "조회수 120만 돌파", "crop": [70, 960, 940, 330],
        })

    if "--themes" in sys.argv:
        print("④ 테마 시트")
        save(pg, "contact-themes.png", {
            "items": [{"preset": "outline-basic", "theme": t, "label": t} for t in THEMES],
            "times": [0.9, 1.6], "cellW": 420, "cellH": 746, "withLabels": True,
            "text": "오늘 3시에 만나",
        })

    # 시간에 따라 실제로 변하는지(픽셀 차이)
    r = pg.evaluate(
        r"""() => {
        const ML = window.KoreanMotion;
        const c = document.createElement('canvas'); c.width = 540; c.height = 960;
        const x = c.getContext('2d');
        const shot = (preset, t) => {
            x.fillStyle = '#111'; x.fillRect(0,0,540,960);
            ML.drawFrame(x, {cues:[{start:0.2,end:2.6,text:'조회수 120만 돌파', preset}], t, W:540,H:960, preset, theme:'reels-dark'});
            return x.getImageData(0, 0, 540, 960).data;
        };
        const diff = (a,b) => { let n=0; for (let i=0;i<a.length;i+=4) if (Math.abs(a[i]-b[i])>10) n++; return n; };
        return {
            typewriter: diff(shot('typewriter',0.35), shot('typewriter',1.2)),
            count: diff(shot('count',0.30), shot('count',1.4)),
            popbounce: diff(shot('pop-bounce',0.25), shot('pop-bounce',0.9)),
            glitch: diff(shot('glitch',0.30), shot('glitch',0.42)),
            glitch_off: diff(shot('glitch',0.30), shot('glitch',1.6)),
            shake: diff(shot('shake',0.25), shot('shake',1.5)),
            chipwipe: diff(shot('chip-wipe',0.24), shot('chip-wipe',0.6)),
            linerise: diff(shot('line-rise',0.26), shot('line-rise',0.6)),
        };
    }"""
    )
    print("④ 애니메이션 시간 변화(픽셀 차이):")
    for k, v in r.items():
        print(f"     {k:12s} {v}")
    ok = (r["typewriter"] > 400 and r["count"] > 400 and r["popbounce"] > 300
          and r["glitch"] > 300 and r["glitch_off"] > 300 and r["shake"] > 300
          and r["chipwipe"] > 300 and r["linerise"] > 200)
    print(("  ✅ " if ok else "  ❌ ") + "동적 프리셋이 시간에 따라 실제로 변함")
    b.close()
    sys.exit(0 if ok else 1)
