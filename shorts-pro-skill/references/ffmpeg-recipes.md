# FFmpeg 레시피 (검증본)

이 문서의 명령은 **FFmpeg n9.0.2**(2026-09-30 정적 빌드, `libx264`·`libass`·`libfreetype`·`libmp3lame` 포함)에서 실제로 실행해 결과를 확인했다.
아래 "검증" 줄의 수치는 그 실행에서 나온 실제 출력이다. 사용자 PC의 FFmpeg 5.x/6.x/7.x에서도 같은 옵션 이름이 유지되지만, **필터가 없으면**(예: `libass` 미포함 빌드) 오류가 나므로 `ffmpeg -filters | grep subtitles`로 먼저 확인한다.

공통 표기
- 입력: `IN.mp4` (16:9 1280x720 또는 1920x1080), `IN_V.mp4` (이미 9:16)
- 출력 규격: **1080x1920, 30fps, yuv420p, bt709, AAC 192k 48kHz**

---

## 0. 최종 인코딩 플래그 (모든 내보내기에 공통)

```bash
-c:v libx264 -preset slow -crf 18 -profile:v high -level 4.2 -pix_fmt yuv420p \
-color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart \
-c:a aac -b:a 192k -ar 48000 -ac 2
```

중간 렌더(합성 전)는 `-preset veryfast -crf 16`을 쓴다. 초안은 `-preset veryfast -crf 23`.
`presets.json`의 `encode_presets`와 같다.

---

## 1. 9:16 맞추기 ① — 가운데 크롭(cover)

16:9 원본을 세로 화면에 꽉 채운다. 좌우가 잘린다.

```bash
ffmpeg -y -i IN.mp4 -vf "scale=-2:1920,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -an out_cover.mp4
```

- `scale=-2:1920` : 높이를 1920에 맞추고 폭은 짝수로 자동.
- `crop`의 x/y를 0.15·0.85 등으로 바꾸면 좌/우 피사체를 잡는다 → `presets.json` `crop_presets`.
- **검증**: 1920x1080 4.0초 입력 → 1080x1920 `[SAR 1:1 DAR 9:16]`, 4.00초 출력 확인.

## 2. 9:16 맞추기 ② — 위아래 블러 배경(blurfill)

원본 구도를 유지하고 남는 위아래를 같은 영상의 흐린 배경으로 채운다. 무대 풀캠·인터뷰에 적합.

```bash
ffmpeg -y -i IN.mp4 -filter_complex "\
[0:v]split=2[bg][fg];\
[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.06[bgb];\
[fg]scale=1080:-2[fgs];\
[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]" \
  -map "[v]" -map 0:a? -c:v libx264 -preset veryfast -crf 16 -c:a aac out_blur.mp4
```

- `gblur=sigma=40`이 기본. 너무 뿌우면 24, 더 흐리게 60.
- 배경을 어둡게(`eq=brightness=-0.06`) 해야 위에 얹는 자막이 읽힌다.
- **검증**: 1080x1920 출력, 오디오 스트림 유지 확인.

## 3. 좌우 반전(미러링)

```bash
ffmpeg -y -i IN.mp4 -vf "hflip" -c:v libx264 -preset veryfast -crf 16 -c:a copy out_mirror.mp4
```

저작권 회피·표정 방향 맞추기용. 반전하면 **화면 안의 글자·로고도 뒤집힌다** — 자막·워터마크는 반전 후에 얹는다.

## 4. 배속

```bash
# 1.5배속 (영상+오디오)
ffmpeg -y -i IN.mp4 -vf "setpts=PTS/1.5,fps=30" -af "atempo=1.5" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac out_x15.mp4
```

- `atempo`는 **0.5~2.0**만 직접 받는다. 2배를 넘기려면 체인: `atempo=2.0,atempo=1.5`(=3배).
- 0.5배 슬로모는 `setpts=PTS/0.5` + `atempo=0.5`.
- **검증**: 6.00초 → 1.5배속 4.00초, 오디오 피치 유지.
- 클립 **안에서** 속도가 변해야 하면 → **22. 스피드 램프**. 배속에 따라 음정도 같이 올리고/내리고 싶으면 → **23. 피치**.

## 5. 색보정·필터 (프리셋 5종)

`presets.json` `color_presets`의 값을 그대로 필터 문자열로 만든다.

| 프리셋 | 필터 |
|---|---|
| 기본 | (없음) |
| 선명하게 | `eq=brightness=0.03:contrast=1.12:saturation=1.18,unsharp=5:5:0.6:5:5:0.0` |
| 시네마 | `eq=brightness=-0.02:contrast=1.18:saturation=0.92,colorbalance=rs=0.03:bs=-0.04,curves=preset=medium_contrast` |
| 쿨톤 | `eq=brightness=0.01:contrast=1.06:saturation=1.05,colorbalance=rs=-0.06:bs=0.08` |
| 웜톤 | `eq=brightness=0.02:contrast=1.05:saturation=1.08,colorbalance=rs=0.08:gs=0.02:bs=-0.06` |

```bash
# 미러 + 1.5배속 + 선명하게 (아이돌 직캠 기본 조합)
ffmpeg -y -i IN.mp4 \
 -vf "hflip,eq=brightness=0.03:contrast=1.12:saturation=1.18,unsharp=5:5:0.6:5:5:0.0,setpts=PTS/1.5,fps=30" \
 -af "atempo=1.5" -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac out_idol.mp4
```

