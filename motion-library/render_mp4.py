#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""render_mp4.py — 영상 + 큐/프리셋 → 실제 MP4.

두 가지 엔진을 모두 제공한다. 같은 프리셋 JSON을 쓰므로 결과가 서로 닮는다.

  ① ass    : make_ass.py 로 .ass 를 만들고 ffmpeg(libass)로 굽는다. 빠르고 가볍다.
  ② frames : Playwright Chromium에서 motions.js(Canvas 2D)로 프레임을 한 장씩 그려
             ffmpeg로 엮는다. **브라우저 미리보기와 픽셀 단위로 같다.**
             (Canvas로만 가능한 것: 글자별 젤리, 칩 와이프의 실제 사각형 애니메이션 등)

  python3 render_mp4.py --video in.mp4 --cues presets/cues-sample.json --out out/result.mp4
  python3 render_mp4.py --job presets/job-sample.json --engine both
  python3 render_mp4.py --cues cues.json --preset pop-bounce --duration 6 --out out/card.mp4  # 영상 없이

결과물은 H.264(yuv420p) + AAC MP4. ffmpeg는 PATH → imageio-ffmpeg 번들 순서로 찾는다.
"""
from __future__ import annotations

import argparse
import base64
import http.server
import json
import os
import pathlib
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from make_ass import (  # noqa: E402
    AssCompiler, Cue, LIBASS_SCALE, burn, ffmpeg_bin, fonts_dir_for,
    load_cues, load_json, media_duration, media_size, DEFAULT_PRESETS,
)

# 이 작업 환경에 미리 받아 둔 Chromium이 있으면 그걸 쓰고, 없으면 Playwright 기본 해석에 맡긴다
_PW_BROWSERS = "/workspace/.pw/browsers"
if os.path.isdir(_PW_BROWSERS):
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", _PW_BROWSERS)
    os.environ.setdefault("LD_LIBRARY_PATH", "/workspace/.pw/libs")


def log(*a) -> None:
    print(*a, file=sys.stderr, flush=True)


def has_audio(path: pathlib.Path) -> bool:
    r = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    return "Audio:" in r.stderr


# ------------------------------------------------------------------ ① ASS 엔진
def apply_theme_overrides(doc: dict, theme: str, overrides: dict) -> dict:
    """작업 파일의 theme_overrides(폰트·자간·행간·색)를 문서 사본에 덮어쓴다."""
    if not overrides:
        return doc
    doc = json.loads(json.dumps(doc))          # 원본 문서는 건드리지 않는다
    base = dict(doc["themes"].get(theme) or doc["themes"]["reels-dark"])
    for key in ("weight", "sizeRatio", "lineHeight", "letterSpacing", "outlineEm", "haloEm", "shadowEm", "upper"):
        if key in overrides and overrides[key] is not None:
            base[key] = overrides[key]
    if isinstance(overrides.get("colors"), dict):
        base["colors"] = {**base.get("colors", {}), **overrides["colors"]}
    doc["themes"][theme] = base
    return doc


def theme_for_frames(doc: dict, theme: str, overrides: dict) -> dict:
    """frames 엔진(브라우저 Canvas)에 넘길 테마 객체 — cue별 theme 문자열보다 우선한다."""
    patched = apply_theme_overrides(doc, theme, overrides)
    return json.loads(json.dumps(patched["themes"][theme]))


def render_ass(video: pathlib.Path | None, cues_path: pathlib.Path, theme: str, preset: str,
               out: pathlib.Path, workdir: pathlib.Path, duration: float,
               width: int, height: int, crf: int, fontsdir: str | None,
               doc_path: pathlib.Path = DEFAULT_PRESETS,
               overrides: dict | None = None, layout: dict | None = None) -> pathlib.Path:
    doc = load_json(doc_path)
    overrides = overrides or {}
    doc = apply_theme_overrides(doc, theme, overrides)
    comp = AssCompiler(doc, theme, preset, font_scale=LIBASS_SCALE, font=overrides.get("font") or None)
    if layout:
        if layout.get("centerY") is not None:
            comp.anchor_center = float(layout["centerY"]) * comp.H
        if layout.get("maxWidth"):
            comp.max_w = float(layout["maxWidth"]) * comp.W
            comp.margin_lr = int((comp.W - comp.max_w) / 2)
        if layout.get("maxLines"):
            comp.max_lines = int(layout["maxLines"])
    for c in load_cues(cues_path):
        comp.compile_cue(c)
    ass = workdir / "captions.ass"
    ass.write_text(comp.script(), encoding="utf-8")
    log(f"  [ass] 이벤트 {len(comp.events)}개 → {ass.name}")
    for w in comp.warnings:
        log(f"  ! {w}")

    ff = ffmpeg_bin()
    vf_parts = [f"ass={ass.name}"]
    fd = pathlib.Path(fontsdir) if fontsdir else fonts_dir_for(doc.get("ass_style", {}).get("font", ""))
    if fd:
        try:
            vf_parts[0] += f":fontsdir={pathlib.Path(os.path.relpath(fd, workdir))}"
        except ValueError:
            vf_parts[0] += f":fontsdir={fd}"
    vf = ",".join(vf_parts)
    # 해상도/비율이 다르면 먼저 맞춘다(9:16으로 채우고 자르기)
    scale = (f"scale={width}:{height}:force_original_aspect_ratio=increase,"
             f"crop={width}:{height},setsar=1")
    vf = scale + "," + vf

    if video:
        cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video.resolve()),
               "-vf", vf, "-t", f"{duration:.3f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
               "-movflags", "+faststart"]
        cmd += (["-c:a", "copy"] if has_audio(video) else ["-an"])
        cmd += [str(out.resolve())]
    else:
        cmd = [ff, "-y", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", f"color=c=0x10151f:s={width}x{height}:r=30:d={duration:.3f}",
               "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out.resolve())]
    r = subprocess.run(cmd, cwd=str(workdir), capture_output=True, text=True)
    if r.returncode != 0:
        log(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg(ass) 실패: {r.returncode}")
    return out


# ------------------------------------------------------------------ ② frames 엔진
PAGE = """<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<canvas id="c" width="__W__" height="__H__"></canvas>
<video id="v" muted playsinline preload="auto" style="display:none"></video>
<script src="/motions.js"></script>
<script>
const ML = window.KoreanMotion;
const W = __W__, H = __H__;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const vid = document.getElementById('v');
let timeline = [], opts = {}, ready = true;

