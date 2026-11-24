---
name: shorts-pro
description: 한국형 YouTube Shorts/Reels 세로 영상(9:16)을 PC에서 끝까지 만드는 통합 스킬. 아이돌·무대 컷 편집(좌우반전, 배속, 스피드 램프, 색보정, 구간 자르기, 9:16 크롭·줌, 16:9 블러 배경, 비트 컷 연결), 음정 유지/피치 반음 조절, 목소리 노이즈 제거(험·히스), 음량 자동 맞추기, BGM 오토더킹과 모션 자막 15종, 상단 고정 배지+2색 타이틀, 유튜브 댓글 카드, 코너 출처 라벨, 브릿지 자막, 한국어 훅·SEO까지 FFmpeg + HTML/Chrome(선택: Remotion)으로 로컬 렌더한다. Use whenever the user asks for 쇼츠/릴스 만들기, 쇼츠 자동화, 세로 영상 편집, 모션 자막, 아이돌 직캠 컷, 9:16 변환, 유튜브 쇼츠 제목·태그, or a Shorts pipeline in Claude Code / Codex CLI (also "shorts", "reels", "vertical video", "caption animation").
license: MIT
metadata:
  version: "1.2.0"
  locale: ko-KR
  requires: [ffmpeg >= 5, python3 >= 3.9, node >= 18 (선택)]
---

# shorts-pro — 한국형 쇼츠 제작·자동화

주제·원본 클립 하나에서 **9:16 MP4 + 유튜브 메타데이터**까지 만든다.
편집은 FFmpeg, 카드·모션 자막은 HTML+Chrome(또는 ASS)으로 그린 뒤 합성한다.

> **먼저 읽을 것**
> - 명령을 실행하기 전에 `references/ffmpeg-recipes.md`를 읽고 그 안의 검증된 레시피를 그대로 쓴다(임의로 필터를 지어내지 않는다).
> - 자막 모션·레이아웃 좌표는 `references/motion-presets.md`와 `presets.json`이 기준이다. 값을 바꿀 때는 `presets.json`만 고친다.
> - 전체 흐름·체크포인트는 `references/pipeline-workflow.md`.

---

## 0. 환경 확인 (한 번만)

```bash
ffmpeg -version | head -1          # 필수. libx264·libass 포함 빌드
ffprobe -version | head -1
python3 --version                  # scripts/*.py 실행용 (3.9+)
node --version                     # 선택: Remotion 경로를 쓸 때만 (18+)
fc-list :lang=ko | head            # Linux: 한국어 폰트 확인
```

- `ffmpeg`가 없으면: Windows `winget install Gyan.FFmpeg` / macOS `brew install ffmpeg` / Ubuntu `sudo apt install ffmpeg`.
- 한국어 폰트가 없으면 자막이 네모(□)로 나온다. Noto Sans KR·Pretendard·Malgun Gothic 중 하나를 설치한다.
- `python3 scripts/check_env.sh` 로 한 번에 점검할 수 있다.

**중단 조건**: ffmpeg가 없거나 한국어 폰트가 없으면 렌더하지 말고 사용자에게 설치를 안내한다. 폰트 없는 상태로 렌더하면 결과물이 전부 깨진다.

---

## 1. 무엇을 만들지 먼저 확정한다 (한 번에 한 메시지)

| 물어볼 것 | 기본값 |
|---|---|
| 소재: 원본 영상 클립 / 사진 / 주제(리서치 필요) | — |
| 톤: 아이돌·무대형 / 정보·리스트형 / 감성·명언형 | 아이돌형 |
| 길이 | 15~45초 (최대 59초) |
| 자막 언어·폰트 | 한국어 / OS 기본 한국어 폰트 |
| 자막 모션 강도: 잔잔 / 보통 / 화려 | 보통(`pop-bounce`, `chip-wipe`, `word-highlight` 조합) |
| 업로드 문구까지 만들지 | 예(제목·태그·고정댓글) |
| 오디오 다듬기: 음정 유지 / 노이즈 제거 / 음량 맞추기 / BGM 더킹 | 음정 유지 ON, 나머지는 소스에 따라 (잡음 많으면 노이즈 제거·음량 맞추기 ON) |

이미 답이 있으면 다시 묻지 않는다. 사용자가 "알아서"라고 하면 위 기본값으로 진행하고, 결과 보고에 무엇을 골랐는지 적는다.

---

## 2. 파이프라인 (5단계)

### Step 1 — 기획: 훅 1~3초
- 첫 프레임에 훅이 **완성된 채로** 보여야 한다(페이드인·로고·인트로 금지).
- 12자 이내 한 줄. 숫자 / 반전 / 약속 중 하나. `presets.json`의 `hooks.patterns` 참고.
- 구조: `[0~3초 훅] → [3~15초 본문] → [15~20초 클로저(또는 훅으로 되돌리기)]`.
- 한 쇼츠에 메시지 하나. 화면마다 새 정보가 있어야 한다(같은 문장 재탕은 유튜브 "비진정성 콘텐츠" 정책에 걸린다).