- **검증**: hflip+eq+unsharp+1.5배속 조합 6.00초 → 4.00초, 30fps 유지.
- `unsharp`는 과하면 피부가 거칠어진다. 0.6 이상은 얼굴 클로즈업에서 피한다.

## 6. 구간 자르기

```bash
# 정확 컷(재인코딩): 1.0초부터 2.0초
ffmpeg -y -ss 1.0 -i IN.mp4 -t 2.0 -c:v libx264 -preset veryfast -crf 16 -c:a aac out_trim.mp4

# 빠른 컷(키프레임 기준, 화면 튐 가능)
ffmpeg -y -ss 1.0 -i IN.mp4 -t 2.0 -c copy out_trim_fast.mp4
```

- `-ss`를 **`-i` 앞에** 두면 빠르고 정확도도 충분하다(요즘 빌드).
- **검증**: 6.00초 입력 → 2.00초 출력.

## 7. 9:16 크롭 + 피사체 이동(줌 크롭)

"오른쪽 4명만"처럼 특정 구역을 당겨 보여줄 때.

```bash
ffmpeg -y -i IN.mp4 -vf "\
scale=1080:1920:force_original_aspect_ratio=increase,\
scale=iw*1.4:ih*1.4,\
crop=1080:1920:(iw-1080)*0.72:(ih-1920)/2,setsar=1" \
 -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -an out_zoomcrop.mp4
```

- **순서가 중요하다**: 먼저 `cover`로 1080x1920을 채운 뒤 `scale=iw*1.4`로 확대하고 크롭한다. `scale=-2:1920`부터 시작하면 높이가 1920뿐이라 크롭할 여유가 없어 `Invalid too big or non positive size` 오류가 난다(실제로 이 순서로 실패했다).
- x 계수: 0=왼쪽, 0.5=가운데, 0.72~0.85=오른쪽 피사체.
- **검증**: 1920x1080 → 1080x1920, 4.00초, 오류 없음.

## 8. 서서히 당기는 줌 (Ken Burns)

정지 이미지나 고정 카메라 클립에 생기를 준다.

```bash
ffmpeg -y -i IN_V.mp4 -vf "\
zoompan=z='min(1+0.0018*on,1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1" \
 -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -an out_ken.mp4
```

- `0.0018`이 4초에 약 1.22배. `d=1`+`fps=30`을 함께 줘야 프레임 수가 유지된다.
- 이미지 1장을 영상으로: `-loop 1 -i img.png -t 5`와 조합한다.
- **검증**: 4.00초 입력 → 4.00초 출력(프레임 수 동일).

## 9. 하드컷 연결 (전 구간 규격 통일)

```bash
ffmpeg -y -i A.mp4 -i B.mp4 -filter_complex "\
[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p[v0];\
[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p[v1];\
[0:a]aresample=48000[a0];[1:a]aresample=48000[a1];\
[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 16 -c:a aac out_concat.mp4
```

- 클립마다 해상도·fps·SAR가 달라도 위처럼 정규화하면 붙는다. `-c copy` concat은 규격이 다르면 깨진다.
- **검증**: 6.00초 + 5.00초 → 11.00초 출력.

## 10. 전환 효과 (xfade)

```bash
ffmpeg -y -i A.mp4 -i B.mp4 -filter_complex "\
[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=0:3,setpts=PTS-STARTPTS[v0];\
[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=0:3,setpts=PTS-STARTPTS[v1];\
[v0][v1]xfade=transition=dissolve:duration=0.3:offset=2.7[v]" \
 -map "[v]" -an -c:v libx264 -preset veryfast -pix_fmt yuv420p out_xfade.mp4
```

- `offset` = 앞 클립 길이 − 전환 길이. 3초 클립 두 개, 0.3초 전환 → `offset=2.7`, 총 5.7초.
- 전환 종류: `fade, dissolve, wipeleft, wiperight, slideleft, slideright, smoothleft, smoothright, circleopen, radial, pixelize, fadeblack` (`presets.json` `transitions.types`).
- 숏츠는 0.15~0.3초. 그 이상은 늘어진다.
- **검증**: 총 5.70초 출력.

## 11. 비트 컷 (곡은 하나, 화면만 교체) ⭐ 아이돌·무대 핵심

```bash
ffmpeg -y -i SONG.m4a -i A.mp4 -i B.mp4 -filter_complex "\
[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=1.0:2.0,setpts=PTS-STARTPTS[v0];\
[2:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=2.0:3.0,setpts=PTS-STARTPTS[v1];\
[1:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,trim=3.0:4.0,setpts=PTS-STARTPTS[v2];\
[v0][v1][v2]concat=n=3:v=1:a=0[v]" \
 -map "[v]" -map 0:a -c:v libx264 -preset veryfast -pix_fmt yuv420p \
 -c:a aac -b:a 192k -ar 48000 -shortest out_beatcut.mp4
```

