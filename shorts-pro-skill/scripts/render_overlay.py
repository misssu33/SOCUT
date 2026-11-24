#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_overlay.py — HTML/Chrome로 카드·타이틀·모션 자막을 프레임 단위로 그려
영상 위에 합성한다(투명 배경 PNG 시퀀스 -> ffmpeg overlay).

준비:
  pip install playwright
  python3 -m playwright install chromium

사용 예:
  python3 scripts/render_overlay.py overlay.json --base cut.mp4 -o final.mp4
  python3 scripts/render_overlay.py overlay.json --base cut.mp4 -o final.mp4 --fps 30 --guide
  python3 scripts/render_overlay.py overlay.json --base cut.mp4 --preview out/preview   # 스틸만 뽑기

overlay.json 예시는 references/motion-presets.md 참고.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SKILL_DIR = HERE.parent
OVERLAY_HTML = SKILL_DIR / "assets" / "overlay.html"
DEFAULT_PRESETS = SKILL_DIR / "presets.json"


# ---------------------------------------------------------------- ffmpeg
def ffmpeg_bin(explicit=None):
    if explicit:
        return explicit
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    try:
        import imageio_ffmpeg  # 선택: ffmpeg가 PATH에 없을 때
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg를 찾지 못했습니다. https://ffmpeg.org/download.html 또는 `pip install imageio-ffmpeg`")


def media_duration(path, ff="ffmpeg"):
    if shutil.which("ffprobe"):
        try:
            out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "default=nw=1:nk=1", str(path)],
                                 capture_output=True, text=True, check=True).stdout.strip()
            return float(out)
        except Exception:
            pass
    p = subprocess.run([ff, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    for line in p.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


# ---------------------------------------------------------------- render
def render_frames(script, presets, outdir, duration, fps, width=1080, height=1920, quiet=True):
    from playwright.sync_api import sync_playwright

    outdir.mkdir(parents=True, exist_ok=True)
    total = int(round(duration * fps))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height},
                                device_scale_factor=1)
        page.goto(OVERLAY_HTML.as_uri())
        page.evaluate("([s,p]) => { window.SCRIPT = s; window.PRESETS = p; }", [script, presets])
        page.evaluate("() => { build(); }")
        page.wait_for_timeout(150)
        for i in range(total):
            t = i / fps
            page.evaluate("(t) => window.__frameAt(t)", t)
            page.screenshot(path=str(outdir / f"{i+1:05d}.png"), omit_background=True)
            if not quiet and i % 60 == 0:
                print(f"  frame {i}/{total}", file=sys.stderr)
        browser.close()
    return total


def preview(script, presets, times, outdir, width=1080, height=1920):
    from playwright.sync_api import sync_playwright
    outdir.mkdir(parents=True, exist_ok=True)
    paths = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.goto(OVERLAY_HTML.as_uri())
        page.evaluate("([s,p]) => { window.SCRIPT = s; window.PRESETS = p; }", [script, presets])
        page.evaluate("() => { build(); }")
        page.wait_for_timeout(150)
        for t in times:
            page.evaluate("(t) => window.__frameAt(t)", t)
            f = outdir / f"overlay_{t:05.2f}.png".replace(".", "_", 1)
            page.screenshot(path=str(f), omit_background=True)
            paths.append(f)
        browser.close()
    return paths


def composite(ff, frames_dir, base, out, fps, crf=18, preset="slow", audio_from_base=True):
    out.parent.mkdir(parents=True, exist_ok=True)
    fc = ("[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
          "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[bg];"
          "[0:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto[v]")
    cmd = [ff, "-hide_banner", "-loglevel", "error", "-y",
           "-framerate", str(fps), "-i", str(frames_dir / "%05d.png"),
           "-i", str(base)]
    cmd += ["-filter_complex", fc, "-map", "[v]"]
    if audio_from_base:
        cmd += ["-map", "1:a?", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-level", "4.2",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-movflags", "+faststart", "-shortest", str(out)]
    subprocess.run(cmd, check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="HTML/Chrome 오버레이 -> 영상 합성")
    ap.add_argument("overlay", help="overlay.json 경로")
    ap.add_argument("--base", help="바탕 영상(9:16). 없으면 오버레이만 렌더")
    ap.add_argument("-o", "--out", default="final.mp4")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--presets", default=str(DEFAULT_PRESETS))
    ap.add_argument("--ffmpeg", default=None)
    ap.add_argument("--guide", action="store_true", help="안전영역 가이드 표시")
    ap.add_argument("--preview", help="스틸 이미지만 저장할 폴더")
    ap.add_argument("--times", default="0.5,1.5,3.0", help="--preview 시각(초, 콤마)")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="slow", help="x264 preset")
    args = ap.parse_args(argv)

    script = json.loads(pathlib.Path(args.overlay).read_text(encoding="utf-8"))
    presets = json.loads(pathlib.Path(args.presets).read_text(encoding="utf-8"))
    if args.guide:
        script["guide"] = True
    ff = ffmpeg_bin(args.ffmpeg)

    if args.preview:
        times = [float(x) for x in args.times.split(",") if x.strip()]
        paths = preview(script, presets, times, pathlib.Path(args.preview))
        print("preview:", *[str(p) for p in paths], sep="\n  ")
        return 0

    duration = float(script.get("duration") or 0)
    if not duration and args.base:
        duration = media_duration(args.base, ff)
    if not duration:
        sys.exit("duration을 overlay.json에 넣거나 --base로 영상을 지정하세요.")

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="shortspro-"))
    try:
        n = render_frames(script, presets, tmp, duration, args.fps)
        print(f"frames: {n} ({duration:.2f}s @ {args.fps}fps)")
        if args.base:
            composite(ff, tmp, pathlib.Path(args.base), pathlib.Path(args.out), args.fps,
                      crf=args.crf, preset=args.preset)
            print("OUT", args.out)
        else:
            outdir = pathlib.Path(args.out).with_suffix("")
            if args.keep_frames:
                shutil.copytree(tmp, outdir)
                print("frames saved:", outdir)
            else:
                print("--base 없이 렌더했습니다. --keep-frames로 PNG 시퀀스를 보관할 수 있습니다.")
    finally:
        if not args.keep_frames:
            shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