### Step 2 — 소스 정리: 자막 타이밍
말이 있는 영상이면 Whisper로 타임스탬프를 뽑고, 없으면 SRT를 직접 쓰거나 균등 분배한다.

```bash
# faster-whisper (권장, 로컬·무료)
pip install faster-whisper
python3 - <<'PY'
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = m.transcribe("raw.mp4", language="ko", vad_filter=True)
for s in segs:
    print(f'{{"start": {s.start:.2f}, "end": {s.end:.2f}, "text": "{s.text.strip()}"}},')
PY
```

결과를 `captions.json`으로 저장한다(형식은 `references/motion-presets.md`).
노래·무대 영상처럼 말이 없으면 자막은 "설명 카드"로 만들고, 컷 타이밍은 곡의 BPM으로 잡는다.

### Step 3 — 컷·보정 (FFmpeg)
`references/ffmpeg-recipes.md`의 레시피를 쓴다. 최소 세트:

1. **9:16 맞추기** — `cover`(가운데 크롭) 또는 `blurfill`(16:9를 위아래 블러로 채움).
2. **클립별 크롭·줌** — 피사체가 오른쪽이면 크롭 x를 0.72로. 정적 줌은 `zoom` 레시피.
3. **미러링·배속·색보정** — 아이돌 직캠은 `hflip` + `1.5x` + `vivid`가 기본 조합.
4. **미세 배속** — 1.01x·1.02x·1.03x처럼 0.01 단위로 조금만. `setpts=PTS/1.02,fps=30` + `atempo=1.02` (16번). `presets.json` `speed_presets`의 `micro-1xx`.
5. **무음 자동 컷** — `silencedetect`로 무음 찾고 `select`/`trim+concat`으로 빼기 (18번). 말이 끊기는 구간을 직접 찾지 않아도 된다.
6. **스피드 램프** — 한 클립 안에서 서서히 빨라지거나 느려지기(빠→느→빠 하이라이트 감속 포함). 소리가 있으면 구간 분할 `trim`+`setpts`/`atempo`+`concat`(22번), 무음 클립은 `setpts` 식(22-1). `presets.json` `speed_ramp`.
7. **비트 컷** — 곡 오디오는 그대로 두고 영상 구간만 박자마다 교체.

같은 원본으로 다른 버전이 필요하면 `presets.json` `micro_variation_presets`(17번)를 쓴다. 배속 1.02 + 미세 색보정 + 3% 크롭(+선택 반전)까지 한 줄로 처리되고, 크롭·반전은 안전영역과 화면 속 글자를 같이 잃는다는 점을 먼저 확인한다.

중간 결과는 **intermediate**(crf 16)로 저장해 화질 손실을 줄인다.

### Step 4 — 오버레이·모션 자막
두 경로 중 하나를 고른다. 둘 다 `presets.json`을 읽는다.

- **A. ASS 경로 (FFmpeg만)** — 자막 15종 전부. 빠르고 가볍다. 둥근 모서리는 안 된다.
  ```bash
  python3 scripts/make_ass.py captions.json -o build/subs.ass --preset pop-bounce
  python3 scripts/make_ass.py captions.json -o build/subs.ass --letter-spacing 3 --line-height 1.35
  ffmpeg -i cut.mp4 -vf "subtitles=build/subs.ass:fontsdir=/path/to/fonts" ... out.mp4
  ```
  `--letter-spacing`은 ASS Style의 `Spacing`(음수 가능), `--line-height`는 여러 줄 큐를 줄마다 `\pos`로 배치해 행간을 맞춘다(21번).
- **B. HTML/Chrome 경로** — 상단 배지+2색 타이틀, 댓글 카드, 코너 라벨처럼 **카드형 오버레이**가 필요할 때.
  ```bash
  pip install playwright && python3 -m playwright install chromium
  python3 scripts/render_overlay.py overlay.json --base cut.mp4 -o final.mp4
  ```

카드가 필요 없으면 A만, 카드가 하나라도 있으면 B로 통일한다(B에서 자막도 함께 그린다).

### Step 5 — 마무리: 오디오, 인코딩, SEO
- 오디오 정리 순서: **노이즈 제거 → 레벨링 → (asplit) 더킹 → 믹스 → loudnorm → 리미터** (24~26번).
  - 노이즈 제거: `highpass=f=85,equalizer=f=60:width_type=q:w=6:g=-30,afftdn=nf=-25` — 험 -49dB, 목소리 대역은 그대로 (24번).
  - 음량 자동 맞추기: `acompressor=threshold=-30dB:ratio=8:attack=5:release=200:makeup=12,alimiter=limit=0.95` — 작은/큰 소리 편차 27.5배 → 2.4배 (25번). `loudnorm`은 편차를 줄이지 않는다.
  - 목표 음량: `loudnorm=I=-14:TP=-1.5:LRA=11` (유튜브 기준). BGM은 `sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350`로 말소리만큼 ducking(-17dB).
  - **원음을 sidechain과 amix 두 곳에 쓸 때는 `asplit=2`** — 안 하면 필터를 거치지 않은 원음이 섞여 노이즈 제거가 무효가 된다(14번).