- 각 `trim=시작:끝`이 "박자 한 칸"이다. 120BPM이면 1박=0.5초, 보통 2박=1초 단위로 자른다.
- 영상만 `concat`, 오디오는 0번(곡)에서 그대로 → 곡이 끊기지 않는다. `-shortest` 필수.
- 같은 소스에서 여러 구간을 뽑을 때는 `-i`를 한 번만 주고 `[1:v]`를 여러 번 참조한다(위 예시의 v0·v2).
- **검증**: 1초×3구간 → 3.00초 출력, 곡 오디오 유지. (`-ar 48000`을 빼면 소스 샘플레이트 44100이 그대로 나왔다.)

## 12. FFmpeg만으로 상단 타이틀·코너 라벨

둥근 배지가 필요 없으면 `drawbox`+`drawtext`로 충분하다.

```bash
FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc   # OS 경로에 맞게
ffmpeg -y -i IN_V.mp4 -vf "\
drawbox=x=76:y=300:w=470:h=86:color=0x2F6BFF@0.95:t=fill,\
drawtext=fontfile=$FONT:text='카메라가 놓친':fontcolor=white:fontsize=44:x=104:y=320,\
drawtext=fontfile=$FONT:text='오른쪽 4명 칼군무':fontcolor=white:fontsize=76:borderw=4:bordercolor=black:x=(w-text_w)/2:y=420,\
drawbox=x=40:y=200:w=310:h=64:color=black@0.72:t=fill,\
drawtext=fontfile=$FONT:text='10.25 인기가요 풀캠':fontcolor=white:fontsize=34:x=60:y=214,\
drawtext=fontfile=$FONT:text='@choiaejjing':fontcolor=white@0.85:fontsize=32:x=w-text_w-56:y=206" \
 -c:v libx264 -preset veryfast -pix_fmt yuv420p out_titles.mp4
```

- **검증**: 한국어가 정상 렌더(네모 없음)됨을 프레임으로 확인.
- `fontfile=` 대신 `font='Noto Sans CJK KR'`(fontconfig 이름)도 된다. Windows는 `fontfile='C\:/Windows/Fonts/malgun.ttf'`처럼 콜론을 이스케이프한다.
- 텍스트가 길거나 따옴표·콜론이 들어가면 `textfile=title.txt`로 빼는 게 안전하다(아래 14).
- 둥근 모서리·2색 제목·댓글 카드는 이 방식으로 불가능하다 → `render_overlay.py`(HTML 경로)를 쓴다.

## 13. ASS 모션 자막 굽기

```bash
python3 scripts/make_ass.py captions.json -o build/subs.ass --preset pop-bounce --font "Noto Sans CJK KR"
ffmpeg -y -i IN_V.mp4 -vf "subtitles=build/subs.ass:fontsdir=/usr/share/fonts/pickle-hwp" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a copy out_subs.mp4
```

- `fontsdir`에 한국어 폰트가 있는 폴더를 지정하면 fontconfig 문제를 피할 수 있다.
- 자막 15종 생성·렌더 전부 검증(프레임 확인). 상세는 `motion-presets.md`.

## 14. 오디오: 라우드니스 + BGM 덕킹

```bash
ffmpeg -y -i IN_V.mp4 -stream_loop -1 -i BGM.m4a -filter_complex "\
[0:a]aresample=48000,asplit=2[a0][asc];\
[1:a]volume=0.28,atrim=0:6[b];\
[b][asc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350[bd];\
[a0][bd]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[am]" \
 -map 0:v -map "[am]" -c:v copy -c:a aac -b:a 192k -ar 48000 out_audio.mp4
```

- **`asplit`이 없으면 덕킹이 안 된다.** `[a0]`처럼 이름 붙인 출력을 `sidechaincompress`와 `amix` 두 곳에서 그대로 다시 쓰면, FFmpeg가 오류를 내지 않고 **원본 입력을 하나에 연결해 버려서** 필터를 거치지 않은 소리가 믹스에 섞인다(2026-11 직접 확인: 앞단에 `equalizer`로 60Hz 험을 지우고 `[a0]`을 두 번 쓰면 믹스 결과에 험이 **0.0004 → 0.0998**로 되살아났다). `asplit=2`로 갈라 써야 한다.
- 결과 음량은 `ebur128`로 확인: `ffmpeg -i out.mp4 -af ebur128 -f null -` → Summary의 `I:` 값.
- **검증**: 목표 -14 LUFS 대비 **-14.0 LUFS** 측정(`asplit=2` 수정본에서도 **-14.0 LUFS**).
- `-stream_loop -1`은 짧은 BGM을 영상 길이만큼 반복한다. `atrim` 길이는 영상 길이에 맞춘다.

## 15. 긴 필터·많은 자막에서 걸리는 문제 (실무 팁)

- **필터 출력을 두 곳에서 쓰면 `asplit`**: `[a0]` 같은 이름을 `sidechaincompress`와 `amix`에 두 번 쓰면 FFmpeg가 오류 없이 원본 입력을 물려 버린다(14번 실제 측정 참고). 오디오를 두 갈래로 쓰려면 항상 `asplit=2`.
- **"Argument list too long" / 명령줄 길이 초과**: 필터를 파일로 빼서 `-filter_complex_script filter.txt`로 넘긴다. (출처: `akfldk1028/YTB-SKILLS` ffmpeg-video-editor 주의사항 — 필터 8KB 초과 시 자동 전환)
- **drawtext 따옴표 지옥**: `textfile=한줄.txt`로 텍스트를 분리한다. 여러 줄은 `textfile` + `line_spacing`.
- **자막이 너무 많아 느려짐**: 30개 넘는 큐는 `make_ass.py`로 한 번에 처리하는 게 빠르다(이벤트 수십 개는 libass가 가볍게 처리).
- **`Invalid too big or non positive size`**: 크롭 순서 문제(7번) 또는 SAR 불일치. `setsar=1`을 붙인다.
- **소리가 영상보다 짧음/김**: `-shortest`, `apad`, `tpad`로 길이를 맞춘다.

