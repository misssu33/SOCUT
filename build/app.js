/* ============================================================
   쇼츠 에디터 — 단일 파일 정적 웹앱
   서버 없이 브라우저 안에서만 동작합니다.
   ============================================================ */
'use strict';
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Nanum Gothic",system-ui,-apple-system,sans-serif';
  const FONTS = {
    sans: FONT,
    title: '"Black Han Sans","Gmarket Sans","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif',
    round: '"Cafe24 Ssurround","BMJUA","Nanum Pen Script","Noto Sans KR","Apple SD Gothic Neo",sans-serif',
    serif: '"Nanum Myeongjo","Noto Serif KR","Batang","AppleMyungjo",serif'
  };
  const DEMO_DURATION = 15;
  // 한국어 자막 모션 라이브러리 (build.py가 index.html에 인라인한다)
  const KM = (typeof window !== 'undefined' && window.KoreanMotion) || null;
  // MP4 작업 파일에 적을 폰트 이름 (ASS는 CSS 글꼴 스택을 모르므로 대표 패밀리만)
  const JOB_FONT = { sans: 'Noto Sans CJK KR', title: 'Black Han Sans', round: 'Cafe24 Ssurround', serif: 'Nanum Myeongjo' };

  /* ---------------- state ---------------- */
  const S = {
    aspect: '9:16',
    quality: '1080',
    filter: { b: 100, c: 100, s: 100, h: 0 },
    preset: '기본',
    flip: false,
    speed: 1,
    zoom: 100,
    offX: 0,
    offY: 0,
    blurBg: true,
    safe: false,
    trimStart: 0,
    trimEnd: DEMO_DURATION,
    font: 'sans',
    ls: 0,
    lh: 1.45,
    audio: { vol: 100, fadeIn: 0, fadeOut: 0 },
    bgm: { on: false, vol: 30, name: '' },
    sfx: { id: 'none', at: 'start', vol: 70 },
    // 한 클립 안에서 속도를 점진적으로 바꾼다(시간 적분으로 미리보기·내보내기를 맞춘다)
    speedRamp: { mode: 'none', strength: 45, span: 100 },
    // 음정 유지 ON/OFF + 반음 단위 피치 조절
    pitch: { lock: true, semi: 0 },
    denoise: { on: false, strength: 55 },
    level: { on: false, strength: 55 },
    duck: { on: false, depth: 32 },
    autocut: { on: false, thr: -38, minSil: 0.4, analyzed: false, windows: [], hop: 0.02 },
    // 컷(씬) 분할 — 분할점은 결과(출력) 영상 시간 기준. 컷마다 댓글 카드·코너 라벨을 따로 둔다.
    cut: { pts: [], every: 0, sens: 55, step: 0.3, found: [] },
    cutOv: [],     // 컷이 2개 이상일 때만 쓰는 컷별 오버레이(0번은 S.ov 값의 복사본)
    cutSel: 0,     // 오버레이 탭에서 편집 중인 컷
    ov: {
      title: { on: true, badge: 'HOT', badgeColor: '#ff2d55', title: '이 장면 하나로', hl: '난리 났다', hlColor: '#ffe14d' },
      comment: { on: true, user: 'daily_kpop', hearts: '1.2만', text: '소름 돋았어요 이건 진짜', hl: '소름' },
      corner: { on: true, left: '연예뉴스 | 2026.11.24', right: '@my_shorts' },
      sub: { on: true, style: 'chip-wipe', theme: 'reels-dark', text: '여기서 반전 있습니다', color: '#ffffff' }
    }
  };

  const PRESETS = {
    '기본': { b: 100, c: 100, s: 100, h: 0 },
    '선명하게': { b: 106, c: 118, s: 124, h: 0 },
    '시네마': { b: 94, c: 114, s: 90, h: -6 },
    '쿨톤': { b: 103, c: 104, s: 106, h: -14 },
    '웜톤': { b: 106, c: 103, s: 112, h: 14 }
  };

  const RAMP_NAME = {
    none: '램프 없음', up: '서서히 빠르게', down: '서서히 느리게',
    highlight: '하이라이트 감속', jump: '점프 가속'
  };

  /* ---------------- dom ---------------- */
  const preview = $('#preview');
  const pctx = preview.getContext('2d');
  const btnPlay = $('#btnPlay');
  const timebar = $('#timebar');
  const timeFill = $('#timeFill');
  const timeLabel = $('#timeLabel');
  const speedChip = $('#speedChip');
  const speedFineEl = $('#speedFine');
  const outSpeedFine = $('#outSpeedFine');
  const speedOutHint = $('#speedOutHint');
  const srcInfo = $('#srcInfo');
  const trimStartEl = $('#trimStart');
  const trimEndEl = $('#trimEnd');
  const trimStartLabel = $('#trimStartLabel');
  const trimEndLabel = $('#trimEndLabel');
  const trimDurLabel = $('#trimDurLabel');
  const outTrimStart = $('#outTrimStart');
  const outTrimEnd = $('#outTrimEnd');
  const recBadge = $('#recBadge');
  const btnExport = $('#btnExport');
  const btnCancelExport = $('#btnCancelExport');
  const progressWrap = $('#progressWrap');
  const progressFill = $('#progressFill');
  const progressText = $('#progressText');
  const capNote = $('#capNote');
  const resultCard = $('#resultCard');
  const resultVideo = $('#resultVideo');
  const dlLink = $('#dlLink');
  const resultMeta = $('#resultMeta');
  const toastEl = $('#toast');
  // 컷(씬) 분할 UI
  const cutListEl = $('#cutList');
  const cutNowEl = $('#cutNow');
  const cutCountTag = $('#cutCountTag');
  const cutOverlayCard = $('#cutOverlayCard');
  const cutChips = $('#cutChips');
  const sceneInfoEl = $('#sceneInfo');
  const btnSceneScan = $('#btnSceneScan');
  const btnSceneApply = $('#btnSceneApply');

  /* ---------------- source ---------------- */
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.loop = false;
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(video);

  const demoCanvas = document.createElement('canvas');
  demoCanvas.width = 1280;
  demoCanvas.height = 720;
  const dctx = demoCanvas.getContext('2d');

  let mode = 'demo';          // 'demo' | 'video'
  let demoAbs = 0;
  let demoPainted = -1;
  let sourceDur = DEMO_DURATION;
  let playing = false;
  // 자막 스타일을 고르면 한 번 자동으로 모션을 보여 준다(멈춘 화면에서는 정지 상태라 차이를 알기 어렵다)
  const SUB_DEMO_LEN = 1.9;
  let subDemoT0 = 0;
  let dirty = true;
  let lastTs = 0;
  let audioGraph = null;
  let objURL = null;
  let pendingName = '';
  let srcFile = null;
  let durProbe = false;
  let durTimer = 0;
  let exp = null;
  let resultURL = null;
  let toastTimer = 0;

  const FILTER_OK = (function () {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.filter = 'brightness(120%)';
      return c.filter !== 'none';
    } catch (e) { return false; }
  })();

  /* ---------------- helpers ---------------- */
  function speedLabel(v) {
    // 0.01 단위 값을 그대로 보여 준다: 1.0x / 1.5x / 1.02x / 0.98x
    const n = Math.round((Number(v) || 0) * 100) / 100;
    return (Math.round(n * 100) % 10 === 0 ? n.toFixed(1) : n.toFixed(2)) + 'x';
  }
  function fmtSec1(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function fmtTime(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  function getPath(path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
  }
  function setPath(path, v) {
    const ks = path.split('.');
    const k = ks.pop();
    const o = ks.reduce((o, k2) => o[k2], S);
    o[k] = v;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2800);
  }
  function setFont(ctx, size, weight) {
    ctx.font = (weight || 700) + ' ' + Math.max(6, size).toFixed(2) + 'px ' + fontFamily();
  }
  function fontFamily() {
    return FONTS[S.font] || FONTS.sans;
  }
  // 자간(px): 1080 기준 값을 캔버스 폭에 맞춰 줄인다
  function lsPx(W) {
    return (S.ls || 0) * (W / 1080);
  }
  function textWidth(ctx, text, W) {
    const sp = lsPx(W);
    if (!sp) return ctx.measureText(text).width;
    const chars = Array.from(String(text));
    let w = 0;
    for (let i = 0; i < chars.length; i++) w += ctx.measureText(chars[i]).width;
    return w + sp * Math.max(0, chars.length - 1);
  }
  // textAlign 을 지키면서 글자 단위로 자간을 적용해 그린다(모든 브라우저 공통)
  function paintText(ctx, text, x, y, W, mode) {
    const sp = lsPx(W);
    const fn = mode === 'stroke' ? 'strokeText' : 'fillText';
    text = String(text);
    if (!sp) { ctx[fn](text, x, y); return; }
    const chars = Array.from(text);
    const ws = chars.map(function (c) { return ctx.measureText(c).width; });
    let total = sp * Math.max(0, chars.length - 1);
    for (let i = 0; i < ws.length; i++) total += ws[i];
    let cx = x;
    if (ctx.textAlign === 'center') cx = x - total / 2;
    else if (ctx.textAlign === 'right') cx = x - total;
    const al = ctx.textAlign;
    ctx.textAlign = 'left';
    for (let i = 0; i < chars.length; i++) {
      ctx[fn](chars[i], cx, y);
      cx += ws[i] + sp;
    }
    ctx.textAlign = al;
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function fitSize(ctx, text, base, maxW, weight, min, W) {
    min = min || base * 0.42;
    let fs = base;
    setFont(ctx, fs, weight);
    let guard = 0;
    while (textWidth(ctx, text, W || 1080) > maxW && fs > min && guard++ < 80) {
      fs *= 0.95;
      setFont(ctx, fs, weight);
    }
    return fs;
  }

  /* ---------------- source info ---------------- */
  function getSource() {
    if (mode === 'video' && video.videoWidth > 0) {
      return { el: video, w: video.videoWidth, h: video.videoHeight };
    }
    if (mode === 'demo') {
      return { el: demoCanvas, w: demoCanvas.width, h: demoCanvas.height };
    }
    return null;
  }
  function srcPos() {
    return mode === 'video' ? (video.currentTime || 0) : demoAbs;
  }

  /* ---------------- 무음 자동 컷 ---------------- */
  let cutRuns = [];          // 무음 구간(소스 시간) — S.autocut.windows 에서 계산

  function computeCuts() {
    const a = S.autocut;
    cutRuns = [];
    if (!a.windows || !a.windows.length) return;
    const hop = a.hop || 0.02;
    let start = -1;
    for (let i = 0; i < a.windows.length; i++) {
      const silent = a.windows[i] < a.thr;
      if (silent && start < 0) start = i;
      const last = i === a.windows.length - 1;
      if (start >= 0 && (!silent || last)) {
        const end = (silent ? i + 1 : i) * hop;
        const s0 = start * hop;
        // 컷 경계가 너무 딱딱하지 않게 양쪽 0.05초는 남긴다
        if (end - s0 >= a.minSil) {
          const cutA = s0 + 0.05;
          const cutB = Math.max(cutA + 0.05, end - 0.05);
          if (cutB - cutA >= 0.1) cutRuns.push([cutA, cutB]);
        }
        start = -1;
      }
    }
  }

  // 실제로 남겨 둘 구간(소스 시간). 자동 컷이 꺼져 있으면 트림 구간 하나.
  function computeSegments(useCut) {
    if (!useCut || !cutRuns.length) return [[S.trimStart, S.trimEnd]];
    const out = [];
    let cur = S.trimStart;
    for (let i = 0; i < cutRuns.length; i++) {
      const a = Math.max(cutRuns[i][0], S.trimStart);
      const b = Math.min(cutRuns[i][1], S.trimEnd);
      if (b <= a) continue;
      if (a > cur) out.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < S.trimEnd) out.push([cur, S.trimEnd]);
    const keep = out.filter(function (s) { return s[1] - s[0] > 0.12; });
    return keep.length ? keep : [[S.trimStart, S.trimEnd]];
  }
  function segments() {
    return computeSegments(S.autocut.on);
  }

  function keptDuration() {
    const segs = segments();
    let d = 0;
    for (let i = 0; i < segs.length; i++) d += segs[i][1] - segs[i][0];
    return d;
  }

  /* ---------------- 스피드 램프: 속도 곡선과 시간 적분 ----------------
     미리보기(캔버스)와 내보내기(MediaRecorder)가 같은 표를 쓰기 때문에
     프레임 위치와 오디오 속도가 어긋나지 않는다.
     표: 구간마다 RAMP_N 조각으로 나눠 출력 시간을 중점 적분한다. */
  const RAMP_N = 240;
  let rampCache = { key: '', segs: [], tables: [], cum: [0], total: 0, flat: true };

  // u(0~1) 지점의 속도 배율. 강도 k 만큼 기준 배속을 오르내린다.
  function rampMul(u) {
    const m = S.speedRamp.mode;
    if (!m || m === 'none') return 1;
    const k = clamp((S.speedRamp.strength || 0) / 100, 0, 0.85);
    if (k < 0.005) return 1;
    const span = clamp((S.speedRamp.span || 100) / 100, 0.2, 1);
    const uu = clamp((u - (1 - span) / 2) / span, 0, 1);
    if (m === 'up') return 1 - k + 2 * k * uu;                        // 서서히 빠르게
    if (m === 'down') return 1 + k - 2 * k * uu;                      // 서서히 느리게
    if (m === 'highlight') return 1 - k + 2 * k * Math.abs(2 * uu - 1); // 빠→느→빠
    if (m === 'jump') return 1 + k - 2 * k * Math.abs(2 * uu - 1);      // 느→빠→느
    return 1;
  }

  // u(0~1) 지점의 실제 재생 배속
  function speedAt(u) {
    return Math.max(0.1, S.speed * rampMul(clamp(u, 0, 1)));
  }

  function rampState() {
    const segs = segments();
    const flat = S.speedRamp.mode === 'none' || rampMul(0) === 1 && rampMul(0.5) === 1 && rampMul(1) === 1;
    const key = [S.speed, S.speedRamp.mode, S.speedRamp.strength, S.speedRamp.span, flat ? 'flat' : 'ramp',
      segs.map(function (s) { return s[0].toFixed(4) + '-' + s[1].toFixed(4); }).join(',')].join('|');
    if (rampCache.key === key) return rampCache;
    const tables = [], cum = [0];
    let total = 0;
    const spd = Math.max(0.05, S.speed);
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][0], b = segs[i][1], d = Math.max(0, b - a);
      const t = new Float64Array(RAMP_N + 1);
      if (flat) {
        for (let j = 0; j <= RAMP_N; j++) t[j] = (j / RAMP_N) * d / spd;
      } else {
        let acc = 0;
        for (let j = 0; j < RAMP_N; j++) {
          acc += (d / RAMP_N) / speedAt((j + 0.5) / RAMP_N);
          t[j + 1] = acc;
        }
      }
      tables.push(t);
      total += t[RAMP_N];
      cum.push(total);
    }
    rampCache = { key: key, segs: segs, tables: tables, cum: cum, total: total, flat: flat };
    return rampCache;
  }

  function totalOut() {
    return rampState().total;
  }

  // 표를 u 위치에서 선형 보간
  function rampAt(table, u) {
    const x = clamp(u, 0, 1) * RAMP_N;
    const i = Math.min(RAMP_N - 1, Math.floor(x));
    const f = x - i;
    return table[i] * (1 - f) + table[i + 1] * f;
  }

  function cutStats() {
    const segs = computeSegments(true);
    let kept = 0;
    for (let i = 0; i < segs.length; i++) kept += segs[i][1] - segs[i][0];
    const span = Math.max(0, S.trimEnd - S.trimStart);
    let count = 0;
    for (let i = 0; i < cutRuns.length; i++) {
      const a = Math.max(cutRuns[i][0], S.trimStart);
      const b = Math.min(cutRuns[i][1], S.trimEnd);
      if (b > a + 0.01) count++;
    }
    return { count: count, removed: Math.max(0, span - kept), kept: kept, span: span };
  }

  // 소스 시간 → 출력 시간 (표 기준)
  function outTimeAt(p) {
    const st = rampState();
    for (let i = 0; i < st.segs.length; i++) {
      const a = st.segs[i][0], b = st.segs[i][1];
      if (p < a) return st.cum[i];
      if (p <= b) {
        const u = clamp((p - a) / Math.max(1e-6, b - a), 0, 1);
        return st.cum[i] + rampAt(st.tables[i], u);
      }
    }
    return st.total;
  }

  function outTime() {
    return outTimeAt(srcPos());
  }

  // 출력 시간 → 소스 시간 (내보내기 녹화·자막 큐가 쓰는 역함수)
  function rampTime(tOut) {
    const st = rampState();
    if (!st.segs.length) return S.trimStart;
    let i = 0;
    while (i < st.segs.length - 1 && tOut >= st.cum[i + 1]) i++;
    const local = clamp(tOut - st.cum[i], 0, st.tables[i][RAMP_N]);
    const tab = st.tables[i];
    let lo = 0, hi = RAMP_N;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (tab[mid] < local) lo = mid; else hi = mid;
    }
    const t0 = tab[lo], t1 = tab[hi];
    const f = t1 > t0 ? (local - t0) / (t1 - t0) : 0;
    const a = st.segs[i][0], b = st.segs[i][1];
    return a + ((lo + f) / RAMP_N) * (b - a);
  }

  // 지금 소스 위치에서의 배속(램프 반영)
  function speedAtSrc(p) {
    const st = rampState();
    for (let i = 0; i < st.segs.length; i++) {
      const a = st.segs[i][0], b = st.segs[i][1];
      if (p >= a && p <= b) return speedAt((p - a) / Math.max(1e-6, b - a));
    }
    return S.speed;
  }

  // 비디오 요소 재생 속도를 램프에 맞춘다
  function applyVideoRate() {
    if (mode !== 'video') return;
    const v = clamp(speedAtSrc(srcPos()), 0.0625, 16);
    try {
      if (Math.abs((video.playbackRate || 1) - v) > 0.008) video.playbackRate = v;
    } catch (e) { /* noop */ }
    applyPitchToVideo();
  }

  // 재생·내보내기 중 무음 구간을 만나면 다음 남길 구간으로 건너뛴다
  function enforceSegments() {
    if (mode !== 'video' || !S.autocut.on || !cutRuns.length) return false;
    const segs = segments();
    if (!segs.length) return false;
    const t = video.currentTime || 0;
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][0], b = segs[i][1];
      if (t >= a - 0.06 && t <= b + 0.02) return false;
      if (t < a) { try { video.currentTime = a; } catch (e) { /* noop */ } return true; }
    }
    try { video.currentTime = segs[0][0]; } catch (e) { /* noop */ }
    return true;
  }

  function fadeAlpha(t) {
    const total = totalOut();
    const fi = S.audio.fadeIn, fo = S.audio.fadeOut;
    let a = 0;
    if (fi > 0 && t < fi) a = Math.max(a, 1 - t / fi);
    if (fo > 0 && total > 0 && t > total - fo) a = Math.max(a, (t - (total - fo)) / fo);
    return clamp(a, 0, 1);
  }

  /* ---------------- 컷(씬) 분할 --------------
     분할점은 '결과(출력) 영상' 시간으로 저장한다. 미리보기·내보내기가 같은
     drawScene(t) 를 쓰기 때문에, t 가 속한 컷만 찾으면 화면과 녹화가 같이 맞는다. */
  const CUT_GAP = 0.25;            // 분할점 사이·양 끝과의 최소 간격(초)
  const SCENE_DEFAULT = '영상을 불러온 뒤 ‘장면 전환 감지’를 누르면 화면이 확 바뀌는 지점을 찾습니다.';
  let cutScanning = false;
  let sceneMsg = SCENE_DEFAULT;
  let sceneCls = '';

  function cutTotal() {
    return Math.max(0.2, totalOut());
  }

  // 정렬·중복 제거된 분할점(양 끝은 제외)
  function cutPoints() {
    const total = cutTotal();
    const out = [];
    const src = Array.isArray(S.cut.pts) ? S.cut.pts : [];
    for (let i = 0; i < src.length; i++) {
      let p = Number(src[i]);
      if (!isFinite(p)) continue;
      p = Math.round(p * 1000) / 1000;
      if (p < CUT_GAP || p > total - CUT_GAP) continue;
      if (out.length && p - out[out.length - 1] < CUT_GAP) continue;
      out.push(p);
    }
    return out;
  }
  function cutCount() {
    return cutPoints().length + 1;
  }

  // 지금 분할점이 정확히 'n초 간격'인지(칩 표시용)
  function matchedEvery() {
    const pts = cutPoints();
    if (!pts.length) return 0;
    const cand = [1, 2, 3, 4, 5];
    for (let c = 0; c < cand.length; c++) {
      const v = cand[c];
      let ok = true;
      for (let i = 0; i < pts.length; i++) {
        if (Math.abs(pts[i] - v * (i + 1)) > 0.03) { ok = false; break; }
      }
      if (ok) return v;
    }
    return 0;
  }

  // 출력 시간 t 가 몇 번째 컷(0부터)에 속하는지
  function cutIndexAt(t) {
    const pts = cutPoints();
    let i = 0;
    while (i < pts.length && t >= pts[i]) i++;
    return i;
  }

  // 컷 i 의 [시작, 끝] (출력 시간)
  function cutRange(i) {
    const pts = cutPoints();
    const total = cutTotal();
    return [i <= 0 ? 0 : pts[i - 1], i >= pts.length ? total : pts[i]];
  }

  function cloneCutOv(o) {
    return {
      comment: Object.assign({}, (o && o.comment) || S.ov.comment),
      corner: Object.assign({}, (o && o.corner) || S.ov.corner)
    };
  }

  // 컷 개수에 맞춰 컷별 오버레이 배열을 맞춘다(새 컷은 직전 컷 설정을 물려받는다)
  function syncCutOverlays() {
    const n = cutCount();
    if (n < 2) { S.cutOv = []; S.cutSel = 0; return; }
    let arr = Array.isArray(S.cutOv) ? S.cutOv.filter(Boolean) : [];
    while (arr.length < n) arr.push(cloneCutOv(arr.length ? arr[arr.length - 1] : null));
    if (arr.length > n) arr = arr.slice(0, n);
    S.cutOv = arr;
    S.cutSel = clamp(S.cutSel | 0, 0, n - 1);
  }

  // 시간 t 에 그릴 댓글 카드·코너 라벨(컷이 1개면 기존 단일 설정 그대로)
  function cutOverlayAt(t) {
    const i = cutIndexAt(t);
    if (S.cutOv.length >= 2 && S.cutOv[i]) {
      return { cut: i, comment: S.cutOv[i].comment, corner: S.cutOv[i].corner };
    }
    return { cut: 0, comment: S.ov.comment, corner: S.ov.corner };
  }

  // 오버레이 탭에서 고친 값을 지금 선택한 컷에 저장한다
  function saveCutOverlay() {
    if (S.cutOv.length < 2) return;
    const i = clamp(S.cutSel | 0, 0, S.cutOv.length - 1);
    if (!S.cutOv[i]) return;
    S.cutOv[i].comment = Object.assign({}, S.ov.comment);
    S.cutOv[i].corner = Object.assign({}, S.ov.corner);
  }

  function addCutPoint(tOut) {
    const total = cutTotal();
    const at = Math.round(clamp(Number(tOut) || 0, 0, total) * 1000) / 1000;
    if (at < CUT_GAP || at > total - CUT_GAP) {
      toast('영상 맨 앞·맨 뒤에는 분할점을 넣을 수 없어요');
      return false;
    }
    const pts = cutPoints();
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i] - at) < CUT_GAP) {
        toast('이미 이 위치에 분할점이 있어요 (' + fmtSec1(pts[i]) + ')');
        return false;
      }
    }
    // 새 분할점이 들어갈 순서 = 나뉘는 컷 번호
    const pos = pts.filter(function (p) { return p < at; }).length;
    pts.splice(pos, 0, at);
    S.cut.pts = pts;
    if (S.cutOv.length >= 2) {
      S.cutOv.splice(pos + 1, 0, cloneCutOv(S.cutOv[pos]));
      if (S.cutSel > pos) S.cutSel++;
    }
    syncCutOverlays();
    renderCutUI();
    dirty = true;
    return true;
  }

  // pts[i] 분할점 삭제 → 컷 i 와 i+1 이 하나로 합쳐진다
  function removeCutPoint(i) {
    const pts = cutPoints();
    if (i < 0 || i >= pts.length) return;
    pts.splice(i, 1);
    S.cut.pts = pts;
    if (S.cutOv.length >= 2) {
      S.cutOv.splice(i + 1, 1);
      if (S.cutSel > i) S.cutSel--;
    }
    syncCutOverlays();
    renderCutUI();
    dirty = true;
  }

  function applyEvenSplit(step) {
    const total = cutTotal();
    const s = Math.max(0.5, Number(step) || 0);
    const pts = [];
    for (let t = s; t < total - CUT_GAP; t += s) pts.push(Math.round(t * 1000) / 1000);
    if (!pts.length) {
      toast('영상이 ' + s + '초보다 짧아 나눌 컷이 없어요');
      return false;
    }
    S.cut.pts = pts;
    S.cut.every = s;
    S.cut.found = [];
    syncCutOverlays();
    renderCutUI();
    dirty = true;
    toast(pts.length + 1 + '컷으로 나눴어요 (' + s + '초 간격)');
    return true;
  }

  function resetCuts(silent) {
    S.cut.pts = [];
    S.cut.every = 0;
    S.cut.found = [];
    S.cutOv = [];
    S.cutSel = 0;
    sceneMsg = SCENE_DEFAULT;
    sceneCls = '';
    renderCutUI();
    dirty = true;
    if (!silent) toast('분할을 모두 지웠어요');
  }

  // 오버레이 탭에서 편집할 컷을 바꾼다(고친 값은 이전 컷에 저장하고 새 컷 값을 불러온다)
  function selectCut(i) {
    const n = cutCount();
    if (n < 2) return;
    saveCutOverlay();
    S.cutSel = clamp(i, 0, n - 1);
    const c = S.cutOv[S.cutSel];
    if (c) {
      S.ov.comment = Object.assign({}, c.comment);
      S.ov.corner = Object.assign({}, c.corner);
    }
    syncUI();
    const r = cutRange(S.cutSel);
    if (!exp) seekTo(rampTime(r[0] + Math.min(0.2, Math.max(0.02, (r[1] - r[0]) * 0.3))));
    renderCutUI();
    dirty = true;
  }

  function copyCutToAll() {
    if (S.cutOv.length < 2) return;
    saveCutOverlay();
    const i = clamp(S.cutSel | 0, 0, S.cutOv.length - 1);
    const src = S.cutOv[i];
    for (let k = 0; k < S.cutOv.length; k++) if (k !== i) S.cutOv[k] = cloneCutOv(src);
    renderCutUI();
    dirty = true;
    toast('컷 ' + (i + 1) + ' 설정을 모든 컷에 복사했어요');
  }

  /* ---- 장면 전환 자동 감지 (작은 캔버스에 프레임을 샘플링해 밝기 변화를 잰다) ---- */
  const SCAN_W = 48, SCAN_H = 27;
  const scanCvs = document.createElement('canvas');
  scanCvs.width = SCAN_W;
  scanCvs.height = SCAN_H;
  const scanCtx = scanCvs.getContext('2d', { willReadFrequently: true });

  // 민감도(%) → 밝기 평균 차이 임계값(0~1). 높을수록 작은 변화도 잡는다.
  function sceneThreshold(sens) {
    const s = clamp(Number(sens) || 55, 1, 100) / 100;
    return 0.012 + Math.pow(1 - s, 1.5) * 0.30;
  }

  function grabGray() {
    scanCtx.drawImage(mode === 'video' ? video : demoCanvas, 0, 0, SCAN_W, SCAN_H);
    const d = scanCtx.getImageData(0, 0, SCAN_W, SCAN_H).data;
    const g = new Float32Array(SCAN_W * SCAN_H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    return g;
  }
  function grayDiff(a, b) {
    if (!a || !b || !a.length || a.length !== b.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / (a.length * 255);
  }

  function setSceneInfo(msg, cls) {
    sceneMsg = msg;
    sceneCls = cls || '';
    if (!sceneInfoEl) return;
    sceneInfoEl.textContent = msg;
    sceneInfoEl.className = 'hint' + (cls ? ' ' + cls : '');
  }

  async function scanScenes() {
    if (cutScanning) return [];
    if (exp) { toast('내보내기 중에는 장면을 감지할 수 없어요'); return []; }
    if (mode === 'video' && !video.videoWidth) { toast('영상을 아직 불러오는 중이에요. 잠시 후 다시 시도해 주세요'); return []; }
    const step = clamp(Number(S.cut.step) || 0.3, 0.15, 2);
    const thr = sceneThreshold(S.cut.sens);
    const a = S.trimStart, b = S.trimEnd;
    if (b - a < step * 2) { toast('구간이 너무 짧아 장면 전환을 찾기 어려워요'); return []; }

    const wasPlaying = playing;
    const backSrc = srcPos();
    if (wasPlaying) { playing = false; try { video.pause(); } catch (e) { /* noop */ } updatePlayBtn(); }
    cutScanning = true;
    if (btnSceneScan) btnSceneScan.disabled = true;
    const found = [];
    let readFail = false;
    const total = Math.max(1, Math.ceil((b - a) / step));
    let prev = null, lastHit = -1e9, n = 0;
    setSceneInfo('장면을 살피는 중… 0%');
    try {
      for (let t = a; t <= b - 0.02; t += step) {
        if (mode === 'video') await seekVideo(t);
        else { paintDemo(t); demoPainted = t; }
        let g = null;
        try { g = grabGray(); } catch (e) { readFail = true; break; }
        if (prev) {
          const d = grayDiff(prev, g);
          if (d >= thr && (t - lastHit) >= Math.max(0.5, step * 1.6)) {
            // 두 샘플 사이를 이분 탐색해 전환 지점을 좁힌다(간격/2 의 1/16 수준까지)
            let lo = t - step, hi = t;
            for (let k = 0; k < 4; k++) {
              const mid = (lo + hi) / 2;
              if (mode === 'video') await seekVideo(mid);
              else { paintDemo(mid); demoPainted = mid; }
              let mg = null;
              try { mg = grabGray(); } catch (e2) { mg = null; }
              if (!mg) break;
              if (grayDiff(prev, mg) >= thr) hi = mid; else lo = mid;
            }
            const at = outTimeAt(hi);
            if (at > CUT_GAP && at < cutTotal() - CUT_GAP) {
              found.push(Math.round(at * 1000) / 1000);
              lastHit = t;
            }
          }
        }
        prev = g;
        n++;
        if (n % 6 === 0) {
          setSceneInfo('장면을 살피는 중… ' + Math.round((n / total) * 100) + '%');
          await new Promise(function (r) { setTimeout(r, 0); });
        }
      }
    } catch (e) {
      readFail = true;
    } finally {
      cutScanning = false;
      if (btnSceneScan) btnSceneScan.disabled = false;
      if (mode === 'video') { try { await seekVideo(backSrc); } catch (e) { /* noop */ } }
      else demoPainted = -1;   // 다음 프레임에 원래 위치를 다시 그린다
      dirty = true;
    }

    if (readFail) {
      S.cut.found = [];
      setSceneInfo('이 영상은 브라우저가 화면 픽셀을 읽지 못해 장면 전환을 감지할 수 없어요. 같은 기기에서 고른 영상 파일을 다시 불러오거나, ‘일정 간격 자동 분할’을 써 주세요.', 'warn');
      toast('화면 픽셀을 읽을 수 없어 장면 전환을 감지하지 못했어요');
      renderCutUI();
      return [];
    }
    S.cut.found = found;
    if (found.length) {
      setSceneInfo('장면 전환 ' + found.length + '곳을 찾았어요. ‘감지한 지점 적용’을 누르면 컷으로 나눕니다.', 'ok');
      toast('장면 전환 ' + found.length + '곳을 찾았어요');
    } else {
      setSceneInfo('장면 전환이 뚜렷하게 잡히지 않았어요. 민감도를 올리거나 샘플 간격을 좁혀 다시 시도해 보세요.', 'warn');
      toast('장면 전환이 뚜렷하지 않아요. 민감도를 올려 다시 해 보세요');
    }
    renderCutUI();
    return found;
  }

  function applyFoundCuts() {
    const found = Array.isArray(S.cut.found) ? S.cut.found : [];
    if (!found.length) { toast('먼저 장면 전환을 감지해 주세요'); return false; }
    const pts = cutPoints().concat(found).sort(function (x, y) { return x - y; });
    S.cut.pts = pts;
    S.cut.found = [];
    S.cut.every = 0;
    syncCutOverlays();
    renderCutUI();
    dirty = true;
    setSceneInfo('감지한 지점을 적용했어요 · 지금 ' + cutCount() + '컷입니다.', 'ok');
    toast(cutCount() + '컷으로 나눴어요');
    return true;
  }

  /* ---- 컷 UI ---- */
  function updateCutNow() {
    if (!cutNowEl) return;
    const n = cutCount();
    const i = cutIndexAt(outTime());
    cutNowEl.textContent = '현재 재생 위치: 컷 ' + (i + 1) + ' / ' + n
      + (n > 1 ? ' · 결과 영상 ' + fmtSec1(cutRange(i)[0]) + '~' + fmtSec1(cutRange(i)[1]) + '초' : '');
  }

  function renderCutUI() {
    syncCutOverlays();
    const n = cutCount();
    if (cutCountTag) cutCountTag.textContent = n + '컷';
    updateCutNow();

    if (cutListEl) {
      const sel = n > 1 ? S.cutSel : -1;
      let html = '';
      for (let i = 0; i < n; i++) {
        const r = cutRange(i);
        html += '<div class="cut-row' + (i === sel ? ' on' : '') + '">'
          + '<span class="cut-no">컷 ' + (i + 1) + '</span>'
          + '<span class="cut-time">' + fmtSec1(r[0]) + ' – ' + fmtSec1(r[1]) + '</span>'
          + '<span class="cut-len">' + (r[1] - r[0]).toFixed(1) + '초</span>'
          + (i > 0
            ? '<button type="button" class="cut-del" data-del="' + i + '" aria-label="컷 ' + (i + 1) + ' 시작 분할점 삭제">✕</button>'
            : '<span class="cut-del pad"></span>')
          + '</div>';
      }
      cutListEl.innerHTML = html;
      $$('#cutList .cut-del[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          removeCutPoint(Number(b.dataset.del) - 1);
          toast('분할점을 지웠어요 · ' + cutCount() + '컷');
        });
      });
    }

    $$('#segCutEvery .chip').forEach(function (b) {
      b.classList.toggle('on', Math.abs(matchedEvery() - Number(b.dataset.v)) < 1e-6);
    });

    if (cutOverlayCard) cutOverlayCard.hidden = n < 2;
    if (cutChips) {
      let h = '';
      for (let i = 0; i < n; i++) {
        h += '<button type="button" class="chip' + (i === S.cutSel ? ' on' : '') + '" data-cut="' + i + '">'
          + '컷 ' + (i + 1) + ' · ' + fmtSec1(cutRange(i)[0]) + '</button>';
      }
      cutChips.innerHTML = h;
      $$('#cutChips .chip').forEach(function (b) {
        b.addEventListener('click', function () { selectCut(Number(b.dataset.cut)); });
      });
    }
    $$('[data-cut-target]').forEach(function (el) {
      el.hidden = n < 2;
      el.textContent = '컷 ' + (S.cutSel + 1);
    });
    if (btnSceneApply) btnSceneApply.hidden = !(S.cut.found && S.cut.found.length);
    if (!S.cut.found || !S.cut.found.length) {
      if (sceneInfoEl && !cutScanning) {
        sceneInfoEl.textContent = sceneMsg;
        sceneInfoEl.className = 'hint' + (sceneCls ? ' ' + sceneCls : '');
      }
    }
  }

  /* ---------------- demo source painter ---------------- */
  function paintDemo(t) {
    const W = demoCanvas.width, H = demoCanvas.height;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, W, H);

    const hue = 214 + Math.sin(t * 0.25) * 16;
    const g = dctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'hsl(' + hue + ',58%,15%)');
    g.addColorStop(0.52, 'hsl(' + (hue + 16) + ',64%,31%)');
    g.addColorStop(1, 'hsl(' + (hue - 24) + ',58%,10%)');
    dctx.fillStyle = g;
    dctx.fillRect(0, 0, W, H);

    // sun glow
    const sx = W * 0.5 + Math.sin(t * 0.42) * W * 0.26;
    const sy = H * 0.42 + Math.cos(t * 0.31) * H * 0.05;
    const rg = dctx.createRadialGradient(sx, sy, 8, sx, sy, W * 0.34);
    rg.addColorStop(0, 'rgba(255,222,164,.92)');
    rg.addColorStop(0.3, 'rgba(255,142,120,.46)');
    rg.addColorStop(1, 'rgba(255,90,140,0)');
    dctx.fillStyle = rg;
    dctx.beginPath(); dctx.arc(sx, sy, W * 0.34, 0, Math.PI * 2); dctx.fill();
    dctx.fillStyle = '#ffeccb';
    dctx.beginPath(); dctx.arc(sx, sy, W * 0.075, 0, Math.PI * 2); dctx.fill();

    // mountain layers
    for (let layer = 0; layer < 2; layer++) {
      const base = H * (0.66 + layer * 0.13);
      const off = (t * (14 + layer * 22)) % (W / 3);
      dctx.fillStyle = layer ? 'rgba(9,14,26,.94)' : 'rgba(22,33,54,.72)';
      dctx.beginPath();
      dctx.moveTo(-W, base + H);
      dctx.lineTo(-W, base);
      for (let i = -1; i <= 7; i++) {
        const x = i * (W / 3) - off;
        dctx.lineTo(x + W / 6, base - H * (0.16 + layer * 0.06));
        dctx.lineTo(x + W / 3, base);
      }
      dctx.lineTo(W * 2, base + H);
      dctx.closePath();
      dctx.fill();
    }

    // floating particles
    for (let i = 0; i < 18; i++) {
      const rnd = (Math.sin(i * 2.73) + 1) / 2;
      const x = ((i * 149 + t * (26 + i * 8)) % (W + 200)) - 100;
      const y = H * 0.92 - ((t * (26 + i * 10) + i * 83) % (H * 1.02));
      dctx.fillStyle = 'rgba(255,255,255,' + (0.05 + 0.13 * rnd).toFixed(3) + ')';
      dctx.beginPath(); dctx.arc(x, y, 3 + rnd * 9, 0, Math.PI * 2); dctx.fill();
    }

    // labels (오버레이를 가리지 않도록 좌측 상단 구석에 작게)
    dctx.textAlign = 'left';
    dctx.textBaseline = 'middle';
    dctx.fillStyle = 'rgba(255,255,255,.8)';
    dctx.font = '800 ' + (W * 0.030) + 'px ' + FONT;
    dctx.fillText('샘플 데모', W * 0.05, H * 0.075);
    dctx.fillStyle = 'rgba(255,255,255,.45)';
    dctx.font = '600 ' + (W * 0.019) + 'px ' + FONT;
    dctx.fillText('SAMPLE DEMO 1280×720', W * 0.05, H * 0.075 + W * 0.042);

    dctx.textAlign = 'left';
    dctx.fillStyle = 'rgba(255,255,255,.78)';
    dctx.font = '700 ' + (W * 0.023) + 'px ' + FONT;
    dctx.fillText('00:' + String(Math.floor(t)).padStart(2, '0') + '.' + Math.floor((t % 1) * 10), W * 0.05, H * 0.85);

    dctx.fillStyle = 'rgba(255,255,255,.2)';
    dctx.fillRect(W * 0.05, H * 0.895, W * 0.9, 3);
    dctx.fillStyle = '#ff7aa2';
    dctx.fillRect(W * 0.05, H * 0.895, W * 0.9 * clamp(t / DEMO_DURATION, 0, 1), 3);
  }

  /* ---------------- drawing primitives ---------------- */
  function colorFilter() {
    const f = S.filter;
    return 'brightness(' + f.b + '%) contrast(' + f.c + '%) saturate(' + f.s + '%) hue-rotate(' + f.h + 'deg)';
  }

  function drawPlaced(ctx, W, H, src, fit, zoom, offX, offY, flip) {
    const sw = src.w, sh = src.h;
    if (!sw || !sh) return;
    let scale = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    scale *= (zoom || 100) / 100;
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2 + ((offX || 0) / 100) * W;
    const dy = (H - dh) / 2 + ((offY || 0) / 100) * H;
    ctx.save();
    if (flip) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src.el, dx, dy, dw, dh);
    } else {
      ctx.drawImage(src.el, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  const bgCaches = new WeakMap();
  function drawBlurBg(ctx, W, H, src) {
    let c = bgCaches.get(ctx);
    if (!c) {
      c = document.createElement('canvas');
      bgCaches.set(ctx, c);
    }
    const cw = Math.max(2, Math.round(W / 2));
    const ch = Math.max(2, Math.round(H / 2));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const cx = c.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cw, ch);
    cx.save();
    if (FILTER_OK) cx.filter = 'blur(' + (cw * 0.045).toFixed(1) + 'px) brightness(0.58) saturate(1.15)';
    drawPlaced(cx, cw, ch, src, 'cover', 118, S.offX * 0.4, S.offY * 0.4, S.flip);
    cx.restore();
    ctx.drawImage(c, 0, 0, W, H);
  }

  function drawPlaceholder(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#121a2b');
    g.addColorStop(1, '#080b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    setFont(ctx, W * 0.05, 800);
    ctx.fillText('영상을 선택해 주세요', W / 2, H * 0.46);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    setFont(ctx, W * 0.028, 600);
    ctx.fillText('또는 샘플 데모로 바로 시작할 수 있어요', W / 2, H * 0.46 + W * 0.07);
  }

  /* ---------------- rich text wrap (comment) ---------------- */
  function wrapRich(ctx, text, maxW, fs, hl, W) {
    setFont(ctx, fs, 500);
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const space = ctx.measureText(' ').width + lsPx(W);
    const lines = [];
    let cur = [];
    let curW = 0;
    const hlNorm = String(hl || '').replace(/\s+/g, '').trim();
    for (const w of words) {
      const ww = textWidth(ctx, w, W);
      const add = (cur.length ? space : 0) + ww;
      if (curW + add > maxW && cur.length) {
        lines.push({ tokens: cur, width: curW });
        cur = [{ text: w, w: ww }];
        curW = ww;
      } else {
        cur.push({ text: w, w: ww });
        curW += add;
      }
    }
    if (cur.length) lines.push({ tokens: cur, width: curW });
    lines.forEach(function (line) {
      line.tokens.forEach(function (tk) {
        const norm = tk.text.replace(/[^\w가-힣]/g, '');
        tk.hl = !!hlNorm && norm.length > 0 && norm.indexOf(hlNorm) !== -1;
      });
    });
    return { lines: lines, space: space };
  }

  /* ---------------- overlay renderers ---------------- */
  function drawBigLine(ctx, text, x, y, color, fs, W) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.15;
    ctx.strokeStyle = 'rgba(0,0,0,.62)';
    paintText(ctx, text, x, y, W, 'stroke');
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = fs * 0.3;
    ctx.shadowOffsetY = fs * 0.06;
    ctx.fillStyle = color;
    paintText(ctx, text, x, y, W, 'fill');
    ctx.restore();
  }

  function drawTitle(ctx, W, H) {
    const o = S.ov.title;
    if (!o.on) return;
    const badge = (o.badge || '').trim();
    const t1 = (o.title || '').trim();
    const t2 = (o.hl || '').trim();
    if (!badge && !t1 && !t2) return;
    const maxW = W * 0.86;
    let y = H * 0.10;

    if (badge) {
      let fs = W * 0.040;
      setFont(ctx, fs, 800);
      let tw = textWidth(ctx, badge, W);
      const pwMax = maxW * 0.92;
      if (tw + W * 0.07 > pwMax) {
        fs *= (pwMax - W * 0.07) / tw;
        setFont(ctx, fs, 800);
        tw = textWidth(ctx, badge, W);
      }
      const ph = Math.max(fs * 1.95, W * 0.05);
      const pw = tw + W * 0.075;
      const x = (W - pw) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = W * 0.02;
      ctx.shadowOffsetY = W * 0.005;
      ctx.fillStyle = o.badgeColor || '#ff2d55';
      rr(ctx, x, y, pw, ph, ph / 2);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      setFont(ctx, fs, 800);
      paintText(ctx, badge, W / 2, y + ph / 2 + fs * 0.03, W, 'fill');
      y += ph + W * 0.02;
    }
    if (t1) {
      const fs = fitSize(ctx, t1, W * 0.068, maxW, 800, W * 0.032, W);
      setFont(ctx, fs, 800);
      drawBigLine(ctx, t1, W / 2, y + fs * 0.55, '#ffffff', fs, W);
      y += fs * 1.16;
    }
    if (t2) {
      const fs = fitSize(ctx, t2, W * 0.086, maxW, 900, W * 0.036, W);
      setFont(ctx, fs, 900);
      drawBigLine(ctx, t2, W / 2, y + fs * 0.55, o.hlColor || '#ffe14d', fs, W);
    }
  }

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y - s * 0.06, x - s * 0.55, y - s * 0.1, x - s * 0.55, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.55, y + s * 0.66, x - s * 0.16, y + s * 0.86, x, y + s * 1.02);
    ctx.bezierCurveTo(x + s * 0.16, y + s * 0.86, x + s * 0.55, y + s * 0.66, x + s * 0.55, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.55, y - s * 0.1, x, y - s * 0.06, x, y + s * 0.3);
    ctx.closePath();
  }

  function drawComment(ctx, W, H, ov) {
    const o = ov || S.ov.comment;
    if (!o.on) return;
    const user = (o.user || '').trim() || '익명';
    const body = (o.text || '').trim();
    if (!body) return;

    const m = W * 0.065;
    const cw = W - m * 2;
    const pad = W * 0.048;
    const av = W * 0.082;
    const fsUser = W * 0.035;
    const fsBody = W * 0.038;
    const lh = fsBody * (S.lh || 1.45);
    const wrapped = wrapRich(ctx, body, cw - pad * 2, fsBody, o.hl, W);
    const headerGap = W * 0.026;
    const cardH = pad * 0.9 + av + headerGap + wrapped.lines.length * lh + pad * 0.8;
    const y0 = H * 0.455;
    const x0 = m + pad;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = W * 0.045;
    ctx.shadowOffsetY = W * 0.012;
    ctx.fillStyle = '#ffffff';
    rr(ctx, m, y0, cw, cardH, W * 0.026);
    ctx.fill();
    ctx.restore();

    // avatar
    const avCx = x0 + av / 2;
    const avCy = y0 + pad * 0.9 + av / 2;
    const ag = ctx.createLinearGradient(x0, avCy - av / 2, x0 + av, avCy + av / 2);
    ag.addColorStop(0, '#6a8dff');
    ag.addColorStop(1, '#b25cff');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(avCx, avCy, av / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setFont(ctx, av * 0.42, 800);
    ctx.fillText(user.slice(0, 1).toUpperCase(), avCx, avCy + av * 0.03);

    // username
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f0f0f';
    setFont(ctx, fsUser, 800);
    paintText(ctx, user, x0 + av + W * 0.026, avCy - fsUser * 0.05, W, 'fill');

    // hearts
    const hearts = (o.hearts || '').trim();
    if (hearts) {
      ctx.textAlign = 'right';
      setFont(ctx, fsUser * 0.95, 700);
      const hw = textWidth(ctx, hearts, W);
      const rightX = m + cw - pad;
      ctx.fillStyle = '#5f6368';
      paintText(ctx, hearts, rightX, avCy, W, 'fill');
      ctx.fillStyle = '#ff2b4a';
      heartPath(ctx, rightX - hw - W * 0.024, avCy - fsUser * 0.45, W * 0.030);
      ctx.fill();
    }

    // body lines with highlight
    const bodyTop = y0 + pad * 0.9 + av + headerGap;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const space = wrapped.space;
    wrapped.lines.forEach(function (line, li) {
      let x = x0;
      const cy = bodyTop + lh * (li + 0.5);
      line.tokens.forEach(function (tk) {
        if (tk.hl) {
          ctx.fillStyle = '#ffe98a';
          rr(ctx, x - W * 0.007, cy - fsBody * 0.62, tk.w + W * 0.014, fsBody * 1.26, W * 0.008);
          ctx.fill();
        }
        ctx.fillStyle = tk.hl ? '#101010' : '#3c4043';
        setFont(ctx, fsBody, 500);
        paintText(ctx, tk.text, x, cy, W, 'fill');
        x += tk.w + space;
      });
    });
  }

  function drawCorner(ctx, W, H, ov) {
    const o = ov || S.ov.corner;
    if (!o.on) return;
    const left = (o.left || '').trim();
    const right = (o.right || '').trim();
    const fs = W * 0.029;
    const yTop = H * 0.052;

    if (left) {
      setFont(ctx, fs, 700);
      const tw = textWidth(ctx, left, W);
      const h = fs * 1.95;
      const padX = fs * 0.8;
      const x = W * 0.055;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.4)';
      ctx.shadowBlur = W * 0.02;
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      rr(ctx, x, yTop, tw + padX * 2 + fs * 0.9, h, h / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(x + padX + fs * 0.28, yTop + h / 2, fs * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      setFont(ctx, fs, 700);
      paintText(ctx, left, x + padX + fs * 0.85, yTop + h / 2 + fs * 0.02, W, 'fill');
    }
    if (right) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = W * 0.024;
      ctx.shadowOffsetY = W * 0.004;
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      setFont(ctx, fs, 800);
      paintText(ctx, right, W - W * 0.055, yTop + fs * 0.98, W, 'fill');
      ctx.restore();
    }
  }

  /* ---------------- 하단 자막 — 한국어 모션 라이브러리 연결 ----------------
     기존 5종(없음/외곽선/칩/팝업/타이핑) 대신 motion-library 의 14종 프리셋과
     5개 테마를 그대로 쓴다. 폰트·자간·행간·글자색은 웹앱 설정을 테마에 덮어씌워
     미리보기와 MP4 렌더가 같은 값을 읽게 한다. */
  const SUB_PRESET_ALIAS = {
    outline: 'outline-basic', plain: 'outline-basic', chip: 'chip-wipe',
    popup: 'pop-bounce', typing: 'typewriter'
  };

  function subPresetId() {
    const v = (S.ov.sub && S.ov.sub.style) || 'chip-wipe';
    return SUB_PRESET_ALIAS[v] || v;
  }

  function subTheme() {
    const base = KM ? KM.theme(S.ov.sub.theme || 'reels-dark') : null;
    const t = Object.assign({}, base || {});
    t.colors = Object.assign({}, (base && base.colors) || {}, { text: S.ov.sub.color || '#ffffff' });
    t.font = fontFamily();
    // 자간은 1080 기준 px → 글자크기 배수(em). 테마·ASS도 같은 단위를 쓴다.
    t.letterSpacing = (S.ls || 0) / (0.0575 * 1080);
    t.lineHeight = Number(S.lh) || 1.45;
    return t;
  }

  // 기존 자막 위치(가운데 y = H의 83.5%)·폭(86%)·글자크기(0.056W)를 그대로 유지한다
  function subLayout(W, H) {
    return {
      maxW: W * 0.86,
      topY: 0,
      bottomY: H * 1.67,
      anchor: 'center',
      maxLines: 4,
      size: W * 0.056,
      u: Math.min(W, H) / 1080
    };
  }

  function drawSubtitle(ctx, W, H, t) {
    const o = S.ov.sub;
    if (!o.on || !KM) return;
    const text = (o.text || '').trim();
    const pid = subPresetId();
    if (!text || pid === 'none') return;

    const dur = Math.max(0.4, totalOut() || DEMO_DURATION);
    // 멈춰 있을 때는 등장이 끝난 완성된 모습을 보여 준다(예전과 같은 동작).
    // 스타일을 막 고른 직후에는 그 모션을 한 번 재생해 보여 준다.
    const demo = (!playing && !exp && subDemoT0) ? (performance.now() - subDemoT0) / 1000 : 0;
    const animating = playing || !!exp || demo > 0;
    const still = dur > 1.4 ? dur - 0.5 : Math.max(0.3, dur * 0.6);
    const tt = (playing || exp) ? clamp(t, 0, dur) : (demo > 0 ? Math.min(demo, dur) : still);
    KM.drawFrame(ctx, {
      cues: [{ start: 0, end: dur, text: text }],
      t: tt,
      W: W, H: H,
      preset: pid,
      theme: subTheme(),
      layout: subLayout(W, H)
    });
  }


  function drawSafeZone(ctx, W, H) {
    const l = W * 0.06, r = W * 0.06, tp = H * 0.10, bt = H * 0.14;
    ctx.save();
    ctx.fillStyle = 'rgba(255,61,110,.07)';
    ctx.fillRect(0, H - bt, W, bt);
    ctx.setLineDash([W * 0.018, W * 0.013]);
    ctx.lineWidth = Math.max(1.5, W * 0.0035);
    ctx.strokeStyle = 'rgba(120,215,255,.95)';
    rr(ctx, l, tp, W - l - r, H - tp - bt, W * 0.03);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(150,225,255,.95)';
    setFont(ctx, Math.max(9, W * 0.024), 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = tp - Math.max(10, W * 0.026);
    if (labelY > H * 0.03) ctx.fillText('Shorts · Reels 안전 영역', W / 2, labelY);
    ctx.fillStyle = 'rgba(200,235,255,.9)';
    setFont(ctx, Math.max(8, W * 0.021), 700);
    ctx.fillText('앱 UI에 가려지는 영역', W / 2, H - bt / 2);
    ctx.restore();
  }

  function drawOverlays(ctx, W, H, t) {
    // t 가 속한 컷의 댓글 카드·코너 라벨을 쓴다(컷이 1개면 기존과 완전히 동일)
    const co = cutOverlayAt(t);
    drawCorner(ctx, W, H, co.corner);
    drawTitle(ctx, W, H);
    drawComment(ctx, W, H, co.comment);
    drawSubtitle(ctx, W, H, t);
  }

  function drawScene(ctx, W, H, t, opts) {
    opts = opts || {};
    const src = getSource();
    ctx.save();
    ctx.filter = 'none';
    ctx.fillStyle = '#06070b';
    ctx.fillRect(0, 0, W, H);
    if (src) {
      if (S.blurBg) drawBlurBg(ctx, W, H, src);
      ctx.save();
      if (FILTER_OK) ctx.filter = colorFilter();
      drawPlaced(ctx, W, H, src, S.blurBg ? 'contain' : 'cover', S.zoom, S.offX, S.offY, S.flip);
      ctx.restore();
    } else {
      drawPlaceholder(ctx, W, H);
    }
    ctx.filter = 'none';
    drawOverlays(ctx, W, H, t);
    const fa = fadeAlpha(t);
    if (fa > 0.002) {
      ctx.fillStyle = 'rgba(0,0,0,' + fa.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (opts.guide) drawSafeZone(ctx, W, H);
    ctx.restore();
  }

  /* ---------------- playback loop ---------------- */
  function tick(ts) {
    // 내보내기 중에는 실제 경과 시간을 그대로 써서 영상 길이가 밀리지 않게 한다
    const raw = lastTs ? (ts - lastTs) / 1000 : 0;
    const dt = Math.min(exp ? 0.5 : 0.12, raw);
    lastTs = ts;

    if (playing) {
      if (mode === 'demo') {
        demoAbs += dt * (S.speedRamp.mode === 'none' ? S.speed : speedAtSrc(demoAbs));
        if (!exp) {
          const seg = Math.max(0.2, S.trimEnd - S.trimStart);
          if (demoAbs >= S.trimEnd) demoAbs = S.trimStart + ((demoAbs - S.trimStart) % seg);
        }
      } else if (!exp) {
        if (video.currentTime >= S.trimEnd - 0.03 || video.currentTime < S.trimStart - 0.6) {
          const segs = S.autocut.on ? segments() : null;
          try { video.currentTime = segs && segs.length ? segs[0][0] : S.trimStart; } catch (e) { /* noop */ }
        }
      }
      if (mode === 'video') {
        enforceSegments();
        applyVideoRate();     // 스피드 램프 → 재생 중에도 속도가 서서히 변한다
      }
      dirty = true;
    }
    updateDuck();
    updateAgc(audioGraph);
    if (!playing && !exp && subDemoT0) {
      if ((performance.now() - subDemoT0) / 1000 < SUB_DEMO_LEN) dirty = true;
      else { subDemoT0 = 0; dirty = true; }
    }
    if (mode === 'demo' && demoAbs !== demoPainted) {
      paintDemo(demoAbs);
      demoPainted = demoAbs;
    }

    if (dirty || playing || exp) {
      const t = outTime();
      drawScene(pctx, preview.width, preview.height, t, { guide: S.safe });
      if (exp) {
        drawScene(exp.ctx, exp.cvs.width, exp.cvs.height, t, { guide: false });
        updateExportProgress();
      }
      dirty = false;
    }
    updateTransport();
    requestAnimationFrame(tick);
  }

  function updateSpeedHint() {
    if (!speedOutHint) return;
    const out = totalOut();
    const st = cutStats();
    const cut = S.autocut.on && cutRuns.length ? ' · 무음 ' + st.count + '곳 ' + st.removed.toFixed(1) + '초 제거' : '';
    const rp = S.speedRamp.mode && S.speedRamp.mode !== 'none' ? ' · 스피드 램프' : '';
    const semi = S.pitch.semi || 0;
    const pitchNote = !S.pitch.lock
      ? ' · 음정도 배속을 따라감'
      : (semi ? ' · 음정 유지 ' + (semi > 0 ? '+' : '') + semi + '반음' : ' · 소리는 음정 유지');
    speedOutHint.textContent = '이 배속으로 내보내면 ' + fmtSec1(out) + cut + rp + pitchNote;
    const rh = $('#rampHint');
    if (rh) {
      if (!S.speedRamp.mode || S.speedRamp.mode === 'none') {
        rh.textContent = '램프를 고르면 한 클립 안에서 속도가 ' + speedLabel(S.speed) + ' 기준으로 서서히 변합니다(미리보기·내보내기 공통).';
      } else {
        const k = clamp((S.speedRamp.strength || 0) / 100, 0, 0.85);
        const lo = speedLabel(Math.max(0.1, S.speed * (1 - k)));
        const hi = speedLabel(S.speed * (1 + k));
        rh.textContent = RAMP_NAME[S.speedRamp.mode] + ' · ' + lo + ' ~ ' + hi + ' · 구간 ' + S.speedRamp.span + '%'
          + ' · 내보낼 길이 ' + fmtSec1(out);
      }
    }
  }

  function updateTransport() {
    const seg = Math.max(0.001, S.trimEnd - S.trimStart);
    const pos = clamp(srcPos() - S.trimStart, 0, seg);
    timeLabel.textContent = fmtTime(pos) + ' / ' + fmtTime(seg);
    timeFill.style.width = (pos / seg * 100).toFixed(2) + '%';
    speedChip.textContent = speedLabel(S.speed);
    updateCutNow();
  }

  function updatePlayBtn() {
    btnPlay.textContent = playing ? '⏸' : '▶';
    btnPlay.setAttribute('aria-label', playing ? '일시정지' : '재생');
  }

  async function setPlaying(v) {
    if (v && exp) return;
    if (mode === 'video') {
      if (v) {
        const g = ensureAudioGraph();
        playing = true;
        updatePlayBtn();
        if (g) startPreviewAudio(g);
        try {
          await video.play();
        } catch (e) {
          playing = false;
          stopPreviewAudio();
          updatePlayBtn();
          toast('재생할 수 없어요. 영상을 다시 선택해 주세요.');
        }
      } else {
        playing = false;
        video.pause();
        stopPreviewAudio();
      }
    } else {
      if (v) {
        const g = ensureAudioGraph();
        if (g) startPreviewAudio(g);
      } else {
        stopPreviewAudio();
      }
      playing = v;
    }
    dirty = true;
    updatePlayBtn();
  }

  function startPreviewAudio(g) {
    applyAudioLevels();
    const t0 = g.ctx.currentTime + 0.05;
    const off = outTime();
    scheduleFades(t0, off);
    startBgm(t0);
    scheduleSfx(t0, off, g.sfxNodes);
  }

  function stopPreviewAudio() {
    stopBgm();
    stopSfx();
    if (audioGraph) {
      try {
        audioGraph.master.gain.cancelScheduledValues(audioGraph.ctx.currentTime);
        audioGraph.master.gain.value = 1;
      } catch (e) { /* noop */ }
    }
  }

  function seekTo(srcTime) {
    const t = clamp(srcTime, 0, sourceDur);
    if (mode === 'video') {
      try { video.currentTime = t; } catch (e) { /* noop */ }
    } else {
      demoAbs = t;
    }
    dirty = true;
  }

  /* ---------------- audio graph (preview + export) ---------------- */
  let bgmBuffer = null;
  const noiseCache = new WeakMap();

  // 반음 피치 시프터 + 오토 레벨링(AGC)을 AudioWorklet 하나로 처리한다.
  // 피치: 두 개의 읽기 헤드를 교차 페이드하는 그래뉼러 방식(원음 길이 유지).
  // AGC: 블록 RMS 를 따라가는 게인 라이딩 — 작은 소리는 올리고 큰 소리는 내린다.
  const WORKLET_SRC = [
    'class ShortsPitch extends AudioWorkletProcessor {',
    '  static get parameterDescriptors() {',
    "    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];",
    '  }',
    '  constructor() {',
    '    super();',
    '    this.N = 16384; this.G = 4096;',
    '    this.bL = new Float32Array(this.N); this.bR = new Float32Array(this.N);',
    '    this.w = 0; this.phi = 0;',
    '  }',
    '  process(inputs, outputs, params) {',
    '    const inp = inputs[0], out = outputs[0];',
    '    const L = inp.length ? inp[0] : null;',
    '    const R = inp.length > 1 ? inp[1] : L;',
    '    const oL = out[0];',
    '    const oR = out.length > 1 ? out[1] : null;',
    '    const ratio = params.ratio[0], N = this.N, G = this.G, inc = ratio - 1;',
    '    const n = oL.length;',
    '    for (let i = 0; i < n; i++) {',
    '      this.bL[this.w] = L ? L[i] : 0;',
    '      this.bR[this.w] = R ? R[i] : 0;',
    '      let aL = 0, aR = 0;',
    '      for (let h = 0; h < 2; h++) {',
    '        let ph = this.phi + h * (G / 2);',
    '        ph -= Math.floor(ph / G) * G;',
    '        const rp = (this.w - G + ph + N) % N;',
    '        const i0 = Math.floor(rp), i1 = (i0 + 1) % N, fr = rp - i0;',
    '        const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph / G);',
    '        aL += (this.bL[i0] * (1 - fr) + this.bL[i1] * fr) * win;',
    '        aR += (this.bR[i0] * (1 - fr) + this.bR[i1] * fr) * win;',
    '      }',
    '      oL[i] = aL; if (oR) oR[i] = aR;',
    '      this.w = (this.w + 1) % N;',
    '      this.phi += inc;',
    '      this.phi -= Math.floor(this.phi / G) * G;',
    '    }',
    '    return true;',
    '  }',
    '}',
    'class ShortsAgc extends AudioWorkletProcessor {',
    '  static get parameterDescriptors() {',
    "    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },",
    "            { name: 'target', defaultValue: 0.06, minValue: 0.01, maxValue: 0.3, automationRate: 'k-rate' }];",
    '  }',
    '  constructor() { super(); this.env = 0; this.g = 1; }',
    '  process(inputs, outputs, params) {',
    '    const inp = inputs[0], out = outputs[0];',
    '    if (!inp.length) return true;',
    '    const amount = params.amount[0], target = params.target[0];',
    '    const n = inp[0].length, sr = sampleRate;',
    '    let s = 0;',
    '    for (let i = 0; i < n; i++) s += inp[0][i] * inp[0][i];',
    '    const rms = Math.sqrt(s / n);',
    '    const att = 1 - Math.exp(-n / (0.015 * sr));',
    '    const rel = 1 - Math.exp(-n / (0.22 * sr));',
    '    this.env += (rms - this.env) * (rms > this.env ? att : rel);',
    '    let want = this.env > 1e-4 ? target / this.env : 1;',
    '    want = Math.max(0.3, Math.min(3.4, want));',
    '    this.g += (want - this.g) * (1 - Math.exp(-n / (0.02 * sr)));',
    '    const gain = 1 + (this.g - 1) * amount;',
    '    for (let ch = 0; ch < out.length; ch++) {',
    '      const o = out[ch], src = inp[Math.min(ch, inp.length - 1)];',
    '      for (let i = 0; i < n; i++) o[i] = src[i] * gain;',
    '    }',
    '    return true;',
    '  }',
    '}',
    "registerProcessor('shorts-pitch', ShortsPitch);",
    "registerProcessor('shorts-agc', ShortsAgc);"
  ].join('\n');
  let workletURL = null;

  function ensureWorklet(g) {
    if (!g || g.workletReady || g.workletTried) return;
    g.workletTried = true;
    const ac = g.ctx;
    if (!ac.audioWorklet) { g.workletFail = 'AudioWorklet 없음'; return; }
    try {
      if (!workletURL) workletURL = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      ac.audioWorklet.addModule(workletURL).then(function () {
        g.workletReady = true;
        wireVoice(g);          // 워클릿이 준비되면 사슬을 다시 잇는다
      }).catch(function (e) {
        g.workletFail = (e && e.message) || String(e);
        console.warn('audio worklet load failed (fallback):', g.workletFail);
        wireVoice(g);                    // 예비 경로(ScriptProcessor · 게인 라이딩)로 다시 잇는다
      });
    } catch (e) {
      g.workletFail = String(e);
      wireVoice(g);
    }
  }

  // 노이즈 제거 필터 + 음량 정리(컴프레서/메이크업/리미터) 사슬
  function fxChain(ctx, o) {
    const head = ctx.createGain();
    let cur = head;
    const nodes = { input: head, denoise: null, level: null };
    const dn = (o && o.denoise) || {};
    if (dn.on) {
      const s = clamp((dn.strength == null ? 55 : dn.strength) / 100, 0, 1);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = 70 + 50 * s; hp.Q.value = 0.707;       // 저역 흔들림·험
      const hum = ctx.createBiquadFilter(); hum.type = 'notch';
      hum.frequency.value = 60; hum.Q.value = 6 + 14 * s;          // 60Hz 전원 험
      const hs = ctx.createBiquadFilter(); hs.type = 'highshelf';
      hs.frequency.value = 6800; hs.gain.value = -9 * s;           // 치찰음·히스
      cur.connect(hp); hp.connect(hum); hum.connect(hs); cur = hs;
      nodes.denoise = { hp: hp, hum: hum, hs: hs };
    }
    const lv = (o && o.level) || {};
    if (lv.on) {
      const s = clamp((lv.strength == null ? 55 : lv.strength) / 100, 0, 1);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14 - 10 * s;
      comp.knee.value = 12;
      comp.ratio.value = 2 + 6 * s;
      comp.attack.value = 0.006;
      comp.release.value = 0.22;
      const makeup = ctx.createGain();
      makeup.gain.value = 1;                                       // AGC가 음량을 올리고 내린다
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20;
      lim.attack.value = 0.002; lim.release.value = 0.1;
      cur.connect(comp); comp.connect(makeup); makeup.connect(lim); cur = lim;
      nodes.level = { comp: comp, makeup: makeup, lim: lim };
    }
    const out = ctx.createGain();
    cur.connect(out);
    nodes.output = out;
    return nodes;
  }

  // src → (피치) → (AGC) → 필터/컴프 → 원본 볼륨 → 분석기 → 마스터
  // 워클릿을 못 쓰는 환경(file:// 로 직접 열기 등)에서는 ScriptProcessor 피치 시프터와
  // 메인 스레드 게인 라이딩으로 같은 기능을 대신한다.
  function wireVoice(g) {
    if (!g) return;
    const off = [g.src, g.pitch, g.pitchSP, g.agc, g.fxTail, g.agcAnalyser];
    for (let i = 0; i < off.length; i++) { try { if (off[i]) off[i].disconnect(); } catch (e) { /* noop */ } }
    try { if (g.origGain) g.origGain.disconnect(0); } catch (e) { /* noop */ }
    try { if (g.analyser) g.analyser.disconnect(0); } catch (e) { /* noop */ }
    g.origGain.connect(g.analyser);
    g.analyser.connect(g.master);

    if (g.workletReady) {
      if (!g.pitch) { try { g.pitch = new AudioWorkletNode(g.ctx, 'shorts-pitch'); } catch (e) { g.pitch = null; } }
      if (!g.agc) { try { g.agc = new AudioWorkletNode(g.ctx, 'shorts-agc'); } catch (e) { g.agc = null; } }
    } else if (g.workletFail && !g.pitchSP) {
      g.pitchSP = makeScriptPitch(g);          // 워클릿 실패 → 예비 시프터
    }
    const usePitch = Math.abs(S.pitch.semi || 0) > 0.001;
    const pitchNode = g.workletReady ? g.pitch : (g.pitchSP || null);
    const useAgc = !!g.agc && !!S.level.on && g.workletReady;
    const fx = fxChain(g.ctx, { denoise: S.denoise, level: S.level });
    const seq = [];
    if (g.src) seq.push(g.src);
    if (usePitch && pitchNode) seq.push(pitchNode);
    if (useAgc) seq.push(g.agc);
    seq.push(g.agcAnalyser);
    seq.push(g.agcGain);
    seq.push(fx.input);
    for (let i = 0; i < seq.length - 1; i++) seq[i].connect(seq[i + 1]);
    fx.output.connect(g.origGain);
    g.fxTail = fx.output;
    g.pitchRatio = Math.pow(2, (S.pitch.semi || 0) / 12);
    if (g.pitch) { try { g.pitch.parameters.get('ratio').setValueAtTime(g.pitchRatio, g.ctx.currentTime); } catch (e) { /* noop */ } }
    if (g.agcGain) { try { g.agcGain.gain.setTargetAtTime(1, g.ctx.currentTime, 0.02); } catch (e) { /* noop */ } }
    if (g.agc) {
      try {
        g.agc.parameters.get('amount').setValueAtTime(clamp((S.level.strength || 0) / 100, 0, 1), g.ctx.currentTime);
        g.agc.parameters.get('target').setValueAtTime(0.06, g.ctx.currentTime);
      } catch (e) { /* noop */ }
    }
    g.chain = { pitch: usePitch && !!pitchNode, agc: useAgc, denoise: !!S.denoise.on, level: !!S.level.on, pitchFallback: !g.workletReady && !!g.pitchSP };
  }

  // 워클릿을 못 쓸 때 쓰는 예비 피치 시프터(같은 그래뉼러 알고리즘)
  function makeScriptPitch(g) {
    const ac = g.ctx;
    let sp;
    try { sp = ac.createScriptProcessor(4096, 2, 2); } catch (e) { try { sp = ac.createScriptProcessor(4096, 1, 1); } catch (e2) { return null; } }
    const N = 16384, G = 4096;
    const bL = new Float32Array(N), bR = new Float32Array(N);
    let w = 0, phi = 0;
    sp.onaudioprocess = function (ev) {
      const ib = ev.inputBuffer, ob = ev.outputBuffer;
      const inL = ib.getChannelData(0);
      const inR = ib.numberOfChannels > 1 ? ib.getChannelData(1) : inL;
      const oL = ob.getChannelData(0);
      const oR = ob.numberOfChannels > 1 ? ob.getChannelData(1) : null;
      const inc = (g.pitchRatio || 1) - 1;
      for (let i = 0; i < oL.length; i++) {
        bL[w] = inL[i]; bR[w] = inR[i];
        let aL = 0, aR = 0;
        for (let h = 0; h < 2; h++) {
          let ph = phi + h * (G / 2);
          ph -= Math.floor(ph / G) * G;
          const rp = (w - G + ph + N) % N;
          const i0 = Math.floor(rp), i1 = (i0 + 1) % N, fr = rp - i0;
          const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph / G);
          aL += (bL[i0] * (1 - fr) + bL[i1] * fr) * win;
          aR += (bR[i0] * (1 - fr) + bR[i1] * fr) * win;
        }
        oL[i] = aL;
        if (oR) oR[i] = aR;
        w = (w + 1) % N;
        phi += inc;
        phi -= Math.floor(phi / G) * G;
      }
    };
    return sp;
  }

  function applyPitchToVideo() {
    const lock = !!S.pitch.lock;
    try { video.preservesPitch = lock; } catch (e) { /* noop */ }
    try { video.webkitPreservesPitch = lock; } catch (e) { /* noop */ }
    try { video.mozPreservesPitch = lock; } catch (e) { /* noop */ }
  }

  function ensureAudioGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioGraph) {
      try {
        const actx = new AC();
        const origGain = actx.createGain();
        const bgmGain = actx.createGain();
        const duckGain = actx.createGain();
        const sfxGain = actx.createGain();
        const master = actx.createGain();
        const mon = actx.createGain();
        const analyser = actx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        const agcAnalyser = actx.createAnalyser();
        agcAnalyser.fftSize = 512;
        const agcGain = actx.createGain();
        agcGain.gain.value = 1;
        agcAnalyser.connect(agcGain);
        const dest = actx.createMediaStreamDestination();
        origGain.connect(analyser);
        analyser.connect(master);
        bgmGain.connect(duckGain);
        duckGain.connect(master);
        sfxGain.connect(master);
        master.connect(mon);
        mon.connect(actx.destination);
        master.connect(dest);
        audioGraph = {
          ctx: actx, src: null, origGain: origGain, bgmGain: bgmGain, duckGain: duckGain,
          sfxGain: sfxGain, master: master, mon: mon, dest: dest, analyser: analyser,
          agcAnalyser: agcAnalyser, agcGain: agcGain, agcEnv: 0, agcBuf: null,
          pitch: null, pitchSP: null, pitchRatio: 1, agc: null, fxTail: null,
          workletReady: false, workletTried: false,
          bgmSrc: null, sfxNodes: [], duckEnv: 0, duckTarget: 1, duckBuf: null
        };
      } catch (e) {
        console.warn('audio graph unavailable:', e);
        return null;
      }
    }
    const g = audioGraph;
    if (mode === 'video' && !g.src) {
      try {
        g.src = g.ctx.createMediaElementSource(video);
      } catch (e) { /* 이미 연결됨 */ }
    }
    ensureWorklet(g);
    wireVoice(g);
    if (g.ctx.state === 'suspended') g.ctx.resume().catch(function () {});
    applyAudioLevels();
    applyPitchToVideo();
    return g;
  }

  function applyAudioLevels() {
    if (!audioGraph) return;
    const g = audioGraph;
    g.origGain.gain.value = clamp(S.audio.vol / 100, 0, 1.5);
    g.bgmGain.gain.value = S.bgm.on ? clamp(S.bgm.vol / 100, 0, 1) * 0.9 : 0;
    g.sfxGain.gain.value = clamp(S.sfx.vol / 100, 0, 1) * 0.9;
    if (!S.duck.on) {
      try { g.duckGain.gain.cancelScheduledValues(g.ctx.currentTime); } catch (e) { /* noop */ }
      g.duckGain.gain.value = 1;
      g.duckTarget = 1;
    }
    if (!S.level.on && g.agcGain) {
      try { g.agcGain.gain.cancelScheduledValues(g.ctx.currentTime); } catch (e) { /* noop */ }
      g.agcGain.gain.value = 1;
      g.agcEnv = 0;
    }
  }

  // 워클릿 AGC 를 못 쓸 때: 분석기 RMS 로 게인을 메인 스레드에서 라이딩한다
  function updateAgc(g) {
    if (!g || !g.agcGain) return;
    const canWorklet = g.workletReady && !!g.agc;
    if (!S.level.on || canWorklet) {
      if (Math.abs(g.agcGain.gain.value - 1) > 0.001) {
        try { g.agcGain.gain.setTargetAtTime(1, g.ctx.currentTime, 0.05); } catch (e) { /* noop */ }
      }
      g.agcEnv = 0;
      return;
    }
    if (!(playing || exp)) return;
    if (!g.agcBuf) g.agcBuf = new Float32Array(g.agcAnalyser.fftSize);
    try { g.agcAnalyser.getFloatTimeDomainData(g.agcBuf); } catch (e) { return; }
    let sum = 0;
    for (let i = 0; i < g.agcBuf.length; i++) sum += g.agcBuf[i] * g.agcBuf[i];
    const rms = Math.sqrt(sum / g.agcBuf.length);
    g.agcEnv += (rms - g.agcEnv) * (rms > g.agcEnv ? 0.5 : 0.06);   // 빠른 어택 · 느린 릴리스
    let want = g.agcEnv > 1e-4 ? 0.06 / g.agcEnv : 1;
    want = clamp(want, 0.3, 3.4);
    const amt = clamp((S.level.strength || 0) / 100, 0, 1);
    const target = 1 + (want - 1) * amt;
    g.agcTarget = target;
    try { g.agcGain.gain.setTargetAtTime(target, g.ctx.currentTime, 0.03); } catch (e) { /* noop */ }
  }

  // 말소리 엔벨로프를 보고 BGM 게인을 실시간으로 낮춘다(미리보기·내보내기 공통)
  function updateDuck() {
    const g = audioGraph;
    if (!g || !g.analyser) return;
    if (!S.duck.on) {
      if (g.duckGain.gain.value !== 1) { try { g.duckGain.gain.setTargetAtTime(1, g.ctx.currentTime, 0.12); } catch (e) { /* noop */ } }
      g.duckTarget = 1;
      return;
    }
    if (!(playing || exp)) return;
    if (!g.duckBuf) g.duckBuf = new Float32Array(g.analyser.fftSize);
    try { g.analyser.getFloatTimeDomainData(g.duckBuf); } catch (e) { return; }
    let sum = 0;
    for (let i = 0; i < g.duckBuf.length; i++) sum += g.duckBuf[i] * g.duckBuf[i];
    const rms = Math.sqrt(sum / g.duckBuf.length);
    const active = rms > 0.012;                       // 약 -38 dBFS 이상이면 말하는 중
    const depth = clamp((S.duck.depth || 30) / 100, 0.05, 0.9);
    const target = active ? (1 - depth) : 1;
    g.duckEnv = rms;
    g.duckTarget = target;
    try { g.duckGain.gain.setTargetAtTime(target, g.ctx.currentTime, active ? 0.05 : 0.28); } catch (e) { /* noop */ }
  }

  /* ---------------- 오프라인 오디오 검증 (같은 사슬을 OfflineAudioContext에서 돌린다) ----------------
     미리보기·내보내기가 쓰는 fxChain/wireVoice 와 같은 노드 구성을 쓴다.
     테스트는 여기서 나온 수치로 노이즈 제거·음량 편차 감소를 확인한다. */
  function seededNoise(i) {
    // 결정적인 잡음(테스트 재현용): LCG
    let s = (i * 1103515245 + 12345) & 0x7fffffff;
    return ((s / 0x7fffffff) * 2 - 1);
  }

  function bandMag(x, sr, f, from, to) {
    const a0 = Math.max(0, Math.floor(from * sr));
    const a1 = Math.min(x.length, Math.floor(to * sr));
    let re = 0, im = 0;
    for (let i = a0; i < a1; i++) {
      const a = 2 * Math.PI * f * (i - a0) / sr;
      re += x[i] * Math.cos(a); im -= x[i] * Math.sin(a);
    }
    return 2 * Math.hypot(re, im) / Math.max(1, a1 - a0);
  }

  function rmsOf(x, from, to) {
    const a0 = Math.max(0, Math.floor(from)), a1 = Math.min(x.length, Math.floor(to));
    let s = 0;
    for (let i = a0; i < a1; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, a1 - a0));
  }

  function winRms(x, sr, n) {
    const out = [];
    const step = x.length / n;
    for (let k = 0; k < n; k++) out.push(Math.round(rmsOf(x, k * step, (k + 1) * step) * 10000) / 10000);
    return out;
  }

  function audioMetrics(x, sr) {
    return {
      rms: Math.round(rmsOf(x, 0, x.length) * 10000) / 10000,
      bands: {
        f60: Math.round(bandMag(x, sr, 60, 0, Math.min(x.length / sr, 1.6)) * 10000) / 10000,
        f120: Math.round(bandMag(x, sr, 120, 0, Math.min(x.length / sr, 1.6)) * 10000) / 10000,
        f440: Math.round(bandMag(x, sr, 440, 0, Math.min(x.length / sr, 1.6)) * 10000) / 10000,
        f3500: Math.round(bandMag(x, sr, 3500, 0, Math.min(x.length / sr, 1.6)) * 10000) / 10000
      },
      windows: winRms(x, sr, 8)
    };
  }

  async function audioProbe(opts) {
    opts = opts || {};
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) throw new Error('OfflineAudioContext 없음');
    const sr = 48000, dur = opts.dur || 2.4;
    const ac = new OAC(1, Math.round(sr * dur), sr);
    const buf = ac.createBuffer(1, ac.length, sr);
    const d = buf.getChannelData(0);
    const kind = opts.signal || 'hum';
    const freq = opts.freq || 440;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (kind === 'hum') {
        d[i] = 0.35 * Math.sin(2 * Math.PI * freq * t) + 0.18 * Math.sin(2 * Math.PI * 60 * t) + 0.02 * seededNoise(i);
      } else if (kind === 'level') {
        const amp = t < dur / 2 ? 0.02 : 0.55;
        d[i] = amp * Math.sin(2 * Math.PI * freq * t);
      } else if (kind === 'tone') {
        d[i] = 0.35 * Math.sin(2 * Math.PI * freq * t);
      } else {
        d[i] = 0;
      }
    }
    const dn = opts.denoise || S.denoise;
    const lv = opts.level || S.level;
    const fx = fxChain(ac, { denoise: dn, level: lv });
    const src = ac.createBufferSource();
    src.buffer = buf;
    if (lv && lv.on && opts.agc !== false && ac.audioWorklet) {
      try {
        if (!workletURL) workletURL = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ac.audioWorklet.addModule(workletURL);
        const agc = new AudioWorkletNode(ac, 'shorts-agc');
        agc.parameters.get('amount').value = clamp((lv.strength || 0) / 100, 0, 1);
        agc.parameters.get('target').value = 0.06;
        src.connect(agc); agc.connect(fx.input);
      } catch (e) {
        src.connect(fx.input);
      }
    } else {
      src.connect(fx.input);
    }
    fx.output.connect(ac.destination);
    src.start();
    const out = await ac.startRendering();
    const y = out.getChannelData(0);
    return { sr: sr, before: audioMetrics(d, sr), after: audioMetrics(y, sr) };
  }

  function noiseBuffer(ac, sec) {
    let m = noiseCache.get(ac);
    if (!m) { m = {}; noiseCache.set(ac, m); }
    const key = 'n' + sec;
    if (!m[key]) {
      const b = ac.createBuffer(1, Math.max(1, Math.ceil(ac.sampleRate * sec)), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      m[key] = b;
    }
    return m[key];
  }

  // 효과음은 오실레이터·노이즈로 그 자리에서 합성한다(외부 파일 없음)
  function playSfx(ac, out, id, when, vol) {
    if (!id || id === 'none') return [];
    const nodes = [];
    const bus = ac.createGain();
    bus.gain.value = clamp(vol, 0, 1.5);
    bus.connect(out);
    const t = Math.max(when, ac.currentTime);

    if (id === 'pop') {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(360, t + 0.09);
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(1, t + 0.006);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + 0.15); nodes.push(o);
    } else if (id === 'ding') {
      [1318.5, 1975.5].forEach(function (f, i) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const e = ac.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(0.6 / (i + 1), t + 0.01);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
        o.connect(e); e.connect(bus); o.start(t); o.stop(t + 0.8); nodes.push(o);
      });
    } else if (id === 'whoosh') {
      const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 0.5);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(320, t);
      bp.frequency.exponentialRampToValueAtTime(3400, t + 0.26);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.42);
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(0.95, t + 0.09);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
      s.connect(bp); bp.connect(e); e.connect(bus); s.start(t); s.stop(t + 0.46); nodes.push(s);
    } else if (id === 'shutter') {
      [0, 0.075].forEach(function (d) {
        const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 0.12);
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
        const e = ac.createGain();
        e.gain.setValueAtTime(0.0001, t + d);
        e.gain.linearRampToValueAtTime(0.85, t + d + 0.003);
        e.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.055);
        s.connect(hp); hp.connect(e); e.connect(bus);
        s.start(t + d); s.stop(t + d + 0.07); nodes.push(s);
      });
    } else if (id === 'punch') {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(1, t + 0.008);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + 0.24); nodes.push(o);
      const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 0.12);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const e2 = ac.createGain();
      e2.gain.setValueAtTime(0.55, t);
      e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      s.connect(lp); lp.connect(e2); e2.connect(bus); s.start(t); s.stop(t + 0.11); nodes.push(s);
    }
    return nodes;
  }

  // 효과음이 들어갈 지점(출력 시간 기준)
  function sfxTimes() {
    if (!S.sfx.id || S.sfx.id === 'none') return [];
    if (S.sfx.at === 'sub') return [0.25];
    const segs = segments();
    const spd = Math.max(0.05, S.speed);
    const out = [];
    let acc = 0;
    for (let i = 0; i < segs.length; i++) { out.push(acc / spd); acc += segs[i][1] - segs[i][0]; }
    return out;
  }

  function scheduleSfx(t0, outOffset, nodes) {
    if (!audioGraph) return;
    const times = sfxTimes();
    for (let i = 0; i < times.length; i++) {
      const d = times[i] - outOffset;
      if (d < -0.02) continue;
      const made = playSfx(audioGraph.ctx, audioGraph.sfxGain, S.sfx.id, t0 + Math.max(0, d), S.sfx.vol / 100);
      for (let j = 0; j < made.length; j++) nodes.push(made[j]);
    }
  }

  function startBgm(when) {
    if (!audioGraph || !bgmBuffer || !S.bgm.on) return;
    stopBgm();
    try {
      const s = audioGraph.ctx.createBufferSource();
      s.buffer = bgmBuffer;
      s.loop = true;
      s.connect(audioGraph.bgmGain);
      s.start(when);
      audioGraph.bgmSrc = s;
    } catch (e) { /* noop */ }
  }
  function stopBgm() {
    if (!audioGraph || !audioGraph.bgmSrc) return;
    try { audioGraph.bgmSrc.stop(); } catch (e) { /* noop */ }
    try { audioGraph.bgmSrc.disconnect(); } catch (e) { /* noop */ }
    audioGraph.bgmSrc = null;
  }
  function stopSfx() {
    if (!audioGraph) return;
    audioGraph.sfxNodes.forEach(function (n) { try { n.stop(0); } catch (e) { /* noop */ } });
    audioGraph.sfxNodes = [];
  }

  // 페이드: 출력 시간(초) 기준으로 마스터 게인을 예약한다
  function scheduleFades(t0, outStart) {
    if (!audioGraph) return;
    const g = audioGraph.master.gain;
    const fi = S.audio.fadeIn, fo = S.audio.fadeOut;
    const left = Math.max(0.01, totalOut() - outStart);
    try { g.cancelScheduledValues(t0); } catch (e) { /* noop */ }
    g.setValueAtTime(1, t0);
    if (fi > 0 && outStart < fi) {
      g.setValueAtTime(clamp(outStart / fi, 0.0001, 1), t0);
      g.linearRampToValueAtTime(1, t0 + (fi - outStart));
    }
    if (fo > 0) {
      const foStart = Math.max(0, left - fo);
      g.setValueAtTime(1, t0 + foStart);
      g.linearRampToValueAtTime(0.0001, t0 + left);
    }
  }

  /* ---------------- source loading ---------------- */
  function updateSrcInfo(text) {
    srcInfo.textContent = text;
  }

  function setDuration(d) {
    sourceDur = Math.max(0.5, d || DEMO_DURATION);
    S.trimStart = 0;
    S.trimEnd = sourceDur;
    updateTrimUI();
    dirty = true;
  }

  function updateTrimUI() {
    trimStartEl.step = '0.05';
    trimEndEl.step = '0.05';
    trimStartEl.min = '0';
    trimEndEl.min = '0';
    trimStartEl.max = sourceDur.toFixed(2);
    trimEndEl.max = sourceDur.toFixed(2);
    trimStartEl.value = S.trimStart.toFixed(2);
    trimEndEl.value = S.trimEnd.toFixed(2);
    trimStartLabel.textContent = fmtTime(S.trimStart);
    trimEndLabel.textContent = fmtTime(S.trimEnd);
    trimDurLabel.textContent = fmtTime(S.trimEnd - S.trimStart);
    outTrimStart.textContent = fmtTime(S.trimStart);
    outTrimEnd.textContent = fmtTime(S.trimEnd);
    updateSpeedHint();
  }

  function applyTrimToSource() {
    if (mode === 'video') {
      if (video.currentTime < S.trimStart || video.currentTime > S.trimEnd) {
        try { video.currentTime = S.trimStart; } catch (e) { /* noop */ }
      }
    } else if (demoAbs < S.trimStart || demoAbs > S.trimEnd) {
      demoAbs = S.trimStart;
    }
    dirty = true;
  }

  function loadFile(file) {
    if (!file) return;
    if (exp) { toast('내보내기 중에는 영상을 바꿀 수 없어요'); return; }
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) {
      toast('영상 파일을 선택해 주세요');
      return;
    }
    if (objURL) URL.revokeObjectURL(objURL);
    objURL = URL.createObjectURL(file);
    pendingName = file.name;
    srcFile = file;
    // 새 영상이면 이전 무음 분석 결과를 버린다
    S.autocut.windows = [];
    S.autocut.analyzed = false;
    cutRuns = [];
    updateAutoInfo();
    resetCuts(true);      // 구간이 바뀌므로 컷 분할도 초기화
    durProbe = false;
    clearTimeout(durTimer);
    mode = 'video';
    playing = false;
    video.pause();
    video.src = objURL;
    try { video.load(); } catch (e) { /* noop */ }
    updateSrcInfo(file.name + ' 불러오는 중…');
    toast('영상을 불러오고 있어요…');
    dirty = true;
    updatePlayBtn();
  }

  function loadDemo() {
    if (exp) { toast('내보내기 중에는 바꿀 수 없어요'); return; }
    mode = 'demo';
    playing = false;
    video.pause();
    demoAbs = 0;
    setDuration(DEMO_DURATION);
    resetCuts(true);
    updateSrcInfo('샘플 데모 영상 · 0:15 · 1280×720');
    dirty = true;
    updatePlayBtn();
    toast('샘플 데모를 불러왔어요. ▶ 를 눌러 보세요');
  }

  function applyLoadedDuration(d) {
    setDuration(d);
    video.playbackRate = S.speed;
    applyPitchToVideo();
    try { video.currentTime = 0; } catch (e) { /* noop */ }
    updateSrcInfo(pendingName + ' · ' + fmtTime(d) + ' · ' + video.videoWidth + '×' + video.videoHeight);
    dirty = true;
  }

  video.addEventListener('loadedmetadata', function () {
    if (mode !== 'video') return;
    const d = video.duration;
    if (isFinite(d) && d > 0) {
      applyLoadedDuration(d);
      return;
    }
    // MediaRecorder로 만든 webm 등은 길이가 Infinity/NaN → 끝까지 탐색해 길이를 확정
    durProbe = true;
    clearTimeout(durTimer);
    durTimer = setTimeout(function () {
      if (durProbe && mode === 'video') {
        durProbe = false;
        applyLoadedDuration(DEMO_DURATION);
        toast('영상 길이 정보를 읽지 못해 15초로 맞췄어요. 구간을 직접 조절해 주세요.');
      }
    }, 2500);
    try { video.currentTime = 1e7; } catch (e) { /* noop */ }
  });

  video.addEventListener('durationchange', function () {
    if (mode !== 'video' || !durProbe) return;
    const d = video.duration;
    if (isFinite(d) && d > 0) {
      durProbe = false;
      clearTimeout(durTimer);
      applyLoadedDuration(d);
    }
  });
  video.addEventListener('seeked', function () { dirty = true; });
  video.addEventListener('loadeddata', function () { dirty = true; });
  video.addEventListener('error', function () {
    if (mode === 'video') toast('이 영상 형식은 브라우저가 읽지 못해요. mp4(H.264)로 바꿔 보세요.');
  });

  /* ---------------- export ---------------- */
  function supportsExport() {
    return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
  }
  function pickMime(hasAudio) {
    if (!window.MediaRecorder) return '';
    const list = hasAudio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (let i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* noop */ }
    }
    return '';
  }
  function seekVideo(t) {
    return new Promise(function (resolve) {
      let done = false;
      function fin() {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', fin);
        resolve();
      }
      video.addEventListener('seeked', fin);
      try { video.currentTime = t; } catch (e) { fin(); }
      setTimeout(fin, 1500);
    });
  }
  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  async function startExport() {
    if (exp) return;
    if (!supportsExport()) {
      showCap('이 브라우저는 영상 녹화(MediaRecorder)를 지원하지 않아요. Chrome 또는 삼성 인터넷 최신 버전에서 열어 주세요.');
      toast('이 브라우저는 영상 저장을 지원하지 않아요');
      return;
    }
    if (mode === 'video' && !video.videoWidth) { toast('영상을 아직 불러오는 중이에요. 잠시 후 다시 시도해 주세요.'); return; }
    const seg = S.trimEnd - S.trimStart;
    if (seg < 0.4) { toast('자르기 구간이 0.4초 이상이어야 해요'); return; }
    const segs = segments();
    if (keptDuration() < 0.4) { toast('남는 구간이 0.4초도 안 돼요. 무음 기준을 조금 낮춰 주세요'); return; }

    const portrait = S.aspect === '9:16';
    const hd = S.quality === '1080';
    const cvs = document.createElement('canvas');
    cvs.width = portrait ? (hd ? 1080 : 720) : (hd ? 1920 : 1280);
    cvs.height = portrait ? (hd ? 1920 : 1280) : (hd ? 1080 : 720);
    const ectx = cvs.getContext('2d', { alpha: false });

    let stream;
    try {
      stream = cvs.captureStream(30);
    } catch (e) {
      showCap('캔버스 녹화를 시작할 수 없어요: ' + (e && e.message ? e.message : e));
      return;
    }

    let graph = null;
    let hasAudio = false;
    let note = '';
    const wantsAudio = mode === 'video' || S.bgm.on || (S.sfx.id && S.sfx.id !== 'none');
    if (wantsAudio) {
      try {
        graph = ensureAudioGraph();
        if (graph) {
          await graph.ctx.resume();
          graph.mon.gain.value = 0;
          applyAudioLevels();
          graph.dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
          hasAudio = true;
        }
      } catch (e) {
        hasAudio = false;
        graph = null;
        note = '오디오를 잡지 못해 무음으로 저장했습니다.';
      }
    } else {
      note = '샘플 데모에는 소리가 없어요.';
    }

    const mime = pickMime(hasAudio);
    const opts = { videoBitsPerSecond: hd ? 9000000 : 4500000 };
    if (mime) opts.mimeType = mime;
    if (hasAudio) opts.audioBitsPerSecond = 128000;

    let recorder;
    try {
      recorder = new MediaRecorder(stream, opts);
    } catch (e) {
      try {
        recorder = new MediaRecorder(stream);
      } catch (e2) {
        showCap('녹화기를 시작할 수 없어요: ' + (e2 && e2.message ? e2.message : e2));
        if (graph) try { graph.mon.gain.value = 1; } catch (e3) { /* noop */ }
        return;
      }
    }

    // prepare playback position
    video.pause();
    playing = false;
    const firstSrc = segs.length ? segs[0][0] : S.trimStart;
    if (mode === 'video') {
      await seekVideo(firstSrc);
      video.playbackRate = clamp(speedAtSrc(firstSrc), 0.0625, 16);
      applyPitchToVideo();
    } else {
      demoAbs = firstSrc;
    }

    const E = {
      cvs: cvs,
      ctx: ectx,
      recorder: recorder,
      chunks: [],
      duration: totalOut(),
      startedAt: performance.now(),
      cancelled: false,
      stream: stream,
      graph: graph,
      hasAudio: hasAudio,
      mime: recorder.mimeType || mime || 'video/webm',
      note: note
    };
    exp = E;

    recorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) E.chunks.push(ev.data);
    };
    recorder.onstop = function () { finalizeExport(E); };
    recorder.onerror = function (ev) {
      showCap('녹화 중 오류가 났어요: ' + ((ev.error && ev.error.message) || '알 수 없는 오류'));
      endExport(true);
    };

    btnExport.hidden = true;
    btnCancelExport.hidden = false;
    progressWrap.hidden = false;
    progressFill.style.width = '0%';
    progressText.textContent = '녹화 시작…';
    recBadge.hidden = false;
    resultCard.hidden = true;

    // 녹화 시작 전에 첫 프레임을 미리 그려 두어 시작 구간이 비지 않게 한다
    drawScene(E.ctx, E.cvs.width, E.cvs.height, 0, { guide: false });
    await new Promise(function (r) { setTimeout(r, hd ? 350 : 200); });

    try {
      E.recorder.start(200);
    } catch (e) {
      showCap('녹화를 시작할 수 없어요: ' + (e && e.message ? e.message : e));
      exp = null;
      resetExportUI();
      return;
    }

    if (graph) {
      const t0 = graph.ctx.currentTime + 0.06;
      scheduleFades(t0, 0);
      startBgm(t0);
      scheduleSfx(t0, 0, graph.sfxNodes);
    }

    if (mode === 'video') {
      try { await video.play(); } catch (e) { /* noop */ }
    }
    playing = true;
    updatePlayBtn();
    dirty = true;
    progressText.textContent = '녹화 중…';
  }

  function updateExportProgress() {
    if (!exp) return;
    const E = exp;
    const t = outTime();
    const p = clamp(t / E.duration, 0, 1);
    progressFill.style.width = (p * 100).toFixed(1) + '%';
    progressText.textContent = '녹화 중… ' + Math.round(p * 100) + '% · 남은 ' + fmtTime(Math.max(0, E.duration - t));
    if (t >= E.duration - 0.02) {
      if (!E.holdStart) {
        // 마지막 프레임을 잠시 붙잡아 인코더가 꼬리를 flush 하도록 한다
        E.holdStart = performance.now();
        playing = false;
        try { video.pause(); } catch (e) { /* noop */ }
        dirty = true;
      } else if (performance.now() - E.holdStart >= 180) {
        endExport(false);
      }
    }
  }

  function endExport(cancelled) {
    if (!exp) return;
    const E = exp;
    E.cancelled = !!cancelled;
    exp = null;
    playing = false;
    try { video.pause(); } catch (e) { /* noop */ }
    if (E.graph) { try { E.graph.mon.gain.value = 1; } catch (e) { /* noop */ } }
    stopBgm();
    stopSfx();
    try {
      E.recorder.stop();
    } catch (e) {
      finalizeExport(E);
      return;
    }
    resetExportUI();
  }

  function resetExportUI() {
    btnExport.hidden = false;
    btnCancelExport.hidden = true;
    recBadge.hidden = true;
    updatePlayBtn();
  }

  function finalizeExport(E) {
    // 캔버스 영상 트랙만 정리한다. 오디오는 재사용하는 공용 트랙이라 stop 하면
    // 다음 내보내기부터 소리가 사라진다.
    try { E.stream.getVideoTracks().forEach(function (tr) { tr.stop(); }); } catch (e) { /* noop */ }
    progressWrap.hidden = true;
    resetExportUI();

    if (E.cancelled) {
      progressText.textContent = '내보내기를 취소했어요';
      return;
    }
    if (!E.chunks.length) {
      showCap('녹화된 데이터가 없어요. 화면을 켜 둔 채 다시 시도해 주세요.');
      return;
    }
    const blob = new Blob(E.chunks, { type: E.mime });
    if (!blob.size) {
      showCap('빈 파일이 만들어졌어요. 다른 브라우저(Chrome)에서 다시 시도해 주세요.');
      return;
    }
    if (resultURL) URL.revokeObjectURL(resultURL);
    resultURL = URL.createObjectURL(blob);
    const name = 'shorts-' + E.cvs.width + 'x' + E.cvs.height + '-' + stamp() + '.webm';
    dlLink.href = resultURL;
    dlLink.download = name;
    resultVideo.src = resultURL;
    resultMeta.textContent = (blob.size / 1048576).toFixed(1) + 'MB · ' + fmtTime(E.duration) +
      ' · ' + E.cvs.width + '×' + E.cvs.height + (E.hasAudio ? '' : ' · 무음');
    resultCard.hidden = false;

    const a = document.createElement('a');
    a.href = resultURL;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    toast('영상이 저장됐어요 (.webm)');
    if (E.note) showCap(E.note + ' 파일은 아래에서 다시 저장할 수 있어요.');
  }

  function showCap(msg) {
    capNote.innerHTML = '';
    capNote.textContent = msg;
    capNote.className = 'hint warn';
  }

  /* ---------------- MP4 작업 JSON (motion-library/render_mp4.py --job) ---------------- */
  function jobOutputSize() {
    const q = S.quality === '720' ? 720 : 1080;
    return S.aspect === '9:16' ? q + 'x' + (q === 720 ? 1280 : 1920) : (q === 720 ? 1280 : 1920) + 'x' + q;
  }

  function buildJob() {
    const dur = Math.round(Math.max(0.4, totalOut() || DEMO_DURATION) * 100) / 100;
    const pid = subPresetId();
    const theme = S.ov.sub.theme || 'reels-dark';
    return {
      schema: 'korean-motion-library/job@1',
      generator: 'shorts-editor-webapp',
      created: new Date().toISOString(),
      video: 'shorts-source.mp4',
      preset: pid,
      theme: theme,
      cues: [{ start: 0, end: dur, text: (S.ov.sub.text || '').trim(), preset: pid }],
      out: 'shorts-out.mp4',
      engine: 'both',
      fps: 30,
      size: jobOutputSize(),
      crf: 18,
      scrim: false,
      // 미리보기와 같은 위치·폭·줄수·글자크기 (1080x1920 기준 비율)
      layout: { centerY: 0.835, maxWidth: 0.86, maxLines: 4, sizeRatio: 0.056 },
      // 웹앱에서 고른 폰트/자간/행간/글자색을 그대로 넘긴다
      theme_overrides: {
        font: JOB_FONT[S.font] || JOB_FONT.sans,
        sizeRatio: 0.056,
        lineHeight: Number(S.lh) || 1.45,
        letterSpacing: Math.round(((S.ls || 0) / (0.0575 * 1080)) * 10000) / 10000,
        colors: { text: S.ov.sub.color || '#ffffff' }
      },
      webapp: {
        trim: [S.trimStart, S.trimEnd],
        speed: S.speed,
        autocut: !!S.autocut.on,
        cut_count: cutCount(),
        cut_points: cutPoints(),
        font: S.font,
        letterSpacingPx: S.ls,
        lineHeight: Number(S.lh) || 1.45,
        note: '자막 시간은 자르기·배속이 적용된 결과 영상 기준입니다. video 값을 실제 파일 이름으로 고친 뒤 실행하세요.'
      },
      // 결과 영상의 소리에 적용된 처리(PC 스킬의 FFmpeg 레시피와 맞물리는 값)
      audio_fx: {
        speed_ramp: {
          mode: S.speedRamp.mode,
          name: RAMP_NAME[S.speedRamp.mode] || '램프 없음',
          strength: S.speedRamp.mode === 'none' ? 0 : S.speedRamp.strength / 100,
          span: S.speedRamp.span / 100,
          speed_min: Number((S.speed * (1 - (S.speedRamp.mode === 'none' ? 0 : S.speedRamp.strength / 100))).toFixed(3)),
          speed_max: Number((S.speed * (1 + (S.speedRamp.mode === 'none' ? 0 : S.speedRamp.strength / 100))).toFixed(3)),
          out_duration: Math.round(totalOut() * 100) / 100
        },
        pitch: { lock: !!S.pitch.lock, semitones: S.pitch.semi || 0 },
        denoise: { on: !!S.denoise.on, strength: S.denoise.strength / 100, chain: 'highpass+notch60+highshelf' },
        level: { on: !!S.level.on, strength: S.level.strength / 100, chain: 'agc+compressor+limiter' },
        duck: { on: !!S.duck.on, depth: S.duck.depth / 100 },
        ffmpeg_hint: 'speed_ramp 는 references/ffmpeg-recipes.md 22번, pitch 는 23번, denoise/loudness 는 24번 레시피' 
      },
      help: 'python3 render_mp4.py --job shorts-job.json — 영상 경로는 video 값, 결과 파일은 out 값입니다.'
    };
  }

  function downloadJob() {
    const job = buildJob();
    const blob = new Blob([JSON.stringify(job, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shorts-job.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('shorts-job.json 을 저장했어요');
    const note = $('#jobNote');
    if (note) {
      note.innerHTML = '';
      note.textContent = '저장됨 · 자막 ' + (job.preset === 'none' ? '없음' : job.preset) + ' · 테마 ' + job.theme +
        ' · ' + job.size + ' · ' + job.cues[0].end.toFixed(2) + '초';
    }
  }

  function setCapabilityNote() {
    if (!supportsExport()) {
      capNote.className = 'hint warn';
      capNote.textContent = '이 브라우저는 영상 저장(MediaRecorder)을 지원하지 않아요. Chrome 또는 삼성 인터넷 최신 버전에서 열어 주세요.';
      return;
    }
    capNote.className = 'hint';
    capNote.textContent = '이 브라우저는 영상 저장을 지원해요. ' + S.aspect + ' · ' + S.quality + 'p ('
      + (S.aspect === '9:16' ? (S.quality === '1080' ? '1080×1920' : '720×1280') : (S.quality === '1080' ? '1920×1080' : '1280×720'))
      + ') 로 저장됩니다.';
  }

  /* ---------------- ui sync ---------------- */
  function updateOutputs() {
    $$('input[type=range][data-bind]').forEach(function (el) {
      const out = document.querySelector('output[data-out="' + el.dataset.bind + '"]');
      if (out) out.textContent = el.value + (out.dataset.unit || '');
    });
  }

  function syncSegs() {
    $$('#segSpeed button').forEach(function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.speed) - S.speed) < 1e-4); });
    $$('#microSpeed button').forEach(function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.speed) - S.speed) < 1e-4); });
    if (speedFineEl) speedFineEl.value = String(S.speed);
    if (outSpeedFine) outSpeedFine.textContent = speedLabel(S.speed);
    $$('#segFont button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.font); });
    $$('#segFadeIn button').forEach(function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.v) - S.audio.fadeIn) < 1e-6); });
    $$('#segFadeOut button').forEach(function (b) { b.classList.toggle('on', Math.abs(Number(b.dataset.v) - S.audio.fadeOut) < 1e-6); });
    $$('#segSfx button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.sfx.id); });
    $$('#segSfxAt button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.sfx.at); });
    const oLs = $('#outLs');
    if (oLs) oLs.textContent = (S.ls > 0 ? '+' : '') + Math.round(S.ls) + 'px';
    const oLh = $('#outLh');
    if (oLh) oLh.textContent = Number(S.lh).toFixed(2);
    $$('#segAspect button').forEach(function (b) { b.classList.toggle('on', b.dataset.aspect === S.aspect); });
    $$('#segRamp .chip').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.speedRamp.mode); });
    const oRs = $('#outRampStrength');
    if (oRs) oRs.textContent = S.speedRamp.strength + '%';
    const oRp = $('#outRampSpan');
    if (oRp) oRp.textContent = S.speedRamp.span + '%';
    const oPs = $('#outPitchSemi');
    if (oPs) oPs.textContent = ((S.pitch.semi || 0) > 0 ? '+' : '') + (S.pitch.semi || 0) + ' st';
    const oDn = $('#outDnStrength');
    if (oDn) oDn.textContent = S.denoise.strength + '%';
    const oLv = $('#outLvStrength');
    if (oLv) oLv.textContent = S.level.strength + '%';
    const oDk = $('#outDuckDepth');
    if (oDk) oDk.textContent = S.duck.depth + '%';
    $$('#segQuality button').forEach(function (b) { b.classList.toggle('on', b.dataset.q === S.quality); });
    $$('#segSubStyle button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.ov.sub.style); });
    $$('#segSubTheme button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.ov.sub.theme); });
    $$('#presets .chip').forEach(function (b) { b.classList.toggle('on', b.dataset.preset === S.preset); });
    $('#btnSafe').classList.toggle('primary', S.safe);
    $('#btnSafe').classList.toggle('ghost', !S.safe);
  }

  function syncUI() {
    $$('[data-bind]').forEach(function (el) {
      const v = getPath(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (v != null) el.value = v;
    });
    updateOutputs();
    updateTrimUI();
    syncSegs();
  }

  function applyAspect() {
    const portrait = S.aspect === '9:16';
    preview.width = portrait ? 720 : 1280;
    preview.height = portrait ? 1280 : 720;
    document.body.classList.toggle('wide', !portrait);
    setCapabilityNote();
    dirty = true;
  }

  function setSpeed(v) {
    // 0.01 단위 그대로 보관한다(1.02x = 1.02). 반올림은 0.01 자리까지만.
    const n = clamp(Math.round((Number(v) || 1) * 100) / 100, 0.5, 2);
    S.speed = n;
    if (mode === 'video') {
      try { video.playbackRate = clamp(speedAtSrc(srcPos()), 0.0625, 16); } catch (e) { /* noop */ }
    }
    syncSegs();
    speedChip.textContent = speedLabel(n);
    updateSpeedHint();
    dirty = true;
  }

  /* ---------------- 무음 분석 / BGM ---------------- */
  function updateAutoInfo() {
    const el = $('#acInfo');
    if (!el) return;
    const a = S.autocut;
    if (!a.windows.length) {
      el.textContent = mode === 'video'
        ? '영상을 불러왔어요. ‘무음 분석’을 누르면 말이 없는 구간을 찾습니다.'
        : '영상을 선택한 뒤 무음 분석을 눌러 주세요. (샘플 데모에는 소리가 없어요)';
      el.className = 'hint';
      updateSpeedHint();
      return;
    }
    const st = cutStats();
    el.textContent = (a.on ? '자동 컷 켜짐 · ' : '분석 완료(켜면 적용) · ')
      + '무음 ' + st.count + '곳 · ' + st.removed.toFixed(2) + '초 제거 → 남는 길이 '
      + fmtSec1(st.kept) + ' (원본 ' + fmtSec1(st.span) + ')';
    el.className = 'hint' + (a.on ? ' ok' : '');
    updateSpeedHint();
  }

  function analyzeSilence() {
    const a = S.autocut;
    if (mode !== 'video' || !srcFile) { toast('먼저 영상을 선택해 주세요'); return Promise.resolve(); }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('이 브라우저는 무음 분석을 지원하지 않아요'); return Promise.resolve(); }
    toast('소리를 분석하는 중이에요…');
    const file = srcFile;
    return file.arrayBuffer().then(function (buf) {
      const ac = new AC();
      return ac.decodeAudioData(buf).then(function (ab) {
        const data = ab.getChannelData(0);
        const hop = 0.02;
        const n = Math.max(1, Math.floor(hop * ab.sampleRate));
        const w = [];
        for (let i = 0; i + n <= data.length; i += n) {
          let sum = 0;
          for (let j = 0; j < n; j++) sum += data[i + j] * data[i + j];
          w.push(20 * Math.log10(Math.sqrt(sum / n) + 1e-8));
        }
        a.windows = w;
        a.analyzed = true;
        computeCuts();
        updateAutoInfo();
        dirty = true;
        try { ac.close(); } catch (e) { /* noop */ }
        const st = cutStats();
        toast('무음 ' + st.count + '곳을 찾았어요 (' + st.removed.toFixed(1) + '초)');
      }).catch(function () {
        try { ac.close(); } catch (e) { /* noop */ }
        toast('이 영상의 소리를 읽지 못했어요 (무음 트랙이거나 지원 밖 형식)');
      });
    }).catch(function () {
      toast('영상 파일을 다시 선택해 주세요');
    });
  }

  function loadBgmFile(file) {
    if (!file) return;
    const g = ensureAudioGraph();
    if (!g) { toast('이 브라우저는 배경음악을 지원하지 않아요'); return; }
    file.arrayBuffer().then(function (buf) {
      return g.ctx.decodeAudioData(buf);
    }).then(function (ab) {
      bgmBuffer = ab;
      S.bgm.name = file.name;
      S.bgm.on = true;
      const box = $('input[data-bind="bgm.on"]');
      if (box) box.checked = true;
      const el = $('#bgmName');
      if (el) el.textContent = file.name + ' · ' + fmtSec1(ab.duration);
      applyAudioLevels();
      toast('배경음악을 불러왔어요 (' + fmtSec1(ab.duration) + ')');
    }).catch(function () {
      toast('이 오디오 파일은 읽지 못했어요 (mp3·m4a·wav·ogg)');
    });
  }

  /* ---------------- bindings ---------------- */
  function buildBindings() {
    $$('[data-bind]').forEach(function (el) {
      const path = el.dataset.bind;
      const isRange = el.type === 'range';
      const isCheck = el.type === 'checkbox';
      el.addEventListener('input', function () {
        const v = isCheck ? el.checked : (isRange ? Number(el.value) : el.value);
        setPath(path, v);
        if (isRange) {
          updateOutputs();
          if (path.indexOf('filter.') === 0) { S.preset = ''; syncSegs(); }
        }
        // 댓글 카드·코너 라벨은 컷이 2개 이상이면 지금 고른 컷에 같이 저장한다
        if (path.indexOf('ov.comment.') === 0 || path.indexOf('ov.corner.') === 0) saveCutOverlay();
        dirty = true;
      });
      if (isCheck) {
        el.addEventListener('change', function () { dirty = true; });
        el.addEventListener('click', function (e) { e.stopPropagation(); });
      }
    });

    // tabs
    $$('#tabs .tab').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#tabs .tab').forEach(function (x) { x.classList.toggle('on', x === b); });
        $$('.panel').forEach(function (p) { p.classList.toggle('on', p.id === 'panel-' + b.dataset.tab); });
        if (b.dataset.tab === 'export') setCapabilityNote();
      });
    });

    // play / seek
    btnPlay.addEventListener('click', function () { setPlaying(!playing); });
    timebar.addEventListener('pointerdown', function (e) {
      const r = timebar.getBoundingClientRect();
      const frac = clamp((e.clientX - r.left) / r.width, 0, 1);
      seekTo(S.trimStart + (S.trimEnd - S.trimStart) * frac);
    });
    timebar.addEventListener('keydown', function (e) {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(srcPos() + (e.key === 'ArrowLeft' ? -step : step));
      }
    });

    // files
    ['fileInput', 'fileInputTop'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', function (e) {
        const f = e.target.files && e.target.files[0];
        if (f) loadFile(f);
        try { e.target.value = ''; } catch (err) { /* noop */ }
      });
    });
    $('#btnDemo').addEventListener('click', loadDemo);
    $('#btnDemo2').addEventListener('click', loadDemo);
    $('#btnSafe').addEventListener('click', function () {
      S.safe = !S.safe;
      const box = $('input[data-bind="safe"]');
      if (box) box.checked = S.safe;
      syncSegs();
      dirty = true;
    });

    // trim
    trimStartEl.addEventListener('input', function () {
      let v = Number(trimStartEl.value);
      if (v > S.trimEnd - 0.4) v = Math.max(0, S.trimEnd - 0.4);
      S.trimStart = v;
      updateTrimUI();
      applyTrimToSource();
    });
    trimEndEl.addEventListener('input', function () {
      let v = Number(trimEndEl.value);
      if (v < S.trimStart + 0.4) v = Math.min(sourceDur, S.trimStart + 0.4);
      S.trimEnd = v;
      updateTrimUI();
      applyTrimToSource();
    });
    $('#btnFullRange').addEventListener('click', function () {
      S.trimStart = 0;
      S.trimEnd = sourceDur;
      updateTrimUI();
      dirty = true;
    });
    $('#btnTrimToNow').addEventListener('click', function () {
      S.trimStart = clamp(srcPos(), 0, Math.max(0, S.trimEnd - 0.4));
      updateTrimUI();
      dirty = true;
    });

    // 자동 무음 컷
    const acThr = $('#acThr'), acMin = $('#acMin');
    if (acThr) acThr.addEventListener('input', function () {
      S.autocut.thr = Number(acThr.value);
      $('#outAcThr').textContent = S.autocut.thr + ' dB';
      computeCuts(); updateAutoInfo(); dirty = true;
    });
    if (acMin) acMin.addEventListener('input', function () {
      S.autocut.minSil = Number(acMin.value);
      $('#outAcMin').textContent = Number(acMin.value).toFixed(2) + '초';
      computeCuts(); updateAutoInfo(); dirty = true;
    });
    const acOn = $('input[data-bind="autocut.on"]');
    if (acOn) acOn.addEventListener('change', function () {
      S.autocut.on = acOn.checked;
      if (acOn.checked && !S.autocut.analyzed) {
        analyzeSilence().then(function () { computeCuts(); updateAutoInfo(); dirty = true; });
      }
      computeCuts();
      updateAutoInfo();
      if (S.autocut.on && cutRuns.length) {
        const segs = segments();
        if (segs.length) { try { video.currentTime = segs[0][0]; } catch (e) { /* noop */ } }
      }
      dirty = true;
    });
    const btnAnalyze = $('#btnAnalyze');
    if (btnAnalyze) btnAnalyze.addEventListener('click', function () { analyzeSilence(); });

    // 컷(씬) 분할
    const btnCutAdd = $('#btnCutAdd');
    if (btnCutAdd) btnCutAdd.addEventListener('click', function () {
      if (addCutPoint(outTime())) {
        toast(cutCount() + '컷으로 나눴어요 · 오버레이 탭에서 컷별 댓글 카드를 넣을 수 있어요');
      }
    });
    const btnCutClear = $('#btnCutClear');
    if (btnCutClear) btnCutClear.addEventListener('click', function () { resetCuts(false); });
    $$('#segCutEvery .chip').forEach(function (b) {
      b.addEventListener('click', function () { applyEvenSplit(Number(b.dataset.v)); });
    });
    const sceneSens = $('#sceneSens'), sceneStep = $('#sceneStep');
    if (sceneSens) sceneSens.addEventListener('input', function () {
      S.cut.sens = Number(sceneSens.value);
      const o = $('#outSceneSens');
      if (o) o.textContent = S.cut.sens + '%';
    });
    if (sceneStep) sceneStep.addEventListener('input', function () {
      S.cut.step = Number(sceneStep.value);
      const o = $('#outSceneStep');
      if (o) o.textContent = S.cut.step.toFixed(2) + '초';
    });
    if (btnSceneScan) btnSceneScan.addEventListener('click', function () { scanScenes(); });
    if (btnSceneApply) btnSceneApply.addEventListener('click', function () { applyFoundCuts(); });
    const btnCopyCut = $('#btnCopyCut');
    if (btnCopyCut) btnCopyCut.addEventListener('click', copyCutToAll);

    // 오디오 · 페이드 · BGM
    const audVol = $('#audVol');
    if (audVol) audVol.addEventListener('input', function () { S.audio.vol = Number(audVol.value); applyAudioLevels(); });
    ['in', 'out'].forEach(function (k) {
      const seg = $('#segFade' + (k === 'in' ? 'In' : 'Out'));
      if (!seg) return;
      $$('#segFade' + (k === 'in' ? 'In' : 'Out') + ' button').forEach(function (b) {
        b.addEventListener('click', function () {
          if (k === 'in') S.audio.fadeIn = Number(b.dataset.v);
          else S.audio.fadeOut = Number(b.dataset.v);
          syncSegs(); dirty = true;
        });
      });
    });
    const bgmBox = $('input[data-bind="bgm.on"]');
    if (bgmBox) bgmBox.addEventListener('change', function () {
      S.bgm.on = bgmBox.checked;
      applyAudioLevels();
      if (!S.bgm.on) stopBgm();
      else if (playing) { const g = ensureAudioGraph(); if (g) startBgm(g.ctx.currentTime + 0.03); }
      if (S.bgm.on && !bgmBuffer) toast('BGM 파일을 먼저 추가해 주세요');
    });
    const bgmVol = $('#bgmVol');
    if (bgmVol) bgmVol.addEventListener('input', function () { S.bgm.vol = Number(bgmVol.value); applyAudioLevels(); });
    const bgmFile = $('#bgmFile');
    if (bgmFile) bgmFile.addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (f) loadBgmFile(f);
      try { e.target.value = ''; } catch (err) { /* noop */ }
    });

    // 스피드 램프
    $$('#segRamp .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        S.speedRamp.mode = b.dataset.v;
        syncSegs();
        updateSpeedHint();
        dirty = true;
      });
    });
    const rampStrength = $('#rampStrength'), rampSpan = $('#rampSpan');
    if (rampStrength) rampStrength.addEventListener('input', function () {
      S.speedRamp.strength = Number(rampStrength.value);
      const o = $('#outRampStrength');
      if (o) o.textContent = S.speedRamp.strength + '%';
      updateSpeedHint(); dirty = true;
    });
    if (rampSpan) rampSpan.addEventListener('input', function () {
      S.speedRamp.span = Number(rampSpan.value);
      const o = $('#outRampSpan');
      if (o) o.textContent = S.speedRamp.span + '%';
      updateSpeedHint(); dirty = true;
    });

    // 피치 · 노이즈 제거 · 오토 레벨링 · 오토더킹
    const pitchSemi = $('#pitchSemi');
    if (pitchSemi) pitchSemi.addEventListener('input', function () {
      S.pitch.semi = Number(pitchSemi.value);
      const o = $('#outPitchSemi');
      if (o) o.textContent = (S.pitch.semi > 0 ? '+' : '') + S.pitch.semi + ' st';
      if (audioGraph) wireVoice(audioGraph);
      updateSpeedHint(); dirty = true;
    });
    const lockBox = $('input[data-bind="pitch.lock"]');
    if (lockBox) lockBox.addEventListener('change', function () {
      applyPitchToVideo();
      updateSpeedHint();
    });
    [
      { id: 'dnStrength', key: 'denoise', prop: 'strength', out: 'outDnStrength' },
      { id: 'lvStrength', key: 'level', prop: 'strength', out: 'outLvStrength' },
      { id: 'duckDepth', key: 'duck', prop: 'depth', out: 'outDuckDepth' }
    ].forEach(function (f) {
      const el = $('#' + f.id);
      if (!el) return;
      el.addEventListener('input', function () {
        S[f.key][f.prop] = Number(el.value);
        const o = $('#' + f.out);
        if (o) o.textContent = el.value + '%';
        if (f.key === 'duck') applyAudioLevels();
        else if (audioGraph) wireVoice(audioGraph);
        dirty = true;
      });
    });
    ['denoise.on', 'level.on'].forEach(function (p) {
      const el = $('input[data-bind="' + p + '"]');
      if (el) el.addEventListener('change', function () { if (audioGraph) wireVoice(audioGraph); });
    });
    const duckOn = $('input[data-bind="duck.on"]');
    if (duckOn) duckOn.addEventListener('change', function () { applyAudioLevels(); });

    // 글꼴 · 자간 · 행간
    $$('#segFont button').forEach(function (b) {
      b.addEventListener('click', function () { S.font = b.dataset.v; syncSegs(); dirty = true; });
    });
    const lsEl = $('#ls'), lhEl = $('#lh');
    if (lsEl) lsEl.addEventListener('input', function () { S.ls = Number(lsEl.value); syncSegs(); dirty = true; });
    if (lhEl) lhEl.addEventListener('input', function () { S.lh = Number(lhEl.value); syncSegs(); dirty = true; });

    // 효과음
    $$('#segSfx button').forEach(function (b) {
      b.addEventListener('click', function () { S.sfx.id = b.dataset.v; syncSegs(); });
    });
    $$('#segSfxAt button').forEach(function (b) {
      b.addEventListener('click', function () { S.sfx.at = b.dataset.v; syncSegs(); });
    });
    const sfxVol = $('#sfxVol');
    if (sfxVol) sfxVol.addEventListener('input', function () { S.sfx.vol = Number(sfxVol.value); applyAudioLevels(); });
    const btnSfx = $('#btnSfxPreview');
    if (btnSfx) btnSfx.addEventListener('click', function () {
      if (!S.sfx.id || S.sfx.id === 'none') { toast('먼저 효과음을 골라 주세요'); return; }
      const g = ensureAudioGraph();
      if (!g) { toast('이 브라우저는 효과음을 지원하지 않아요'); return; }
      playSfx(g.ctx, g.sfxGain, S.sfx.id, g.ctx.currentTime + 0.02, S.sfx.vol / 100);
    });

    // speed / aspect / quality / subtitle style
    $$('#segSpeed button').forEach(function (b) {
      b.addEventListener('click', function () { setSpeed(Number(b.dataset.speed)); });
    });
    if (speedFineEl) {
      speedFineEl.addEventListener('input', function () { setSpeed(parseFloat(speedFineEl.value)); });
    }
    $$('#microSpeed button').forEach(function (b) {
      b.addEventListener('click', function () { setSpeed(Number(b.dataset.speed)); });
    });
    $$('#segAspect button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.aspect = b.dataset.aspect;
        applyAspect();
        syncSegs();
      });
    });
    $$('#segQuality button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.quality = b.dataset.q;
        syncSegs();
        setCapabilityNote();
      });
    });
    $$('#segSubStyle button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.ov.sub.style = b.dataset.v;
        if (!playing && !exp) subDemoT0 = performance.now();
        syncSegs();
        dirty = true;
      });
    });
    $$('#segSubTheme button').forEach(function (b) {
      b.addEventListener('click', function () {
        S.ov.sub.theme = b.dataset.v;
        if (!playing && !exp) subDemoT0 = performance.now();
        syncSegs();
        dirty = true;
      });
    });
    const btnSaveJob = $('#btnSaveJob');
    if (btnSaveJob) btnSaveJob.addEventListener('click', downloadJob);

    // presets
    $$('#presets .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = PRESETS[b.dataset.preset];
        if (!p) return;
        S.filter = { b: p.b, c: p.c, s: p.s, h: p.h };
        S.preset = b.dataset.preset;
        syncUI();
        dirty = true;
      });
    });
    $('#btnColorReset').addEventListener('click', function () {
      S.filter = { b: 100, c: 100, s: 100, h: 0 };
      S.preset = '기본';
      syncUI();
      dirty = true;
    });
    $('#btnPosReset').addEventListener('click', function () {
      S.zoom = 100; S.offX = 0; S.offY = 0;
      syncUI();
      dirty = true;
    });

    // export
    btnExport.addEventListener('click', startExport);
    btnCancelExport.addEventListener('click', function () { endExport(true); });

    // 미리보기 크게 보기
    const expandBtn = $('#btnExpand');
    function setFull(v) {
      document.body.classList.toggle('preview-full', v);
      expandBtn.textContent = v ? '✕' : '⤢';
      expandBtn.setAttribute('aria-label', v ? '미리보기 원래 크기로' : '미리보기 크게 보기');
      dirty = true;
    }
    expandBtn.addEventListener('click', function (e) { e.stopPropagation(); setFull(!document.body.classList.contains('preview-full')); });
    preview.addEventListener('click', function () {
      if (document.body.classList.contains('preview-full')) setFull(false);
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setFull(false);
    });

    // help modal
    const help = $('#helpModal');
    $('#btnHelp').addEventListener('click', function () { help.hidden = false; });
    $('#btnCloseHelp').addEventListener('click', function () { help.hidden = true; });
    help.addEventListener('click', function (e) { if (e.target === help) help.hidden = true; });

    // keyboard
    window.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(!playing);
      }
    });
    window.addEventListener('resize', function () { dirty = true; });
  }

  /* ---------------- init ---------------- */
  function init() {
    applyAspect();
    buildBindings();
    mode = 'demo';
    demoAbs = 0;
    setDuration(DEMO_DURATION);
    syncUI();
    renderCutUI();
    updateSrcInfo('샘플 데모 영상 · 0:15 · 1280×720');
    setCapabilityNote();
    updatePlayBtn();
    updateAutoInfo();
    paintDemo(0);
    dirty = true;
    requestAnimationFrame(tick);

    // 테스트·디버깅용 읽기 전용 상태 창
    window.__shortsEditor = {
      state: function () { return JSON.parse(JSON.stringify(S)); },
      segments: function () { return segments().map(function (s) { return [s[0], s[1]]; }); },
      totalOut: function () { return totalOut(); },
      cutStats: function () { return cutStats(); },
      fontFamily: function () { return fontFamily(); },
      motion: function () {
        return {
          loaded: !!KM,
          version: KM ? KM.VERSION : null,
          presets: KM ? KM.listPresets().map(function (p) { return p.id; }) : [],
          themes: KM ? KM.listThemes().map(function (t) { return t.id; }) : [],
          current: subPresetId(),
          currentTheme: S.ov.sub.theme || 'reels-dark',
          theme: subTheme()
        };
      },
      job: function () { return buildJob(); },
      // ----- 컷(씬) 분할 디버그/테스트용 -----
      cut: function () {
        return {
          count: cutCount(), pts: cutPoints(), sel: S.cutSel, every: S.cut.every,
          found: (S.cut.found || []).slice(), scanning: cutScanning,
          ranges: (function () { const r = []; for (let i = 0; i < cutCount(); i++) r.push(cutRange(i)); return r; })(),
          overlayCount: S.cutOv.length
        };
      },
      cutIndexAt: function (t) { return cutIndexAt(t === undefined ? outTime() : Number(t)); },
      cutOverlayAt: function (t) {
        const r = cutOverlayAt(t === undefined ? outTime() : Number(t));
        return { cut: r.cut, comment: JSON.parse(JSON.stringify(r.comment)), corner: JSON.parse(JSON.stringify(r.corner)) };
      },
      addCut: function (t) { return addCutPoint(t === undefined ? outTime() : Number(t)); },
      evenSplit: function (s) { return applyEvenSplit(s); },
      resetCuts: function () { resetCuts(true); },
      selectCut: function (i) { selectCut(Number(i)); },
      scanScenes: function () { return scanScenes(); },
      applyFoundCuts: function () { return applyFoundCuts(); },
      sceneThreshold: function (s) { return sceneThreshold(s === undefined ? S.cut.sens : s); },
      sceneDiff: function (a, b) { return grayDiff(Float32Array.from(a), Float32Array.from(b)); },
      // 내보내기가 쓰는 drawScene 을 같은 크기·같은 t 로 그려 보고 지문을 돌려준다
      renderProbe: function (t, w, h) {
        const cw = w || 720, ch = h || 1280;
        const tt = t === undefined ? outTime() : Number(t);
        if (mode === 'demo') { paintDemo(rampTime(tt)); demoPainted = -1; }
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const x = c.getContext('2d', { alpha: false });
        drawScene(x, cw, ch, tt, { guide: false });
        const d = x.getImageData(0, 0, cw, ch).data;
        let hsh = 2166136261;
        for (let i = 0; i < d.length; i += 613) {
          hsh = ((hsh * 16777619) ^ d[i]) >>> 0;
          hsh = ((hsh * 16777619) ^ d[i + 1]) >>> 0;
          hsh = ((hsh * 16777619) ^ d[i + 2]) >>> 0;
        }
        dirty = true;
        return hsh;
      },
      rampTime: function (t) { return rampTime(t); },
      rampState: function () {
        const st = rampState();
        return { total: st.total, flat: st.flat, cum: st.cum.map(function (v) { return Math.round(v * 1000) / 1000; }), segs: st.segs };
      },
      speedAt: function (u) { return speedAt(u); },      speedAtSrc: function (p) { return speedAtSrc(p === undefined ? srcPos() : p); },
      outTime: function () { return outTime(); },
      audioProbe: function (opts) { return audioProbe(opts); },
      updateDuck: function () { updateDuck(); },
      audioState: function () {
        if (!audioGraph) return { graph: false, bgmLoaded: !!bgmBuffer };
        const g = audioGraph;
        return {
          graph: true, state: g.ctx.state,
          orig: g.origGain.gain.value,
          bgm: g.bgmGain.gain.value,
          bgmLoaded: !!bgmBuffer,
          sfx: g.sfxGain.gain.value,
          bgmPlaying: !!g.bgmSrc,
          duck: g.duckGain.gain.value,
          duckEnv: g.duckEnv,
          duckTarget: g.duckTarget,
          chain: g.chain || null,
          worklet: { ready: !!g.workletReady, fail: g.workletFail || null },
          pitchRatio: g.pitchRatio == null ? null : g.pitchRatio,
          pitchFallback: !!(g.chain && g.chain.pitchFallback),
          agcGain: g.agcGain ? g.agcGain.gain.value : null,
          agcTarget: g.agcTarget == null ? null : g.agcTarget,
          pitchLock: !!S.pitch.lock,
          videoPreservesPitch: (typeof video.preservesPitch === 'boolean') ? video.preservesPitch : null,
          videoRate: video.playbackRate
        };
      }
    };
  }

  init();
})();
