# 5단계 워크플로 — 주제/클립 → 9:16 MP4 + 유튜브 SEO

```
[1] 기획·훅 → [2] 소스·타이밍 → [3] 컷·보정(FFmpeg) → [4] 오버레이·자막 → [5] 오디오·인코딩·SEO
```

각 단계는 **결과물 파일**을 남긴다. 실패해도 앞 단계 결과는 살아 있게 만든다(부분 완성 보고가 가능해야 한다).

---

## Step 1. 기획 (5분)

**입력**: 사용자가 준 주제·클립·링크
**출력**: `plan.md`

1. 한 문장 목표: "이 쇼츠를 본 사람이 ___하게 된다."
2. 훅 3안 만들고 1개 고르기(12자 이내, 숫자·반전·약속 중 하나).
3. 씬 리스트(6~10칸): `씬 | 화면(어떤 클립/구간) | 자막 | 길이`.
4. 길이 목표: 정보형 20~35초, 무대형 15~30초. 59초를 넘기지 않는다.

**체크포인트** — 사용자에게 훅 3안을 보여주고 고르게 한다. (이미 정해졌으면 생략)
**실패 대응**: 소재가 부족하면 같은 클립에서 다른 구간을 쓰거나, 카드/이미지형으로 전환한다.

---

## Step 2. 소스·타이밍 정리

**출력**: `captions.json`, 씬별 클립 목록

```bash
# 1) 원본 규격 확인 (해상도·fps·길이·오디오 유무)
ffprobe -v error -show_entries stream=index,codec_type,width,height,r_frame_rate,duration \
        -of default=nw=1 raw.mp4

# 2) 말이 있으면 자막 타이밍
python3 - <<'PY'
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = m.transcribe("raw.mp4", language="ko", vad_filter=True)
for s in segs: print(f'{{"start": {s.start:.2f}, "end": {s.end:.2f}, "text": "{s.text.strip()}"}},')
PY

# 3) 곡 BPM (비트 컷용) — 수동 확인이 가장 빠름
#    120BPM = 1박 0.5초 = 2박 1.0초 단위로 컷
```

**판단 규칙**
- 16:9 원본 + 피사체가 화면 일부 → 크롭·줌(레시피 7)
- 16:9 원본 + 구도 유지 필요(풀캠·인터뷰) → 블러 배경(레시피 2)
- 세로 원본 → 그대로(레시피 3~6만 적용)

---

## Step 3. 컷·보정 (FFmpeg)

**출력**: `build/cut.mp4` (1080x1920, 30fps, 오디오 유지, crf 16)

```bash
mkdir -p build
# 예: 클립별 9:16 정규화 + 비트 컷
ffmpeg -y -i SONG.m4a -i A.mp4 -i B.mp4 -filter_complex "\
[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=1.0:2.0,setpts=PTS-STARTPTS[v0];\
[2:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=2.0:3.0,setpts=PTS-STARTPTS[v1];\
[v0][v1]concat=n=2:v=1:a=0[v]" \
 -map "[v]" -map 0:a -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p \
 -c:a aac -b:a 192k -ar 48000 -shortest build/cut.mp4
```

**중간 확인** (반드시)
```bash
ffmpeg -y -ss 0.5 -i build/cut.mp4 -frames:v 1 build/check_cut_$(date +%H%M%S).png
```
- 세로 프레임에 피사체가 잘리지 않았는지, 미러링으로 글자가 뒤집히지 않았는지 본다.

**흔한 실패**
| 증상 | 원인 | 해결 |
|---|---|---|
| `Invalid too big ... crop` | 확대 전에 크롭 | `cover` 먼저 → `scale=iw*z` → `crop` (레시피 7) |
| 오디오가 영상보다 김 | `-shortest` 누락 | `-shortest` 또는 `atrim` |
| 클립 경계에서 화면 튐 | 해상도·fps 불일치 | 각 입력에 `fps=30,scale=...,setsar=1` |
| 색이 바랜 듯 | bt709 미지정 | 최종 인코딩에 `-colorspace bt709` |

---

## Step 4. 오버레이·모션 자막

**출력**: `build/overlay.mp4` 또는 `build/subs.ass`

카드(타이틀·댓글·코너)가 하나라도 있으면 **HTML 경로**, 자막만 있으면 **ASS 경로**.

```bash
# A. ASS 경로
python3 scripts/make_ass.py captions.json -o build/subs.ass --style-by-caption
ffmpeg -y -i build/cut.mp4 -vf "subtitles=build/subs.ass:fontsdir=/usr/share/fonts/pickle-hwp" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a copy build/subtitled.mp4

# B. HTML 경로
python3 scripts/render_overlay.py overlay.json --preview build/prev --times 0.3,2.5,4.5
python3 scripts/render_overlay.py overlay.json --base build/cut.mp4 -o build/overlay.mp4
```

