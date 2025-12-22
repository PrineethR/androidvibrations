const videoFile = document.getElementById('videoFile');
const video = document.getElementById('video');
const tNow = document.getElementById('tNow');
const tDur = document.getElementById('tDur');

const playBtn = document.getElementById('playBtn');
const armBtn = document.getElementById('armBtn');
const stopVibeBtn = document.getElementById('stopVibeBtn');
const support = document.getElementById('support');

const canvas = document.getElementById('tl');
const ctx = canvas.getContext('2d');

const snapBox = document.getElementById('snap');
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
const clearAll = document.getElementById('clearAll');

const patternInput = document.getElementById('pattern');
const applyPattern = document.getElementById('applyPattern');
const previewPattern = document.getElementById('previewPattern');

const exportJson = document.getElementById('exportJson');
const exportVibrate = document.getElementById('exportVibrate');
const out = document.getElementById('out');

let armed = false;

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
function vibrate(p) {
  if (!canVibrate() || !armed) return;
  navigator.vibrate(p);
}
function stopVibration() {
  if (!canVibrate()) return;
  navigator.vibrate(0);
}

// --- timeline model ---
let clips = []; // {id, t0, t1, pattern:[], firedAt:-1}
let selectedId = null;

let pxPerSec = 180;   // zoom
let leftPad = 60;
let topPad = 22;
let trackY = 60;
let trackH = 60;

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function patternDurationMs(p) {
  return (p || []).reduce((a, b) => a + b, 0);
}
function clipDurationSec(c) {
  // visual duration defaults to pattern duration if set; else 0.4s
  const ms = patternDurationMs(c.pattern);
  return Math.max(0.08, ms ? ms / 1000 : (c.t1 - c.t0));
}

function parsePattern(str) {
  const s = (str || '').trim();
  if (!s) return null;
  try {
    if (s.startsWith('[')) {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr)) return null;
      const cleaned = arr.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 0);
      return cleaned.length ? cleaned : null;
    }
    const cleaned = s.split(',').map(v => parseInt(v.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0);
    return cleaned.length ? cleaned : null;
  } catch {
    return null;
  }
}

function snapSec(t) {
  if (!snapBox.checked) return t;
  const step = 0.1;
  return Math.round(t / step) * step;
}

// --- coordinate transforms ---
function secToX(t) {
  return leftPad + t * pxPerSec;
}
function xToSec(x) {
  return (x - leftPad) / pxPerSec;
}

function getDuration() {
  return Number.isFinite(video.duration) ? video.duration : 30;
}

// --- rendering ---
function draw() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // background grid
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, w, h);

  // timeline bar
  ctx.fillStyle = '#151a2e';
  ctx.fillRect(leftPad, trackY, w - leftPad - 12, trackH);

  // grid lines + time labels
  const dur = getDuration();
  const majorStep = 1; // seconds
  const minorStep = 0.2;

  // minor
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let t = 0; t <= dur; t += minorStep) {
    const x = secToX(t);
    if (x < leftPad || x > w - 12) continue;
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + trackH);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // major + labels
  ctx.fillStyle = '#cfd6ff';
  ctx.font = '12px system-ui';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  for (let t = 0; t <= dur; t += majorStep) {
    const x = secToX(t);
    if (x < leftPad || x > w - 12) continue;
    ctx.beginPath();
    ctx.moveTo(x, topPad);
    ctx.lineTo(x, trackY + trackH);
    ctx.stroke();
    ctx.fillText(`${t}s`, x + 2, topPad + 12);
  }

  // clips
  for (const c of clips) {
    const x0 = secToX(c.t0);
    const x1 = secToX(c.t0 + clipDurationSec(c));
    const y0 = trackY + 10;
    const y1 = trackY + trackH - 10;

    const selected = c.id === selectedId;

    ctx.fillStyle = selected ? '#6ee7ff' : '#7c5cff';
    ctx.globalAlpha = selected ? 0.95 : 0.75;
    roundRect(x0, y0, Math.max(10, x1 - x0), y1 - y0, 8);
    ctx.fill();
    ctx.globalAlpha = 1;

    // resize handle
    ctx.fillStyle = '#0f1220';
    ctx.globalAlpha = 0.65;
    ctx.fillRect(x1 - 6, y0, 6, y1 - y0);
    ctx.globalAlpha = 1;

    // label
    ctx.fillStyle = '#0f1220';
    ctx.font = '12px system-ui';
    const label = c.pattern?.length ? `@${c.t0.toFixed(2)}s  ${JSON.stringify(c.pattern)}` : `@${c.t0.toFixed(2)}s (no pattern)`;
    ctx.fillText(label.slice(0, 42), x0 + 8, y0 + 18);
  }

  // playhead
  const t = video.currentTime || 0;
  const px = secToX(t);
  ctx.strokeStyle = '#ffdd57';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, topPad);
  ctx.lineTo(px, trackY + trackH);
  ctx.stroke();

  requestAnimationFrame(draw);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- hit testing ---