window.setup = (data) => {
  timeline = ML.buildTimeline(data.cues || []);
  opts = data;
  if (data.video) { vid.src = data.video; return vid.play().then(() => { vid.pause(); return true; }); }
  return false;
};

function coverDraw() {
  const sw = vid.videoWidth, sh = vid.videoHeight;
  if (!sw || !sh) { ctx.fillStyle = '#10151f'; ctx.fillRect(0, 0, W, H); return; }
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(vid, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

window.drawAt = (t) => new Promise((resolve) => {
  const paint = () => {
    ctx.clearRect(0, 0, W, H);
    if (opts.video) coverDraw(); else { ctx.fillStyle = '#10151f'; ctx.fillRect(0, 0, W, H); }
    const info = ML.drawFrame(ctx, {
      timeline, t, W, H, preset: opts.preset, theme: opts.theme,
      layout: opts.layout || null,
      scrim: opts.scrim ? { alpha: 0.55, height: 0.34 } : null,
      debug: !!opts.safe
    });
    resolve({ info: info ? { size: info.size, lines: info.lines } : null, t });
  };
  if (opts.video) {
    const seek = () => { vid.currentTime = t; };
    if (Math.abs(vid.currentTime - t) < 1e-4) paint();
    else {
      const on = () => { vid.removeEventListener('seeked', on); requestAnimationFrame(paint); };
      vid.addEventListener('seeked', on);
      seek();
    }
  } else paint();
});

window.grab = () => cv.toDataURL('image/png');
</script>
"""


class Routes(http.server.BaseHTTPRequestHandler):
    """세 경로만 제공한다: 페이지(메모리), /motions.js, /video.mp4(원본 위치 무관)."""

    page = b""
    video: pathlib.Path | None = None

    def log_message(self, *a):
        pass

    def _send(self, body: bytes, ctype: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._send(self.page, "text/html; charset=utf-8")
        if path == "/motions.js":
            return self._send((HERE / "motions.js").read_bytes(), "text/javascript; charset=utf-8")
        if path == "/video.mp4" and self.video:
            return self._send(self.video.read_bytes(), "video/mp4")
        self.send_error(404)


def render_frames(video: pathlib.Path | None, cues_path: pathlib.Path, theme, preset: str,
                  out: pathlib.Path, workdir: pathlib.Path, duration: float,
                  width: int, height: int, fps: int, crf: int, scrim: bool, safe: bool,
                  keep: bool, layout: dict | None = None) -> pathlib.Path:
    from playwright.sync_api import sync_playwright

    frames_dir = workdir / "frames"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    frames_dir.mkdir(parents=True)

    page_html = PAGE.replace("__W__", str(width)).replace("__H__", str(height))
    Routes.page = page_html.encode("utf-8")
    Routes.video = video.resolve() if video else None
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Routes)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    cues = [c.__dict__ for c in load_cues(cues_path)]
    payload = {
        "cues": cues, "preset": preset, "theme": theme, "scrim": scrim, "safe": safe,
        "video": "/video.mp4" if video else None,
    }
    if layout:
        # 미리보기(웹앱)와 같은 위치·폭·줄수·글자크기로 그린다
        payload["layout"] = {
            "maxW": float(layout.get("maxWidth", 0.86)) * width,
            "topY": 0,
            "bottomY": 2 * float(layout.get("centerY", 0.5)) * height,
            "anchor": "center",
            "maxLines": int(layout.get("maxLines", 4)),
            "size": float(layout.get("sizeRatio") or 0) * width,
            "u": min(width, height) / 1080,
        }
    n_frames = max(1, int(round(duration * fps)))
    t0 = time.time()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"])
            pg = b.new_page(viewport={"width": width, "height": height})
            errors: list[str] = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(f"http://127.0.0.1:{port}/")
            pg.evaluate("(arg) => window.setup(arg)", payload)
            if errors:
                raise SystemExit(f"페이지 오류: {errors}")
            for i in range(n_frames):
                t = i / fps
                pg.evaluate("(tt) => window.drawAt(tt)", t)
                data = pg.evaluate("window.grab()")
                (frames_dir / f"f{i:05d}.png").write_bytes(base64.b64decode(data.split(",", 1)[1]))
                if i % 30 == 0:
                    log(f"  [frames] {i}/{n_frames} ({time.time() - t0:.1f}s)")
            b.close()
    finally:
        httpd.shutdown()

    log(f"  [frames] {n_frames}장 렌더 완료 ({time.time() - t0:.1f}s)")
    ff = ffmpeg_bin()
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error",
           "-framerate", str(fps), "-i", str(frames_dir / "f%05d.png")]
    if video:
        cmd += ["-i", str(video.resolve()), "-map", "0:v:0"]
        cmd += (["-map", "1:a:0", "-c:a", "aac", "-b:a", "128k", "-shortest"]
                if has_audio(video) else [])
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
            "-r", str(fps), "-movflags", "+faststart", str(out.resolve())]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg(frames) 실패: {r.returncode}")
    if not keep:
        shutil.rmtree(frames_dir, ignore_errors=True)
    return out


def _is_under(path: pathlib.Path, root: pathlib.Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


# ------------------------------------------------------------------ 검증
def verify(path: pathlib.Path) -> dict:
    """결과 MP4의 실제 해상도·길이·코덱을 다시 읽어 확인한다."""
    info = {"path": str(path), "exists": path.exists(), "bytes": path.stat().st_size if path.exists() else 0}
    if not info["exists"] or info["bytes"] < 1000:
        return info
    w, h = media_size(path)
    info.update({"width": w, "height": h, "duration": round(media_duration(path), 3),
                 "audio": has_audio(path)})
    return info


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--job", help="작업 JSON")
    ap.add_argument("--video", help="입력 영상")
    ap.add_argument("--cues", help="큐 JSON")
    ap.add_argument("--preset", default="pop-bounce")
    ap.add_argument("--theme", default="reels-dark")
    ap.add_argument("--out", default="out/result.mp4")
    ap.add_argument("--engine", choices=["ass", "frames", "both"], default=None,
                    help="ass(빠름) / frames(미리보기와 픽셀 동일) / both — 생략하면 작업 JSON의 engine, 없으면 ass")
    ap.add_argument("--duration", type=float, help="영상 없이 만들 때 길이(초)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--size", default="1080x1920", help="예: 1080x1920, 720x1280")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--scrim", action="store_true", help="하단 가독성 그라데이션")
    ap.add_argument("--safe", action="store_true", help="안전영역 가이드(테스트용)")
    ap.add_argument("--keep", action="store_true", help="프레임 PNG 보관")
    ap.add_argument("--fontsdir")
    a = ap.parse_args()

    job = load_json(a.job) if a.job else {}
    video = pathlib.Path(a.video or job.get("video") or "") if (a.video or job.get("video")) else None
    raw_cues = a.cues or job.get("cues") or (HERE / "presets" / "cues-sample.json")
    inline_cues: pathlib.Path | None = None
    if isinstance(raw_cues, (list, dict)):
        # 작업 파일에 큐를 직접 담은 경우(웹앱의 shorts-job.json) 임시 파일로 풀어 쓴다
        data = raw_cues if isinstance(raw_cues, dict) else {"cues": raw_cues}
        fd, tmp = tempfile.mkstemp(prefix="kml-cues-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        inline_cues = pathlib.Path(tmp)
        cues = inline_cues
    else:
        cues = pathlib.Path(raw_cues)
    overrides = job.get("theme_overrides") or {}
    layout = job.get("layout") or {}
    preset = job.get("preset", a.preset)
    theme = job.get("theme", a.theme)
    engine = a.engine or job.get("engine") or "ass"      # CLI가 작업 파일보다 우선
    out = pathlib.Path(a.out if a.out != "out/result.mp4" else job.get("out", a.out))
    W, H = (int(x) for x in str(job.get("size", a.size)).lower().split("x"))
    fps = int(job.get("fps", a.fps))
    crf = int(job.get("crf", a.crf))
    scrim = bool(job.get("scrim", a.scrim))
    safe = bool(job.get("safe", a.safe))

    if not cues.exists():
        raise SystemExit(f"큐 파일이 없습니다: {cues}")
    if overrides:
        log(f"[job] theme_overrides 적용: {', '.join(sorted(overrides))}")
    if layout:
        log(f"[job] layout 적용: {layout}")
    if video and not video.exists():
        raise SystemExit(f"영상이 없습니다: {video}")
    duration = float(job.get("duration") or a.duration or 0) or (media_duration(video) if video else 8.0)
    out.parent.mkdir(parents=True, exist_ok=True)

    log(f"[render] 엔진={engine} · 프리셋={preset} · 테마={theme} · {W}x{H}@{fps} · {duration:.2f}s")
    results = []
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="kml-"))
    try:
        if engine in ("ass", "both"):
            p = out if engine == "ass" else out.with_name(out.stem + "-ass.mp4")
            results.append(("ass", render_ass(video, cues, theme, preset, p, workdir, duration,
                                              W, H, crf, a.fontsdir,
                                              overrides=overrides, layout=layout)))
        if engine in ("frames", "both"):
            p = out if engine == "frames" else out.with_name(out.stem + "-frames.mp4")
            frame_theme = theme_for_frames(load_json(DEFAULT_PRESETS), theme, overrides) if overrides else theme
            results.append(("frames", render_frames(video, cues, frame_theme, preset, p, workdir, duration,
                                                    W, H, fps, crf, scrim, safe, a.keep, layout=layout)))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        if inline_cues is not None:
            inline_cues.unlink(missing_ok=True)

    for name, path in results:
        info = verify(path)
        log(f"[verify] {name}: {info['width']}x{info['height']} · {info['duration']}s · "
            f"{info['bytes'] / 1024:.0f} KB · 오디오 {'있음' if info.get('audio') else '없음'} → {path}")
        if info["width"] != W or info["height"] != H:
            log(f"  ! 해상도가 요청과 다릅니다({W}x{H} 요청)")
        if not info.get("bytes"):
            raise SystemExit(f"결과 파일이 비었습니다: {path}")
    print(json.dumps([{"engine": n, **verify(p)} for n, p in results], ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