## 16. 미세 배속 1.01x~1.05x (0.01 단위)

길이·호흡만 아주 조금 바꿀 때. `atempo`는 1.0 근처 값을 그대로 받는다(피치 유지).

```bash
# 1.02배속 (영상+오디오)
ffmpeg -y -i IN.mp4 -vf "setpts=PTS/1.02,fps=30" -af "atempo=1.02" \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_x102.mp4
```

- 배율별 길이(10초 클립 기준): **0.98 → 10.20초 / 1.01 → 9.90 / 1.02 → 9.80 / 1.03 → 9.71 / 1.05 → 9.52**
- `setpts=PTS/1.02`만 쓰면 프레임 수가 그대로라 재생기가 늘려 그리며 끓는다. **`fps=30`을 반드시 같이** 준다.
- 1.05를 넘으면 표정·손동작이 빨라 보인다. 1.01~1.03이 티가 가장 적다.
- **검증**: 6.00초 입력 → **5.88초** 출력(정확히 6/1.02), 1920x1080 30fps, 오디오 스트림 유지. 오디오 최고 주파수 **439.5 Hz → 439.5 Hz**(피치 그대로), 오디오 길이 5.882초.

## 17. 미세 배속 + 미세 변형 조합 (크롭·색·반전)

같은 원본으로 **버전을 하나 더** 만들 때 쓰는 최대 조합. `presets.json` `micro_variation_presets`와 같은 값이다.

```bash
# 배속 1.02 + 미세 색보정 + 3% 크롭 + (선택) 좌우 반전
ffmpeg -y -i IN.mp4 -vf "\
hflip,\
eq=brightness=0.015:contrast=1.03:saturation=1.04,colorbalance=rs=0.02:bs=-0.02,\
scale=1080:1920:force_original_aspect_ratio=increase,\
scale=ceil(iw*1.03/2)*2:ceil(ih*1.03/2)*2,\
crop=1080:1920,setsar=1,\
setpts=PTS/1.02,fps=30" \
 -af "atempo=1.02" -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_micro_var.mp4
```

- **순서**: 반전 → 색 → 9:16 채우기 → 확대 → 크롭 → 시간. 색을 먼저 바꾸면 크롭 후 남는 영역도 같은 톤이 된다.
- `scale=ceil(iw*1.03/2)*2` : 1.03배 확대값을 **짝수 픽셀**로 올린다. 그냥 `iw*1.03`이면 높이가 홀수(1977)가 되어 `yuv420p` 인코딩이 실패한다.
- `hflip`은 선택. 켜면 **화면 안 글자·로고·유니폼 등번호까지 뒤집힌다** → 자막·워터마크는 반전 뒤에 얹는다.
- 크롭 1.03은 안전영역을 3% 잃는다. 자막이 가장자리에 있으면 크롭을 1.0으로 두고 색·배속만 쓴다.
- **검증**: 1920x1080 6.00초 → **1080x1920 5.88초** 30fps. 같은 시점 프레임 비교에서 원본 대비 평균 색차 4.2(색·크롭 적용됨), 반전본은 좌우반전본과 평균 차이 **0.15**(=hflip 정상, 압축 오차 수준).

## 18. 무음 자동 컷 (말 없는 구간 빼고 이어 붙이기)

### 18-1. 무음 찾기

```bash
ffmpeg -i IN.mp4 -af silencedetect=noise=-38dB:d=0.4 -f null - 2>&1 | grep -E "silence_(start|end)"
```

출력 예(8초 테스트 클립, 소리 3곳 + 무음 3곳):

```
silence_start: 1.2 / silence_end: 3.000021 | silence_duration: 1.800021
silence_start: 4.2 / silence_end: 6.000021 | silence_duration: 1.800021
silence_start: 7.2 / silence_end: 8 | silence_duration: 0.8
```

- `noise`: 기준 레벨. 말소리 녹음은 **-38dB**, 음악·환경음이 있으면 **-30dB**, 조용한 실내는 **-45dB**부터 조절.
- `d`: 이보다 짧은 틈은 무시. **0.4초**가 숨 쉬는 틈을 살리면서 답답하지 않다.
- 무음을 **0.05초 남기고** 자르면 컷이 덜 딱딱하고 말 첫 글자가 잘리지 않는다.

### 18-2. 한 번에 점프컷 (프레임 드롭)

무음 구간을 `select`로 빼고 타임스탬프를 다시 붙인다. 구간이 몇 개든 명령 한 줄이다.

```bash
ffmpeg -y -i IN.mp4 \
 -vf "select='not(between(t,1.25,2.93)+between(t,4.25,5.93)+between(t,7.25,8.01))',setpts=N/FRAME_RATE/TB" \
 -af "aselect='not(between(t,1.25,2.93)+between(t,4.25,5.93)+between(t,7.25,8.01))',asetpts=N/SR/TB" \
 -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_jump.mp4
```