function hitClip(px, py) {
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i];
    const x0 = secToX(c.t0);
    const x1 = secToX(c.t0 + clipDurationSec(c));
    const y0 = trackY + 10;
    const y1 = trackY + trackH - 10;
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
      const nearRight = (x1 - px) < 10;
      return { clip: c, nearRight };
    }
  }
  return null;
}

// --- drag state with pointer capture ---
let drag = null; // {id, mode:'move'|'resize', startX, startT0, startDur}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); // keeps receiving move/up while dragging [web:90]
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  const hit = hitClip(x, y);

  if (hit) {
    selectedId = hit.clip.id;
    const c = hit.clip;
    drag = {
      id: c.id,
      mode: hit.nearRight ? 'resize' : 'move',
      startX: x,
      startT0: c.t0,
      startDur: clipDurationSec(c),
    };
    return;
  }

  // click empty space -> move playhead + create clip
  const t = snapSec(Math.max(0, xToSec(x)));
  video.currentTime = Math.min(getDuration(), t);

  const newClip = { id: uid(), t0: t, t1: t + 0.4, pattern: [], firedAt: -1 };
  clips.push(newClip);
  selectedId = newClip.id;
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const dx = x - drag.startX;

  const c = clips.find(k => k.id === drag.id);
  if (!c) return;

  if (drag.mode === 'move') {
    const dt = dx / pxPerSec;
    c.t0 = snapSec(Math.max(0, drag.startT0 + dt));
  } else {
    const dSec = dx / pxPerSec;
    const newDur = Math.max(0.08, snapSec(drag.startDur + dSec));
    c.t1 = c.t0 + newDur;
  }
});

canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

// delete selected
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && selectedId) {
    clips = clips.filter(c => c.id !== selectedId);
    selectedId = null;
  }
});

// --- video + triggering ---
video.addEventListener('loadedmetadata', () => {
  tDur.textContent = (video.duration || 0).toFixed(3);
});

video.addEventListener('timeupdate', () => {
  const t = video.currentTime || 0;
  tNow.textContent = t.toFixed(3);

  // trigger: if we crossed t0 since last timeupdate (approx)
  // using per-clip firedAt to prevent rapid repeats
  const tol = 0.06;
  for (const c of clips) {
    if (!c.pattern || !c.pattern.length) continue;
    if (Math.abs(t - c.t0) < tol && Math.abs((c.firedAt ?? -999) - c.t0) > 0.2) {
      c.firedAt = c.t0;
      vibrate(c.pattern);
    }
  }
});

// playback controls
playBtn.addEventListener('click', async () => {
  if (video.paused) await video.play();
  else video.pause();
});

armBtn.addEventListener('click', () => {
  armed = true;
  vibrate(10); // user gesture “arms” it
});

stopVibeBtn.addEventListener('click', () => stopVibration());

support.textContent = canVibrate()
  ? 'Vibration API supported (best on Android Chrome).'
  : 'Vibration API not supported on this browser/device.';

// upload
videoFile.addEventListener('change', () => {
  const file = videoFile.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  video.load();
});

// --- editing ---
applyPattern.addEventListener('click', () => {
  const c = clips.find(k => k.id === selectedId);
  if (!c) return alert('Select a clip first.');
  const p = parsePattern(patternInput.value);
  if (!p) return alert('Invalid pattern.');
  c.pattern = p;

  // set visual duration roughly to pattern duration
  const d = Math.max(0.08, patternDurationMs(p) / 1000);
  c.t1 = c.t0 + d;
});

previewPattern.addEventListener('click', () => {
  const c = clips.find(k => k.id === selectedId);
  if (!c || !c.pattern?.length) return alert('Select a clip with a pattern.');
  vibrate(c.pattern);
});

clearAll.addEventListener('click', () => {
  clips = [];
  selectedId = null;
  out.textContent = '';
});

// zoom
zoomIn.addEventListener('click', () => { pxPerSec = Math.min(600, pxPerSec * 1.25); });
zoomOut.addEventListener('click', () => { pxPerSec = Math.max(60, pxPerSec / 1.25); });

// --- export ---
exportJson.addEventListener('click', () => {
  const payload = clips
    .slice()
    .sort((a, b) => a.t0 - b.t0)
    .map(c => ({ t: Number(c.t0.toFixed(3)), pattern: c.pattern || [] }));
  out.textContent = JSON.stringify(payload, null, 2);
});

exportVibrate.addEventListener('click', () => {
  // Flatten into a single sequence from t=0 (approx)
  const sorted = clips.slice().sort((a, b) => a.t0 - b.t0);

  if (!sorted.length) {
    out.textContent = 'navigator.vibrate([]);';
    return;
  }

  let arr = [];
  let cursorMs = 0;

  for (const c of sorted) {
    if (!c.pattern?.length) continue;
    const startMs = Math.max(0, Math.round(c.t0 * 1000));
    const gap = Math.max(0, startMs - cursorMs);

    if (arr.length === 0) arr.push(0);
    arr.push(gap);
    arr = arr.concat(c.pattern);

    cursorMs = startMs + patternDurationMs(c.pattern);
  }

  out.textContent = `navigator.vibrate(${JSON.stringify(arr)});`;
});

// start drawing loop
requestAnimationFrame(draw);
