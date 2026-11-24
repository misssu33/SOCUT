# shorts-pro — 설치와 사용 안내

한국형 YouTube Shorts / Reels를 **PC에서 로컬로** 끝까지 만드는 스킬 세트입니다.
FFmpeg으로 자르고·반전하고·색을 잡고, HTML/Chrome(또는 ASS)으로 모션 자막과 카드를 얹어 1080x1920 MP4를 뽑습니다. 유료 API 호출이 없습니다.

- 대상: **Claude Code**, **OpenAI Codex CLI**
- 필요: FFmpeg, Python 3.9+ (스크립트), Node.js 18+ (선택: Remotion 경로), Chromium (선택: 카드 오버레이)
- 자막 모션 **15종**, 레이아웃 프리셋 5종, FFmpeg 레시피 26종(실행 검증 완료)
- **미세 배속 1.01~1.05x**, **무음 자동 컷편집**, **효과음 합성·믹싱**, **페이드·BGM 덕킹**, **자간·행간** — 2026-11-24 추가
- **스피드 램프**(한 클립 안에서 서서히 빠르게/느리게·하이라이트 감속), **음정 유지/피치 반음 조절**, **목소리 노이즈 제거**(60Hz 험·히스), **음량 자동 맞추기**, **오토더킹 통합 체인** — 2026-11-24 추가(v1.2.0)

---

## 1. 설치

### Claude Code (`~/.claude/skills/`)

```bash
# macOS / Linux
mkdir -p ~/.claude/skills
unzip shorts-pro-skill.zip -d ~/.claude/skills/
ls ~/.claude/skills/shorts-pro/SKILL.md

# Windows PowerShell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
Expand-Archive shorts-pro-skill.zip -DestinationPath "$env:USERPROFILE\.claude\skills"
```

프로젝트에만 적용하려면 `<프로젝트>/.claude/skills/shorts-pro/`에 같은 방식으로 풉니다.

### OpenAI Codex CLI (`~/.agents/skills/`)

```bash
mkdir -p ~/.agents/skills
unzip shorts-pro-skill.zip -d ~/.agents/skills/
ls ~/.agents/skills/shorts-pro/SKILL.md
```

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:USERPROFILE\.agents\skills" | Out-Null
Expand-Archive shorts-pro-skill.zip -DestinationPath "$env:USERPROFILE\.agents\skills"
```

> zip 안에 `shorts-pro/` 폴더가 들어 있으므로 **그 폴더째** skills 디렉터리에 풀면 됩니다.
> 이미 같은 이름이 있으면 기존 폴더를 지우고 새로 푸세요(설정 파일이 없다면 그대로 교체).

### 압축을 풀지 않고 쓰기

```bash
unzip -l shorts-pro-skill.zip        # 내용 확인
```

---

## 2. 사전 준비

| 도구 | 필수 | 확인 | 설치 |
|---|---|---|---|
| FFmpeg (+ffprobe) | ✅ | `ffmpeg -version` | Win `winget install Gyan.FFmpeg` / mac `brew install ffmpeg` / Ubuntu `sudo apt install ffmpeg` |
| Python 3.9+ | ✅ (스크립트) | `python3 --version` | python.org |
| 한국어 폰트 | ✅ | `fc-list :lang=ko` (Linux) | Noto Sans KR / Pretendard / Malgun Gothic |
| Playwright + Chromium | 카드 오버레이 쓸 때 | `python3 -c "import playwright"` | `pip install playwright && python3 -m playwright install chromium` |
| Node.js 18+ | Remotion 경로만 | `node -v` | nodejs.org |

한 번에 점검:

```bash
bash shorts-pro/scripts/check_env.sh
```

FFmpeg 빌드에 `libass`가 있어야 ASS 자막이 구워집니다.
```bash
ffmpeg -filters | grep subtitles     # subtitles 필터가 보이면 OK
```

---

## 3. 5분 빠른 시작

```bash
# 0) 작업 폴더
mkdir -p my-short/build && cd my-short

# 1) 16:9 원본을 9:16으로 (가운데 크롭)
ffmpeg -y -i raw.mp4 -vf "scale=-2:1920,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p build/cut.mp4