- **검증**: 8.01초 → **3.93초**, 30fps 유지, 오디오 유지.
- 컷 경계가 1프레임(1/30초) 단위라 아주 정확하진 않다. 말 앞뒤를 프레임 단위로 맞추려면 18-3.

### 18-3. 남길 구간만 trim+concat (정확)

```bash
ffmpeg -y -i IN.mp4 -filter_complex "\
[0:v]trim=0:1.25,setpts=PTS-STARTPTS[v0];[0:a]atrim=0:1.25,asetpts=PTS-STARTPTS[a0];\
[0:v]trim=2.93:4.25,setpts=PTS-STARTPTS[v1];[0:a]atrim=2.93:4.25,asetpts=PTS-STARTPTS[a1];\
[0:v]trim=5.93:7.25,setpts=PTS-STARTPTS[v2];[0:a]atrim=5.93:7.25,asetpts=PTS-STARTPTS[a2];\
[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k jumpcut2.mp4
```

- 구간마다 `trim`(영상)·`atrim`(소리)을 만들고 `concat=n=구간수:v=1:a=1`. **`setpts`/`asetpts`의 `PTS-STARTPTS`를 빼면 앞 구간의 시간이 남아 검은 구간이 생긴다.**
- **검증**: 8.01초 → **3.93초**, 영상·소리 모두 이어짐.
- 구간이 10개를 넘으면 스크립트로 필터 문자열을 만들어 `-filter_complex_script`로 넘긴다(15번 참고).

## 19. 효과음(SFX) — 합성해서 원하는 지점에 얹기

외부 음원 없이 `lavfi`로 만든다. 아래 4개는 `presets.json` `audio_mix.sfx`와 같은 식이다.

```bash
# 팝 (짧은 하강 블립)
ffmpeg -y -f lavfi -i "aevalsrc='0.6*sin(2*PI*(880-3600*t)*t)*exp(-28*t)':d=0.15:s=48000" -c:a pcm_s16le sfx_pop.wav
# 띠링 (E6+B6, 긴 여운)
ffmpeg -y -f lavfi -i "aevalsrc='0.45*(sin(2*PI*1318.5*t)+0.5*sin(2*PI*1975.5*t))*exp(-4.5*t)':d=0.8:s=48000" -c:a pcm_s16le sfx_ding.wav
# 스우시 (핑크 노이즈 + 하이패스 + 페이드)
ffmpeg -y -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.5" -af "highpass=f=500,afade=t=in:st=0:d=0.08,afade=t=out:st=0.15:d=0.3" -c:a pcm_s16le sfx_whoosh.wav
# 타격 (저음 하강 + 배음)
ffmpeg -y -f lavfi -i "aevalsrc='0.8*sin(2*PI*(150-400*t)*t)*exp(-16*t)':d=0.25:s=48000" -c:a pcm_s16le sfx_punch.wav
```

**원하는 시점에 섞기** — `adelay=밀리초|밀리초`(스테레오는 두 번) → `amix`.

```bash
ffmpeg -y -i IN.mp4 -i sfx_ding.wav -filter_complex "\
[1:a]volume=0.9,adelay=2000|2000[fx];\
[0:a][fx]amix=inputs=2:duration=first:dropout_transition=0[a]" \
 -map 0:v -map "[a]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_sfx.mp4
```

- `duration=first`를 빼면 효과음이 긴 경우 영상보다 소리가 길어진다. `dropout_transition=0`은 한쪽이 끝났을 때 볼륨이 흔들리지 않게 한다.
- 여러 지점에 넣으려면 효과음을 `-i`로 여러 번 주고 각각 `adelay` 후 `amix=inputs=N`.
- `amix`는 기본적으로 입력 수로 볼륨을 나눈다(2개면 각 0.5). 소리가 작아지면 `normalize=0`을 붙이거나 `volume`을 올린다.
- **검증**: 8초 클립의 무음 구간(2.0초)에 띠링을 얹어 RMS **0.0000 → 0.0533**로 올라감(다른 구간은 그대로).

## 20. 페이드 인/아웃 + BGM 덕킹

화면과 소리를 같은 길이로 페이드하고, BGM은 말소리에 맞춰 눌러 준다.

```bash
ffmpeg -y -i IN.mp4 -stream_loop -1 -i BGM.m4a -filter_complex "\
[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5[v];\
[0:a]aresample=48000,asplit=2[a0][asc];\
[1:a]volume=0.3,atrim=0:6[bg];\
[bg][asc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350[bd];\
[a0][bd]amix=inputs=2:duration=first:dropout_transition=0,afade=t=in:st=0:d=0.5,afade=t=out:st=5.5:d=0.5,loudnorm=I=-14:TP=-1.5:LRA=11[am]" \
 -map "[v]" -map "[am]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_fade_bgm.mp4
```