- 음정: 배속 시 `atempo`(음정 유지)가 기본. 음정도 같이 올리려면 `asetrate=48000*{r},aresample=48000`, 반음 조절은 `asetrate`+`atempo(1/r)` (23번).
- **페이드 인/아웃**: 0 / 0.3 / 0.5 / 1.0초. 소리는 `afade`, 화면은 `fade`. **`afade`는 `amix` 뒤에** 건다(20번).
- **효과음**: 외부 파일 없이 `aevalsrc`/`anoisesrc`로 합성해 `adelay`+`amix`로 얹는다. 팝·띠링·스우시·찰칵·타격 5종은 `presets.json` `audio_mix.sfx` (19번).
- **BGM**: 사용자가 준 음원만. `-stream_loop -1` + `volume` + ducking.
- 인코딩: `libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -colorspace bt709 -movflags +faststart`, 오디오 `aac 192k 48kHz`.
- SEO: 제목 40자 이내(검색어 앞쪽), 설명 첫 2줄에 핵심, 태그 5~15개, 고정댓글에 질문 하나. `presets.json`의 `seo` 템플릿을 채운다.

---

## 3. 품질 게이트 (통과 못 하면 내보내지 않는다)

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,pix_fmt,color_space \
  -of default=nw=1 out.mp4      # 1080x1920, 30/1, yuv420p, bt709
```

- [ ] 해상도 1080x1920, 30fps, yuv420p, bt709
- [ ] 길이 15~59초 (60초 이상은 음악 클레임 시 차단 위험)
- [ ] 첫 프레임에 훅이 완성돼 있다
- [ ] 자막이 안전영역 안에 있다 — 상단 288px·하단 672px·좌 96px·우 192px 회피
- [ ] 한국어가 네모(□)로 깨지지 않는다 — 1초 프레임을 뽑아 눈으로 확인
- [ ] 오디오 -14 LUFS 근처, 클리핑 없음
- [ ] 제목·태그·고정댓글 작성 완료

프레임 확인은 항상 **파일명을 새로** 해서 뽑는다(같은 경로는 캐시된 그림을 볼 수 있다).

```bash
ffmpeg -y -ss 1.0 -i out.mp4 -frames:v 1 check/frame_$(date +%H%M%S).png
```

---

## 4. 하면 안 되는 것

- 숫자·인용을 지어내지 않는다. 출처를 못 대면 화면에 쓰지 않는다(`footer`에 출처 표기).
- 같은 파일을 여러 계정에 그대로 올리지 않는다. 계정마다 훅·테마·순서를 바꾼 별도 버전을 만든다.
- 업로드·게시는 사용자 확인 없이 하지 않는다. 이 스킬은 **파일 생성까지** 담당한다.
- 폰트 라이선스: 상업용 무료 폰트만. 확신이 없으면 사용자에게 확인한다.
- 이모지 자막은 폰트에 따라 흑백/네모로 나온다. 중요한 표시는 HTML 경로의 PNG 아이콘이나 기호(!, ★)를 쓴다.

---

## 5. 파일 구조

```
shorts-pro/
├── SKILL.md                  # 이 파일
├── README.md                 # 설치·사용 안내서
├── presets.json              # 프리셋 단일 기준(자막 15종·레이아웃·색·인코딩·SEO)
├── 사용방법-가이드.pdf        # 사람용 사용설명서(PDF)
├── assets/overlay.html       # 카드·타이틀·모션 자막 렌더러(Chrome)
├── scripts/
│   ├── make_ass.py           # captions.json -> 모션 자막 .ass
│   ├── render_overlay.py     # overlay.json -> PNG 프레임 -> 영상 합성
│   └── check_env.sh          # 환경 점검
└── references/
    ├── ffmpeg-recipes.md     # 검증된 FFmpeg 레시피(실행 결과 포함)
    ├── motion-presets.md     # 자막 모션 15종 + 레이아웃 + 안전영역
    └── pipeline-workflow.md  # 5단계 워크플로·체크포인트·실패 대응
```

## 6. 참고한 공개 스킬(구조·패턴)

- `misssu33/content-pipeline` — 리서치→카드뉴스→영상 파이프라인 구조, 단계별 체크포인트
- `akfldk1028/YTB-SKILLS` — FFmpeg 편집/자막/연결 패턴, Shorts SEO 규칙, `-preset ultrafast -crf 23`·drawtext `textfile`·필터 8KB 초과 시 `-filter_complex_script` 같은 실무 주의점
- `social-media-skills/remotion-shorts-skill` — 1080x1920 안전영역 수치(상단 288/하단 672/좌 96/우 192), 읽기 속도 기반 타이밍, 후킹·정확성 규칙
- `buainoai/remotion-skills` — Remotion 컴포지션 구성 패턴(Remotion 경로를 쓸 때 참고)
