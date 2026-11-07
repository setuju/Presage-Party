'use strict';

(function () {
  // --- Elements ---
  const screens = {
    consent: document.getElementById('screen-consent'),
    flinch: document.getElementById('screen-flinch'),
    flinchResult: document.getElementById('screen-flinch-result'),
    player: document.getElementById('screen-player')
  };

  const bgVideo = document.getElementById('bg-video');
  const video = document.getElementById('video');
  let timeline = null;
  let videoUrl = null;

  // Flinch elements
  const composureBar = document.getElementById('composure-bar');
  const composureLabel = document.getElementById('composure-label');
  const timerEl = document.getElementById('timer');
  const statusText = document.getElementById('status-text');
  const alertFlinch = document.getElementById('alert-flinch');
  const debugHud = document.getElementById('debug-hud');

  // Replay elements
  const mBr = document.getElementById('m-br');
  const mRate = document.getElementById('m-rate');
  const mBlink = document.getElementById('m-blink');
  const mTalk = document.getElementById('m-talk');

  // --- State ---
  let rafId = 0;
  let activeMode = 'none';

  // Flinch tunables — tuned after first playtest
  const F_DURATION_MS        = 30000;
  const F_PENALTY_BLINK      = 6;     // was 15, too harsh
  const BLINK_COOLDOWN_MS    = 2000;  // no double-penalty on rapid blinks
  const F_PENALTY_TALK       = 10;
  const TALK_SUSTAIN_SAMPLES = 20;    // ~2s of continuous talk=true
  const F_RATE_THRESHOLD     = 22;
  const F_RATE_PENALTY_TICK  = 1000;  // -2 per second above threshold
  const F_RATE_PENALTY       = 2;

  // Flinch runtime state
  let f_composure = 100;
  let f_startTime = 0;
  let f_lastBlink = false;
  let f_lastTalk = false;
  let f_talkStreak = 0;
  let f_talkFired = false;
  let f_lastBlinkPenaltyElapsed = -Infinity;
  let f_lastRatePenaltyElapsed = -Infinity;
  let f_blinkCount = 0;
  let f_talkCount = 0;
  let f_rateCount = 0;

  // Replay state
  let r_cursor = 0;

  // --- Helpers ---
  function show(name) {
    Object.keys(screens).forEach(k => screens[k].classList.toggle('active', k === name));
  }

  async function loadData() {
    if (!timeline) {
      const res = await window.presage.getTimeline();
      if (res && res.error) { alert('Timeline error: ' + res.error); return false; }
      timeline = res;
    }
    if (!videoUrl) {
      videoUrl = await window.presage.getVideoUrl();
      bgVideo.src = videoUrl;
      video.src = videoUrl;
    }
    return true;
  }

  function findRate(tMs) {
    if (!timeline || !timeline.rates) return null;
    let best = null;
    for (const r of timeline.rates) {
      if (r.t <= tMs) best = r;
      else break;
    }
    return best;
  }

  function updateDebugHud() {
    if (debugHud) {
      debugHud.textContent =
        `blink: ${f_blinkCount} | talk: ${f_talkCount} | rate: ${f_rateCount} | talk-streak: ${f_talkStreak}`;
    }
  }

  // --- FLINCH GAME ---
  async function startFlinch() {
    if (!await loadData()) return;
    activeMode = 'flinch';
    show('flinch');

    f_composure = 100;
    f_lastBlink = false;
    f_lastTalk = false;
    f_talkStreak = 0;
    f_talkFired = false;
    f_lastBlinkPenaltyElapsed = -Infinity;
    f_lastRatePenaltyElapsed = -Infinity;
    f_blinkCount = 0;
    f_talkCount = 0;
    f_rateCount = 0;
    f_startTime = performance.now();
    updateFlinchUI();
    updateDebugHud();

    bgVideo.currentTime = 0;
    bgVideo.play().catch(e => console.error(e));

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(flinchLoop);
  }

  function flinchLoop(now) {
    if (activeMode !== 'flinch') return;

    const elapsed = now - f_startTime;
    const tMs = elapsed;
    const timeLeft = Math.max(0, (F_DURATION_MS - elapsed) / 1000);

    if (elapsed >= F_DURATION_MS) { endFlinch(true); return; }
    timerEl.textContent = Math.ceil(timeLeft);

    // Find current sample
    const samples = timeline.samples || [];
    let s = null;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].t <= tMs) s = samples[i];
      else break;
    }

    if (s) {
      // --- Blink (edge + cooldown) ---
      if (s.blink && !f_lastBlink) {
        if (elapsed - f_lastBlinkPenaltyElapsed >= BLINK_COOLDOWN_MS) {
          f_composure -= F_PENALTY_BLINK;
          f_blinkCount++;
          f_lastBlinkPenaltyElapsed = elapsed;
          popAlert('FLINCH!');
          statusText.textContent = 'You blinked!';
        }
      }
      f_lastBlink = s.blink;

      // --- Talking (sustained) ---
      if (s.talk) {
        f_talkStreak++;
      } else {
        f_talkStreak = 0;
        f_talkFired = false;
      }
      if (f_talkStreak >= TALK_SUSTAIN_SAMPLES && !f_talkFired) {
        f_composure -= F_PENALTY_TALK;
        f_talkCount++;
        f_talkFired = true;
        popAlert('TALKING!');
        statusText.textContent = 'Sustained talking detected';
      }
      f_lastTalk = s.talk;

      // Idle reset text
      if (!s.blink && f_talkStreak === 0 && Math.random() < 0.02) {
        statusText.textContent = 'Do not flinch.';
      }
    }

    // --- Rate (per-second penalty) ---
    const rate = findRate(tMs);
    if (rate && rate.value > F_RATE_THRESHOLD) {
      if (elapsed - f_lastRatePenaltyElapsed >= F_RATE_PENALTY_TICK) {
        f_composure -= F_RATE_PENALTY;
        f_rateCount++;
        f_lastRatePenaltyElapsed = elapsed;
        statusText.textContent = 'Heart rate too high!';
      }
    }

    updateFlinchUI();
    updateDebugHud();

    if (f_composure <= 0) { endFlinch(false); return; }
    rafId = requestAnimationFrame(flinchLoop);
  }

  function updateFlinchUI() {
    f_composure = Math.max(0, f_composure);
    composureBar.style.width = f_composure + '%';
    composureLabel.textContent = `COMPOSURE ${Math.round(f_composure)}%`;
    if (f_composure > 60) composureBar.style.backgroundColor = '#4ade80';
    else if (f_composure > 30) composureBar.style.backgroundColor = '#fbbf24';
    else composureBar.style.backgroundColor = '#ef4444';
  }

  function popAlert(text) {
    alertFlinch.textContent = text;
    alertFlinch.classList.remove('pop');
    void alertFlinch.offsetWidth;
    alertFlinch.classList.add('pop');
  }

  function endFlinch(survived) {
    activeMode = 'none';
    cancelAnimationFrame(rafId);
    bgVideo.pause();

    document.getElementById('result-icon').textContent = survived ? '🏆' : '💀';
    document.getElementById('result-title').textContent = survived ? 'You survived!' : 'Eliminated';
    const desc = survived
      ? `Composure remaining: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · rate spikes: ${f_rateCount}`
      : `Final composure: 0% · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate spikes: ${f_rateCount}`;
    document.getElementById('result-desc').textContent = desc;

    show('flinchResult');
  }

  // --- REPLAY ---
  async function startReplay() {
    if (!await loadData()) return;
    activeMode = 'replay';
    show('player');

    r_cursor = 0;
    video.currentTime = 0;
    video.play().catch(e => console.error(e));

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(replayLoop);
  }

  function replayLoop() {
    if (activeMode !== 'replay') return;
    if (video.paused || video.ended) return;

    const tMs = Math.round(video.currentTime * 1000);
    const samples = timeline.samples || [];
    while (r_cursor + 1 < samples.length && samples[r_cursor + 1].t <= tMs) r_cursor++;
    const s = samples[r_cursor];

    if (s) {
      mBr.textContent = s.br.toFixed(2);
      mBlink.textContent = s.blink ? 'yes' : 'no';
      mTalk.textContent = s.talk ? 'yes' : 'no';
    }
    const r = findRate(tMs);
    if (r) mRate.textContent = r.value.toFixed(1) + ' bpm';

    rafId = requestAnimationFrame(replayLoop);
  }

  // --- EVENTS ---
  document.getElementById('btn-flinch').addEventListener('click', startFlinch);
  document.getElementById('btn-replay').addEventListener('click', startReplay);
  document.getElementById('btn-flinch-restart').addEventListener('click', startFlinch);
  document.getElementById('btn-back').addEventListener('click', () => { show('consent'); });
  document.getElementById('btn-back-player').addEventListener('click', () => {
    activeMode = 'none';
    video.pause();
    show('consent');
  });

  show('consent');
})();