- **`asplit=2`로 원음을 두 갈래로 나눈다.** 같은 이름([a0])을 `sidechaincompress`와 `amix`에서 두 번 쓰면 FFmpeg가 조용히 원본 입력을 한쪽에 물려 버린다(14번 설명 참고).
- **`afade`는 `amix` 뒤에** 건다. 앞에 걸면 BGM은 페이드되지 않아 시작·끝에 소리만 남는다(실제로 이 순서로 실패했다).
- `fade=t=out:st=` 값 = 영상 길이 − 페이드 길이. 6초 영상에 0.5초 페이드 → `st=5.5`.
- 페이드 길이는 `presets.json` `audio_mix.fades_sec`(0 / 0.3 / 0.5 / 1.0) 중에서 고른다.
- **검증**: 첫 프레임 평균 밝기 **0,0,0**(완전 검정) → 2.9초 지점 124/130/125. 오디오 RMS 0~0.1초 **0.0277** → 0.45~0.55초 **0.2237** → 마지막 0.15초 **0.0446**. 통합 음량 **-14.0 LUFS**.

## 21. 자간 · 행간 (ASS 자막)

```bash
python3 scripts/make_ass.py captions.json -o build/subs.ass --preset pop-bounce --letter-spacing 3 --line-height 1.35
ffmpeg -y -i IN_V.mp4 -vf "subtitles=build/subs.ass:fontsdir=/usr/share/fonts/pickle-hwp" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a copy out_ls.mp4
```

- **자간**: ASS Style의 `Spacing` 필드에 들어간다(프리셋 `fsp` + `--letter-spacing`). 음수도 된다(-4~+12).
- **행간**: ASS에는 행간 속성이 없다. 그래서 여러 줄 큐를 **줄마다 별도 이벤트로 쪼개** `\an5\pos(540,y)`로 직접 배치한다. `gap = fontsize × line-height`(92px × 1.35 = 124px).
- 한 줄짜리 큐와 `typewriter`/`count`처럼 한 이벤트 안에서 움직이는 모션은 기본 행간을 그대로 쓴다(움직임이 깨지지 않게).
- **검증**: 2줄 자막이 y=1338·1462(간격 124px)로 갈라짐. 렌더 프레임에서 기본본과 평균 차이 3.8, 두 줄 간격이 벌어지고 자간이 늘어난 것을 눈으로 확인.

## 22. 스피드 램프 (한 클립 안에서 속도 변화) ⭐ 2026-11 추가

한 클립 안에서 서서히 빨라지거나 느려진다. **소리까지 같이 처리해야 하므로 구간 분할**이 기본이다(구간마다 `setpts` + `atempo`, 마지막에 `concat`).
`presets.json` `speed_ramp`의 `modes`와 같은 곡선을 쓴다.

| 모드 | 곡선 (u = 구간 진행도 0~1) | 쓰는 곳 |
|---|---|---|
| `up` 서서히 빠르게 | `s(u) = s0·(1-k+2k·u)` | 도입부를 천천히 → 후반 몰아치기 |
| `down` 서서히 느리게 | `s(u) = s0·(1+k-2k·u)` | 후반 감속 엔딩 |
| `highlight` 하이라이트 감속 | `s(u) = s0·(1-k+2k·\|2u-1\|)` | 빠→느→빠 (핵심 대사 앞에서 늘어짐) |
| `jump` 점프 가속 | `s(u) = s0·(1+k-2k·\|2u-1\|)` | 느→빠→느 (중간 강조) |

- `s0` = 기본 배속(보통 1.0), `k` = 강도(0~0.5 권장, 0.5면 0.5x~1.5x).
- 프레임 경계(30fps면 1/30초)에 맞춰 자르면 길이 오차가 줄어든다.

```bash
# 6초 클립 · 8구간 · k=0.5 · up (0.56x → 1.44x) — 프레임 경계 정렬
ffmpeg -y -i IN.mp4 -filter_complex "\
[0:v]trim=start=0.0000:end=0.7333,setpts=(PTS-STARTPTS)/0.5625,fps=30[v0];\
[0:a]atrim=start=0.0000:end=0.7333,asetpts=PTS-STARTPTS,atempo=0.5625[a0];\
[0:v]trim=start=0.7333:end=1.4667,setpts=(PTS-STARTPTS)/0.6875,fps=30[v1];\
[0:a]atrim=start=0.7333:end=1.4667,asetpts=PTS-STARTPTS,atempo=0.6875[a1];\
[0:v]trim=start=1.4667:end=2.2000,setpts=(PTS-STARTPTS)/0.8125,fps=30[v2];\
[0:a]atrim=start=1.4667:end=2.2000,asetpts=PTS-STARTPTS,atempo=0.8125[a2];\
[0:v]trim=start=2.2000:end=2.9333,setpts=(PTS-STARTPTS)/0.9375,fps=30[v3];\
[0:a]atrim=start=2.2000:end=2.9333,asetpts=PTS-STARTPTS,atempo=0.9375[a3];\
[0:v]trim=start=2.9333:end=3.6667,setpts=(PTS-STARTPTS)/1.0625,fps=30[v4];\
[0:a]atrim=start=2.9333:end=3.6667,asetpts=PTS-STARTPTS,atempo=1.0625[a4];\
[0:v]trim=start=3.6667:end=4.4000,setpts=(PTS-STARTPTS)/1.1875,fps=30[v5];\
[0:a]atrim=start=3.6667:end=4.4000,asetpts=PTS-STARTPTS,atempo=1.1875[a5];\
[0:v]trim=start=4.4000:end=5.1333,setpts=(PTS-STARTPTS)/1.3125,fps=30[v6];\
[0:a]atrim=start=4.4000:end=5.1333,asetpts=PTS-STARTPTS,atempo=1.3125[a6];\
[0:v]trim=start=5.1333:end=6.0000,setpts=(PTS-STARTPTS)/1.4375,fps=30[v7];\
[0:a]atrim=start=5.1333:end=6.0000,asetpts=PTS-STARTPTS,atempo=1.4375[a7];\
[v0][a0][v1][a1][v2][a2][v3][a3][v4][a4][v5][a5][v6][a6][v7][a7]concat=n=8:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 out_ramp.mp4
```