# 2) 자막 큐 작성
cat > captions.json <<'JSON'
{"captions":[
 {"start":0.3,"end":2.4,"text":"카메라가 놓친","style":"pop-bounce"},
 {"start":2.4,"end":4.4,"text":"오른쪽 4명 칼군무","style":"chip-wipe","highlight":"칼군무"}
]}
JSON

# 3) 모션 자막 생성 + 굽기
python3 shorts-pro/scripts/make_ass.py captions.json -o build/subs.ass --style-by-caption
ffmpeg -y -i build/cut.mp4 -vf "subtitles=build/subs.ass" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy out.mp4

# 4) 확인
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of default=nw=1 out.mp4
ffmpeg -y -ss 1 -i out.mp4 -frames:v 1 build/check_$(date +%H%M%S).png
```

카드형 오버레이(배지+2색 타이틀, 댓글 카드, 코너 라벨)까지 가려면:

```bash
python3 shorts-pro/scripts/render_overlay.py overlay.json --base build/cut.mp4 -o final.mp4
```
`overlay.json` 예시는 `references/motion-presets.md` 4절, 바로 실행할 수 있는 예제는 `assets/examples/overlay-idol.json`입니다.

---

## 4. 무엇이 들어 있나

```
shorts-pro/
├── SKILL.md                  스킬 본문(에이전트가 읽는 지침·품질 게이트)
├── README.md                 이 문서
├── 사용방법-가이드.pdf        사람용 설명서(PDF)
├── presets.json              단일 기준: 자막 15종·레이아웃·색·인코딩·SEO
├── assets/overlay.html       카드·타이틀·모션 자막 렌더러(1080x1920 투명)
├── scripts/
│   ├── make_ass.py           captions.json → .ass (모션 15종)
│   ├── render_overlay.py     overlay.json → 프레임 → 영상 합성
│   └── check_env.sh          환경 점검
└── references/
    ├── ffmpeg-recipes.md     검증된 FFmpeg 26레시피(미세 배속·무음 컷·SFX·페이드·자간 +
    │                          스피드 램프·피치·노이즈 제거·음량 정리·통합 오디오 체인)
    ├── motion-presets.md     모션 15종·레이아웃·안전영역·overlay.json
    └── pipeline-workflow.md  5단계 워크플로·체크포인트·실패 대응
```

---

## 5. 자주 쓰는 명령

```bash
# 프리셋 목록
python3 scripts/make_ass.py --list

# 프리셋 섞어 쓰기
python3 scripts/make_ass.py captions.json -o build/subs.ass --style-by-caption

# OS 폰트 지정 (Windows)
python3 scripts/make_ass.py captions.json -o build/subs.ass --font "Malgun Gothic"

# 자간 +3px / 행간 1.35 (여러 줄 자막이면 줄마다 \pos로 배치)
python3 scripts/make_ass.py captions.json -o build/subs.ass --letter-spacing 3 --line-height 1.35

# 무음 구간 찾기 (1.2~3.0 / 4.2~6.0 / 7.2~8.0)
ffmpeg -i raw.mp4 -af silencedetect=noise=-38dB:d=0.4 -f null - 2>&1 | grep silence

# 무음 빼고 이어 붙이기 (8.01초 → 3.93초)
ffmpeg -y -i raw.mp4 \
 -vf "select='not(between(t,1.25,2.93)+between(t,4.25,5.93)+between(t,7.25,8.01))',setpts=N/FRAME_RATE/TB" \
 -af "aselect='not(between(t,1.25,2.93)+between(t,4.25,5.93)+between(t,7.25,8.01))',asetpts=N/SR/TB" \
 -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac out_jump.mp4

# 미세 배속 1.02x
ffmpeg -y -i raw.mp4 -vf "setpts=PTS/1.02,fps=30" -af "atempo=1.02" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac out_102.mp4

# 목소리 노이즈 제거(60Hz 험 -49dB) + 음량 자동 맞추기 + -14 LUFS
ffmpeg -y -i raw.mp4 -af "highpass=f=85,equalizer=f=60:width_type=q:w=6:g=-30,afftdn=nf=-25,\
acompressor=threshold=-30dB:ratio=8:attack=5:release=200:makeup=12,alimiter=limit=0.95,\
loudnorm=I=-14:TP=-1.5:LRA=11" -c:v copy -c:a aac -b:a 192k out_clean.mp4

