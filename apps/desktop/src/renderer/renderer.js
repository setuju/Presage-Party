'use strict';

(function () {
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

  // UI elements
  const composureBar = document.getElementById('composure-bar');
  const composureLabel = document.getElementById('composure-label');
  const timerEl = document.getElementById('timer');
  const statusText = document.getElementById('status-text');
  const alertFlinch = document.getElementById('alert-flinch');
  const debugHud = document.getElementById('debug-hud');

  const mBr = document.getElementById('m-br');
  const mRate = document.getElementById('m-rate');
  const mBlink = document.getElementById('m-blink');
  const mTalk = document.getElementById('m-talk');

  let rafId = 0;
  let activeMode = 'none';

  // --- Tunables (survivable by default) ---
  const F_DURATION_MS        = 30000;
  
  const F_PENALTY_BLINK      = 4;      // -4 per blink (max ~6 blinks/30s = -24)
  const BLINK_COOLDOWN_MS    = 2000;

  const F_PENALTY_TALK       = 8;      // -8 per sustained talk event
  const TALK_SUSTAIN_MS      = 2000;   // must talk continuously for 2s to trigger
  const TALK_COOLDOWN_MS     = 4000;   // 4s cooldown after a talk penalty

  const F_RATE_THRESHOLD     = 24;     // raised from 22, normal talking breathes faster
  const F_RATE_PENALTY_TICK  = 1000;   // -1 per second above 24 bpm
  const F_RATE_PENALTY       = 1;

  // Flinch State
  let f_composure = 100;
  let f_startTime = 0;
  let f_lastFrameTime = 0;
  
  let f_lastBlinkState = false;
  let f_lastBlinkPenaltyTime = -Infinity;
  
  let f_talkAccumMs = 0;
  let f_lastTalkPenaltyTime = -Infinity;

  let f_lastRatePenaltyTime = -Infinity;

  // Debug counters
  let f_blinkCount = 0;
  let f_talkCount = 0;
  let f_rateCount = 0;

  // Replay State
  let r_cursor = 0;

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
      debugHud.textContent = `blink: ${f_blinkCount} | talk: ${f_talkCount} | rate: ${f_rateCount} | talkAccum: ${Math.round(f_talkAccumMs/1000)}s`;
    }
  }

  // --- FLINCH GAME ---
  async function startFlinch() {
    if (!await loadData()) return;
    activeMode = 'flinch';
    show('flinch');

    f_composure = 100;
    f_startTime = performance.now();
    f_lastFrameTime = f_startTime;
    
    f_lastBlinkState = false;
    f_lastBlinkPenaltyTime = -Infinity;
    f_talkAccumMs = 0;
    f_lastTalkPenaltyTime = -Infinity;
    f_lastRatePenaltyTime = -Infinity;

    f_blinkCount = 0;
    f_talkCount = 0;
    f_rateCount = 0;

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
    const dt = now - f_lastFrameTime;
    f_lastFrameTime = now;
    
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
      if (s.blink && !f_lastBlinkState) {
        if (elapsed - f_lastBlinkPenaltyTime >= BLINK_COOLDOWN_MS) {
          f_composure -= F_PENALTY_BLINK;
          f_blinkCount++;
          f_lastBlinkPenaltyTime = elapsed;
          popAlert('FLINCH!');
          statusText.textContent = 'You blinked!';
        }
      }
      f_lastBlinkState = s.blink;

      // --- Talking (time-based accumulation) ---
      if (s.talk) {
        f_talkAccumMs += dt;
      } else {
        f_talkAccumMs = Math.max(0, f_talkAccumMs - (dt * 2)); // decays twice as fast
      }

      if (f_talkAccumMs >= TALK_SUSTAIN_MS && (elapsed - f_lastTalkPenaltyTime >= TALK_COOLDOWN_MS)) {
        f_composure -= F_PENALTY_TALK;
        f_talkCount++;
        f_lastTalkPenaltyTime = elapsed;
        f_talkAccumMs = 0; // reset
        popAlert('TALKING!');
        statusText.textContent = 'Sustained talking detected!';
      }

      // Reset text
      if (!s.blink && f_talkAccumMs === 0 && Math.random() < 0.02) {
        statusText.textContent = 'Do not flinch.';
      }
    }

    // --- Rate (per-second penalty) ---
    const rate = findRate(tMs);
    if (rate && rate.value > F_RATE_THRESHOLD) {
      if (elapsed - f_lastRatePenaltyTime >= F_RATE_PENALTY_TICK) {
        f_composure -= F_RATE_PENALTY;
        f_rateCount++;
        f_lastRatePenaltyTime = elapsed;
        statusText.textContent = `Heart rate too high (${rate.value.toFixed(1)})!`;
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
      ? `Composure remaining: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · rate: ${f_rateCount}`
      : `Final composure: 0% · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate: ${f_rateCount}`;
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
