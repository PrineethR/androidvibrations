const videoFile = document.getElementById('videoFile');
const video = document.getElementById('video');
const seek = document.getElementById('seek');
const timeText = document.getElementById('timeText');
const durText = document.getElementById('durText');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

const patternInput = document.getElementById('patternInput');
const addEventBtn = document.getElementById('addEventBtn');
const previewBtn = document.getElementById('previewBtn');
const eventsTable = document.getElementById('eventsTable');

const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportVibrateBtn = document.getElementById('exportVibrateBtn');
const exportOut = document.getElementById('exportOut');

const armVibrationBtn = document.getElementById('armVibrationBtn');
const supportText = document.getElementById('supportText');

let events = []; // { id, t, pattern }
let lastTime = 0;
let armed = false;

// ---- helpers ----
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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
    const cleaned = s.split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 0);
    return cleaned.length ? cleaned : null;
  } catch {
    return null;
  }
}

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function stopVibrations() {
  if (canVibrate()) navigator.vibrate(0);
}

function vibrate(pattern) {
  if (!canVibrate()) return;
  // Many browsers require a user activation/gesture before vibrations are allowed.
  if (!armed) return;
  navigator.vibrate(pattern);
}

function renderEvents() {
  events.sort((a, b) => a.t - b.t);
  eventsTable.innerHTML = '';

  for (const ev of events) {
    const tr = document.createElement('tr');

    const tdT = document.createElement('td');
    tdT.textContent = ev.t.toFixed(3);

    const tdP = document.createElement('td');
    tdP.textContent = JSON.stringify(ev.pattern);

    const tdA = document.createElement('td');

    const goBtn = document.createElement('button');
    goBtn.textContent = 'Seek';
    goBtn.onclick = () => { video.currentTime = ev.t; };

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.onclick = () => vibrate(ev.pattern);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => {
      events = events.filter(x => x.id !== ev.id);
      renderEvents();
    };

    tdA.append(goBtn, playBtn, delBtn);
    tr.append(tdT, tdP, tdA);
    eventsTable.appendChild(tr);
  }
}

// ---- video upload ----
videoFile.addEventListener('change', () => {
  const file = videoFile.files && videoFile.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  video.load();
});

// metadata -> duration/seek max
video.addEventListener('loadedmetadata', () => {
  seek.max = String(video.duration || 0);
  durText.textContent = (video.duration || 0).toFixed(3);
});

// timeline (scrub) -> set currentTime
seek.addEventListener('input', () => {
  video.currentTime = Number(seek.value); // uses HTMLMediaElement.currentTime [web:73]
});

// update UI and trigger events
video.addEventListener('timeupdate', () => {
  const t = video.currentTime;
  timeText.textContent = t.toFixed(3);
  seek.value = String(t);

  // trigger events when playhead crosses their start time
  // small tolerance because timeupdate isn't sample-accurate.
  const tol = 0.06;

  // if user scrubbed backwards, reset lastTime
  if (t < lastTime) lastTime = t;

  for (const ev of events) {
    if (ev.t >= lastTime - tol && ev.t <= t + tol) {
      // avoid double-triggering if timeupdate fires multiple times around the same t
      if (!ev._firedAt || Math.abs(ev._firedAt - t) > 0.2) {
        ev._firedAt = t;
        vibrate(ev.pattern);
      }
    }
  }

  lastTime = t;
});

// basic play/pause
playBtn.addEventListener('click', async () => {
  if (video.paused) await video.play();
  else video.pause();
});

stopBtn.addEventListener('click', () => stopVibrations());

// ---- vibration arming (user gesture) ----
supportText.textContent = canVibrate()
  ? 'Vibration API: supported on this browser/device.'
  : 'Vibration API: not supported here.';
armVibrationBtn.addEventListener('click', () => {
  // user gesture happens here; mark as armed and do a tiny test vibration.
  armed = true;
  vibrate(10);
});

// ---- editor actions ----
previewBtn.addEventListener('click', () => {
  const p = parsePattern(patternInput.value);
  if (!p) return alert('Invalid pattern. Use comma numbers or JSON array.');
  vibrate(p);
});

addEventBtn.addEventListener('click', () => {
  const p = parsePattern(patternInput.value);
  if (!p) return alert('Invalid pattern. Use comma numbers or JSON array.');
  const t = video.currentTime || 0;
  events.push({ id: uid(), t, pattern: p });
  renderEvents();
});

// ---- export ----
exportJsonBtn.addEventListener('click', () => {
  const payload = events
    .slice()
    .sort((a, b) => a.t - b.t)
    .map(({ id, t, pattern }) => ({ id, t, pattern }));
  exportOut.textContent = JSON.stringify(payload, null, 2);
});

exportVibrateBtn.addEventListener('click', () => {
  // Flatten events into a single vibrate pattern from time 0:
  // [pauseUntilFirst, ...pattern1, pauseGap, ...pattern2, ...]
  // Note: this is approximate and only really works if you want a single continuous sequence.
  const sorted = events.slice().sort((a, b) => a.t - b.t);

  if (!sorted.length) {
    exportOut.textContent = 'navigator.vibrate([]);';
    return;
  }

  let out = [];
  let cursorMs = 0;

  for (const ev of sorted) {
    const startMs = Math.max(0, Math.round(ev.t * 1000));
    const gap = Math.max(0, startMs - cursorMs);

    // Ensure we insert the gap as a "pause" slot.
    // If out is empty, the first element must be vibration duration, so we start with a 0 vibrate then gap pause.
    if (out.length === 0) out.push(0);
    out.push(gap);

    // Append the pattern, then advance cursor by its total duration
    out = out.concat(ev.pattern);
    const patSum = ev.pattern.reduce((a, b) => a + b, 0);
    cursorMs = startMs + patSum;
  }

  exportOut.textContent = `navigator.vibrate(${JSON.stringify(out)});`;
});