- **검증**: 6.00초 입력 · 이론 **6.525초** → **실제 6.61초**(+1.3%, 구간 경계에서 프레임이 조금씩 붙는다). 구간마다 오디오 피크는 **440.0Hz 그대로**(atempo). 경계를 프레임(1/30초)에 맞추면 오차가 0.1초 안쪽으로 줄어든다.
- `atempo`는 0.5 미만을 못 받는다. 더 느리게 시작하려면 `setpts` 배율을 낮추지 말고 기본 배속을 올려 두고(k 범위 안에서) 맞춘다.
- 구간이 너무 많으면 경계마다 1프레임씩 늘어난다. **6~10구간**이면 눈에 안 띈다(8구간 +0.1초).

### 22-1. 표현식 타임매핑 (영상만, 경계 없이 매끄럽게)

소리가 없는 클립(또는 BGM만 얹는 클립)은 `setpts` 식 한 줄로 진짜 곡선을 그릴 수 있다. 속도가 `s(t)=s0·(1+a·t)`로 변할 때 출력 시간은 `t_out = ln(1+a·t)/(s0·a)`.

```bash
# 6초 동안 0.5625x → 1.4375x 로 선형 가속 (a = 0.259259)
ffmpeg -y -i SILENT.mp4 -vf "setpts=(1/(0.5625*0.259259))*log(1+0.259259*T)/TB,fps=30" \
  -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p out_ramp_expr.mp4
```

- **검증**: 이론 6.434초 → **실제 6.43초**(구간 분할과 달리 오차 없음).
- **오디오에는 쓸 수 없다** — `atempo`가 시간에 따라 변하는 값을 받지 못한다. 소리가 있으면 22번 구간 분할을 쓴다.

## 23. 피치 (음정 유지 / 속도 연동 / 반음 조절) ⭐ 2026-11 추가

세 가지를 구분해서 쓴다. `presets.json` `pitch_presets`와 같다.

```bash
# ① 음정 유지(기본) — 1.5배속인데 목소리는 그대로
ffmpeg -y -i IN.mp4 -vf "setpts=PTS/1.5,fps=30" -af "atempo=1.5" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k out_pitchlock.mp4

# ② 속도 연동 변조(칩멍크/저음) — 빨라지면 음도 올라간다
ffmpeg -y -i IN.mp4 -vf "setpts=PTS/1.5,fps=30" -af "asetrate=48000*1.5,aresample=48000" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k out_pitchup.mp4

# ③ 반음 단위 조절 — 길이는 그대로, 음만 +2반음
ffmpeg -y -i IN.mp4 -af "asetrate=48000*1.122462,aresample=48000,atempo=0.891" \
  -c:v copy -c:a aac -b:a 192k out_semi2.mp4

# ③-2 -3반음 (r = 2^(-3/12) = 0.840896)
ffmpeg -y -i IN.mp4 -af "asetrate=48000*0.840896,aresample=48000,atempo=1.189207" \
  -c:v copy -c:a aac -b:a 192k out_semi_m3.mp4
```

- `asetrate`는 **재생 속도를 바꿔 음을 올리는** 필터다. 반음 r배는 `r = 2^(반음/12)`.
- ③처럼 **`asetrate` + `atempo(1/r)`** 를 짝지으면 음만 옮기고 길이는 유지된다. `atempo`가 받는 범위(0.5~2.0) 안이면 한 번에 된다. -12~+12반음은 `r=0.5~2.0`, `1/r=2.0~0.5`라 모두 범위 안.
- ②는 영상 `setpts`와 반드시 같은 배율을 써야 입모양과 소리가 맞는다.
- **검증**: ① 6.00초 → **4.00초, 피크 440.3Hz**(원음 440). ② 4.00초, **660.3Hz**. ③ **6.00초 유지, 494.2Hz**(+2반음 기대 493.9). ③-2 **6.00초, 370.4Hz**(-3반음 기대 369.6).

## 24. 목소리 노이즈 제거 (험 · 히스 · 치찰음) ⭐ 2026-11 추가

`presets.json` `audio_cleanup.denoise`와 같은 순서다: **저역 차단 → 60Hz 노치 → 스펙트럼 노이즈 제거 → (선택) 치찰음 완화**.

```bash
ffmpeg -y -i IN.mp4 -af "highpass=f=85,equalizer=f=60:width_type=q:w=6:g=-30,afftdn=nf=-25" \
  -c:v copy -c:a aac -b:a 192k -ar 48000 out_clean.mp4

# 치찰음(6~8kHz)까지 조금 눌러야 하면 뒤에 한 개 더
#   ... ,equalizer=f=7000:width_type=q:w=1:g=-4
```