# 스피드 램프(구간 분할 8개, 0.56x→1.44x) — 전체 명령은 references/ffmpeg-recipes.md 22번
# 피치: 1.5배속인데 음정 유지 / 음정도 같이 올리기
ffmpeg -y -i raw.mp4 -vf "setpts=PTS/1.5,fps=30" -af "atempo=1.5" -c:a aac out_lock.mp4
ffmpeg -y -i raw.mp4 -vf "setpts=PTS/1.5,fps=30" -af "asetrate=48000*1.5,aresample=48000" -c:a aac out_pitchup.mp4

# 오버레이 스틸만 빠르게 확인
python3 scripts/render_overlay.py overlay.json --preview out/prev --times 0.5,2.0,4.0

# 안전영역 가이드 켜고 렌더
python3 scripts/render_overlay.py overlay.json --base build/cut.mp4 -o check.mp4 --guide
```

---

## 6. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 자막이 □□□ | 한국어 폰트 없음/이름 불일치 | 폰트 설치 후 `--font`로 정확한 이름 지정. Linux는 `ffmpeg ... -vf "subtitles=subs.ass:fontsdir=/폰트폴더"` |
| `subtitles` 필터 없음 | libass 없는 FFmpeg | libass 포함 빌드 설치(winget/brew 기본 빌드는 포함) |
| `Invalid too big or non positive size` | 크롭 순서 | `cover` → `scale=iw*z` → `crop` 순서로 |
| 브라우저 실행 실패 | Chromium 미설치 | `python3 -m playwright install chromium` (Linux는 추가 라이브러리 필요) |
| 렌더가 메모리 부족으로 죽음 | 동시성 | `--preset veryfast`, 또는 Remotion은 `--concurrency 1` |
| 결과가 60초 초과 | 길이 계산 | 컷을 줄인다(음악 클레임 시 차단 위험) |
| 이모지가 흑백/네모 | 폰트에 컬러 이모지 없음 | HTML 경로에서 PNG 아이콘 사용 |
| 명령줄이 너무 길다 | 필터 폭증 | `-filter_complex_script filter.txt` |

---

## 7. 검증 범위 (정직한 고지)

- **검증함**: FFmpeg 26레시피 실행·출력 규격 확인(미세 배속 6.00→5.88초, 무음 컷 8.01→3.93초, SFX 믹싱 RMS 0→0.053, 페이드+BGM -14.0 LUFS, 스피드 램프 6.00→6.61초(이론 6.53), 피치 1.5배속 440.3Hz/660.3Hz·+2반음 494.2Hz·-3반음 370.4Hz, 노이즈 제거 60Hz 0.1799→0.00062, 음량 편차 27.5배→2.4배(-14.0 LUFS), 통합 체인 -13.5 LUFS·BGM -17.6dB 덕킹), ASS 모션 15종 생성·굽기·프레임 확인, 자간·행간(2줄 124px 간격) 렌더 확인, HTML 오버레이 렌더→합성(6초/180프레임), 한국어 폰트 렌더.
- **검증 못 함**: Windows/macOS 경로·폰트 이스케이프, Remotion 경로(별도 npm 설치 필요), 유튜브 실제 업로드, 사용자 PC의 구형 FFmpeg, 50Hz 전원 환경의 험 노치.
- 검증 환경: FFmpeg n9.0.2, Python 3.12, Chromium 159(headless), Noto Sans CJK KR.

---

## 8. 라이선스·출처

- 이 스킬 코드·문서: **MIT**
- 참고한 공개 스킬(코드 복사 아님, 구조·패턴 참고):
  - `misssu33/content-pipeline` (MIT) — 파이프라인 구조·체크포인트
  - `akfldk1028/YTB-SKILLS` — FFmpeg 실무 패턴, Shorts SEO
  - `social-media-skills/remotion-shorts-skill` (MIT) — 1080x1920 안전영역 수치, 읽기 속도 타이밍
  - `buainoai/remotion-skills` — Remotion 구성 패턴
- Remotion은 MIT가 아닙니다. 4인 이상 회사에서 자동 렌더하면 회사 라이선스가 필요합니다(remotion.pro/license). 이 스킬의 기본 경로(FFmpeg/HTML)는 Remotion을 쓰지 않습니다.
- 폰트는 각 라이선스를 따릅니다. 상업용 무료 폰트만 사용하세요.