**확인 순서**
1. `--preview` 스틸 3장: 훅·중간·마지막.
2. 안전영역: `--guide`로 점선을 켜고 겹침 확인.
3. 한국어 깨짐(□) 확인 — 폰트 이름이 OS에 있는지.
4. 자막이 화면을 30% 이상 가리지 않는지.

**실패 대응**
- Playwright 미설치 → `pip install playwright && python3 -m playwright install chromium`
- 브라우저가 안 뜸(Linux) → `README.md` 6절 문제 해결 참고(필요 라이브러리 설치 후 `python3 -m playwright install chromium`), 그래도 안 되면 ASS 경로로 폴백
- ASS가 안 구워짐 → `ffmpeg -filters | grep subtitles` (libass 없는 빌드면 폴백: drawtext)

---

## Step 5. 오디오·최종 인코딩·SEO

**출력**: `final.mp4` + `youtube.md`

```bash
# 음량 정리(음성+BGM이 있으면 덕킹)
ffmpeg -y -i build/overlay.mp4 -stream_loop -1 -i bgm.m4a -filter_complex "\
[1:a]volume=0.28,atrim=0:$(ffprobe -v error -show_entries format=duration -of csv=p=0 build/overlay.mp4)[b];\
[0:a]aresample=48000[a0];[b][a0]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350[bd];\
[a0][bd]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[am]" \
 -map 0:v -map "[am]" -c:v copy -c:a aac -b:a 192k -ar 48000 final.mp4

# 최종 확인
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,pix_fmt,color_space \
        -of default=nw=1 final.mp4
ffmpeg -i final.mp4 -af ebur128 -f null - 2>&1 | grep -A3 "Integrated loudness"
```

### SEO 작성

| 항목 | 규칙 | 예 |
|---|---|---|
| 제목 | 40자 이내, 검색어 앞쪽, 숫자·괄호 활용, #Shorts는 제목에 넣지 않음 | `오른쪽 4명 칼군무, 카메라가 놓친 장면 (인기가요)` |
| 설명 1~2줄 | 접힌 상태에서 보이는 핵심 + 출처 | `10.25 인기가요 풀캠에서 오른쪽 4명 동선이 가장 깔끔한 구간만 모았습니다.` |
| 태그 | 5~15개, 롱테일 포함 | `아이돌 직캠, 칼군무, 인기가요, 무대 직캠, 쇼츠` |
| 해시태그 | `#Shorts` + 주제 1~2개 | `#Shorts #직캠` |
| 고정댓글 | 영상에서 못다한 한 줄 + 질문 하나 | `다음엔 어느 멤버 직캠 볼까요? 댓글로 알려주세요!` |
| 업로드 시간 | KST 18:00~23:00 | — |

`youtube.md`에 위 내용을 채워 남긴다. `presets.json` `seo.description_template` 참고.

---

## 예시 A — 아이돌 무대 컷 (30초)

| 씬 | 화면 | 오버레이 | 시간 |
|---|---|---|---|
| 1 | 풀캠에서 오른쪽 4명 크롭·줌(1.4배) | 배지 `카메라가 놓친` + `오른쪽 4명 칼군무` / 자막 `pop-bounce` | 0~3초 |
| 2 | 다른 무대 클립으로 비트 컷 | 댓글 카드 `이 구간만 무한반복` / 코너 `10.25 인기가요 풀캠` | 3~8초 |
| 3 | 슬로모(0.5x) 안무 클로즈업 | 브릿지 자막 `같은 순간, 오른쪽에선` (`rise-lines`) | 8~12초 |
| 4 | 16:9 풀캠을 블러 배경으로 | 자막 `count-up` `조회수 120만` | 12~20초 |
| 5 | 엔딩 컷 | CTA `저장해두고 다시 보기` | 20~25초 |

## 예시 B — 정보형 리스트 (35초)

1. 훅: `쇼츠 조회수 3배` (`chip-wipe`)
2. 본문 3개: 항목마다 `shift-key` + 숫자 `count-up`
3. 마무리: `저장` CTA 한 줄, 고정댓글에 질문

정보형은 **모든 숫자에 출처**가 있어야 한다. 화면 하단이나 설명란에 `Data: 출처`를 남긴다.

---

## 실패 시 부분 완성 보고 형식

```
완성:
✅ Step 1 plan.md
✅ Step 2 captions.json (큐 12개)
✅ Step 3 build/cut.mp4 (1080x1920, 24.0초)
❌ Step 4 HTML 렌더 — Playwright 브라우저 미설치
남은 일: `python3 -m playwright install chromium` 후 Step 4~5 재실행
```

---

## 품질 게이트 (최종)

- [ ] 1080x1920 / 30fps / yuv420p / bt709
- [ ] 15~59초
- [ ] 첫 프레임에 훅 완성
- [ ] 안전영역(상288·하672·좌96·우192) 준수
- [ ] 한국어 깨짐 없음
- [ ] -14 LUFS 근처, 클리핑 없음
- [ ] 제목·태그·고정댓글 준비
- [ ] 같은 파일을 여러 계정에 재사용하지 않음