- `highpass=f=85`만으로는 60Hz가 **-7dB**밖에 안 줄어든다(2차 필터). 전원 험은 `equalizer` 노치가 확실하다.
- `afftdn=nf=-25`는 **잡음 바닥을 학습해** 지속성 히스를 줄인다. 목소리 대역은 거의 건드리지 않는다.
- **검증**(440Hz 목소리 + 60Hz 험 0.18 + 히스 0.05): 60Hz **0.1799 → 0.00062**(-49dB, 노치 포함) / `highpass`만이면 0.0801(-7dB). 히스(3.5kHz) **0.00009 → 0.00002**. 440Hz는 **0.3498 → 0.3466**(변화 없음).
- 노치 주파수는 **한국 60Hz, 일본·일부 지역 50Hz**. 사용자 환경이 50Hz면 `f=50`으로.

## 25. 음량 정리 (오토 레벨링 + 정규화) ⭐ 2026-11 추가

작은 소리와 큰 소리의 편차를 줄이고(-14 LUFS) 클리핑을 막는다.

```bash
# 편차 줄이기 → 목표 음량 → 리미터
ffmpeg -y -i IN.mp4 -af "acompressor=threshold=-30dB:ratio=8:attack=5:release=200:makeup=12,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11" \
  -c:v copy -c:a aac -b:a 192k -ar 48000 out_level.mp4
```

- **`loudnorm`은 편차를 줄이지 않는다.** 전체 음량만 -14 LUFS 로 맞출 뿐, 조용한 구간과 큰 구간의 비율은 그대로다(측정: 27.5배 → **27.5배**). 편차를 줄이는 건 `acompressor` + `makeup`이다(**27.5배 → 2.4배**).
- `dynaudnorm`도 시도했지만 이 소스에서는 **26.7배**로 거의 그대로였다(프레임 단위 피크 정규화라 지속음에는 약하다). 목소리 편차에는 `acompressor`를 쓴다.
- `makeup`을 올리면 작은 소리가 같이 커진다. 12dB에서 큰 소리가 0.39 → 0.50 정도라 `alimiter`를 뒤에 둔다.
- **검증**: 조용한 구간 RMS **0.0141 → 0.1205**, 큰 구간 **0.3888 → 0.2837**, 비율 **27.5배 → 2.4배**. `loudnorm` 뒤 **`I: -14.0 LUFS`**(위 명령 그대로 실행한 값).

## 26. 통합 오디오 정리 (노이즈 제거 + 레벨링 + BGM 덕킹) ⭐ 2026-11 추가

한 번에 돌리는 최종 오디오 체인. 순서를 바꾸면 결과가 달라진다:
**목소리 필터 → 레벨링 → (asplit) 덕킹 → 믹스 → loudnorm → 리미터**.

```bash
ffmpeg -y -i IN.mp4 -stream_loop -1 -i BGM.m4a -filter_complex "\
[0:a]highpass=f=85,equalizer=f=60:width_type=q:w=6:g=-30,afftdn=nf=-25,\
acompressor=threshold=-30dB:ratio=8:attack=5:release=200:makeup=12,asplit=2[voice][sc];\
[1:a]volume=0.28,atrim=0:6[bgm];\
[bgm][sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350[duck];\
[voice][duck]amix=inputs=2:duration=first:normalize=0,\
loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.95[out]" \
 -map 0:v -map "[out]" -c:v copy -c:a aac -b:a 192k -ar 48000 out_audio_all.mp4
```

- **`asplit=2`가 핵심**이다(14번 항목). 빠지면 필터를 거치지 않은 원음이 믹스에 섞여 험이 되살아난다.
- `amix`에 `normalize=0`을 준다. 기본값(1)은 입력 수로 나눠 목소리가 절반으로 작아진다.
- **검증**(440Hz 목소리 + 60Hz 험 0.18 + 히스, 1kHz BGM): 60Hz **0.1799 → 0.00059**, 목소리 440Hz **0.3234** 유지(덕킹 켠 상태), BGM(1kHz) **0.0106 → 0.0014**(-17.6dB), 통합 음량 **-13.5 LUFS**.
- 미리보기와 같은 결과를 웹앱에서도 얻는다 — 웹앱의 `audio_fx`(노이즈 제거 강도·레벨링 강도·더킹 감쇠)를 작업 JSON으로 받아 이 체인의 값으로 옮겨 적는다.

---

## 검증 환경 요약

| 항목 | 값 |
|---|---|
| FFmpeg | n9.0.2-17-g2a571b6068 (2026-09-30), `--enable-libx264 --enable-libass --enable-libfreetype` |
| 입력 샘플 | 1280x720@30 6s / 1280x720@30 5s / 1920x1080@30 4s (lavfi 생성) + 640x360@30 8s 무음 3곳 클립(16~20번 검증용) |
| 오디오 검증 샘플(2026-11 추가) | `aevalsrc` 합성: 440Hz 톤 + 60Hz 험 + 화이트노이즈 5s, 조용(0.02)→큰소리(0.55) 3s, 말하는 구간이 끊긴 목소리 6s, 1kHz BGM 6s |
| 한국어 폰트 | Noto Sans CJK KR (Regular) |
| 확인 방법 | `ffprobe`/`ffmpeg -i` 메타데이터 + 추출 프레임 육안 확인 + 오디오 RMS/주파수(FFT)·`ebur128` 측정 |
| 미검증 | Windows·macOS 경로/폰트 이스케이프, Remotion 렌더, 유튜브 실제 업로드, 50Hz 전원 환경 |
