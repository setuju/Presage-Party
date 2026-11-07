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
  const distractionContainer = document.getElementById('distraction-container');

  const mBr = document.getElementById('m-br');
  const mRate = document.getElementById('m-rate');
  const mBlink = document.getElementById('m-blink');
  const mTalk = document.getElementById('m-talk');

  let rafId = 0;
  let activeMode = 'none';
  let distractionTimeout = null;
  let isHardMode = false;

  // --- Tunables ---
  const F_DURATION_MS        = 30000;
  const F_PENALTY_BLINK      = 4;
  const BLINK_COOLDOWN_MS    = 2000;
  const F_PENALTY_TALK       = 8;
  const TALK_SUSTAIN_MS      = 2000;
  const TALK_COOLDOWN_MS     = 4000;
  const F_RATE_THRESHOLD     = 24;
  const F_RATE_PENALTY_TICK  = 1000;
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

  // --- Audio/Visual Distractions ---
  const distractions = [
    { type: 'speech', text: 'Hey you, I am here', lang: 'en-US' },
    { type: 'speech', text: 'You dropped your money on the floor', lang: 'en-US' },
    { type: 'speech', text: 'Does somebody see my cat?', lang: 'en-US' },
    { type: 'speech', text: 'Hey, I know you', lang: 'en-US' },
    { type: 'speech', text: 'I love you', lang: 'en-US' },
    { type: 'speech', text: 'Je t\'aime', lang: 'fr-FR' },
    { type: 'ringtone', text: 'Brrring! Brrring!' },
    { type: 'car', text: 'Vroooom!' },
    { type: 'speech', text: '(Loud laughter)', lang: 'en-US' } // Web speech can't laugh, but it will read this weirdly which is funny
  ];

  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSpeech(text, lang) {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1.1;
      utter.pitch = lang === 'fr-FR' ? 1.2 : 1.0;
      window.speechSynthesis.speak(utter);
    }
  }

  function playRingtone() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
    
    // Second ring after 0.6s
    setTimeout(() => {
      if (!audioCtx) return;
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.5);
    }, 600);
  }

  function playCar() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // white noise
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioCtx.currentTime);
    filter.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 1);
    filter.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 2);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
  }

  function triggerDistraction() {
    if (activeMode !== 'flinch' || !isHardMode) return;

    // Pick random distraction
    const d = distractions[Math.floor(Math.random() * distractions.length)];

    // Spawn visual text
    const el = document.createElement('div');
    el.className = 'distraction-text';
    el.textContent = d.text;
    // Random position
    el.style.left = (10 + Math.random() * 60) + '%';
    el.style.top = (20 + Math.random() * 60) + '%';
    el.style.color = d.type === 'ringtone' ? '#fbbf24' : (d.type === 'car' ? '#f87171' : 'rgba(255,255,255,0.9)');
    distractionContainer.appendChild(el);
    
    // Cleanup element
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);

    // Play audio
    if (d.type === 'speech') playSpeech(d.text, d.lang);
    else if (d.type === 'ringtone') playRingtone();
    else if (d.type === 'car') playCar();

    // Schedule next distraction (every 4-7 seconds)
    const nextDelay = 4000 + Math.random() * 3000;
    distractionTimeout = setTimeout(triggerDistraction, nextDelay);
  }

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
      debugHud.textContent = `blink: ${f_blinkCount} | talk: ${f_talkCount} | rate: ${f_rateCount} | talkAccum: ${Math.round(f_talkAccumMs/1000)}s`;
    }
  }

  // --- FLINCH GAME ---
  async function startFlinch(hard) {
    if (!await loadData()) return;
    isHardMode = hard;
    activeMode = 'flinch';
    show('flinch');

    initAudio();
    window.speechSynthesis.cancel(); // Stop any previous speech
    distractionContainer.innerHTML = '';
    clearTimeout(distractionTimeout);
    if (isHardMode) {
      distractionTimeout = setTimeout(triggerDistraction, 3000); // First distraction after 3s
    }

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

    const samples = timeline.samples || [];
    let s = null;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].t <= tMs) s = samples[i];
      else break;
    }

    if (s) {
      // Blink
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

      // Talk
      if (s.talk) {
        f_talkAccumMs += dt;
      } else {
        f_talkAccumMs = Math.max(0, f_talkAccumMs - (dt * 2));
      }

      if (f_talkAccumMs >= TALK_SUSTAIN_MS && (elapsed - f_lastTalkPenaltyTime >= TALK_COOLDOWN_MS)) {
        f_composure -= F_PENALTY_TALK;
        f_talkCount++;
        f_lastTalkPenaltyTime = elapsed;
        f_talkAccumMs = 0;
        popAlert('TALKING!');
        statusText.textContent = 'Sustained talking detected!';
      }

      if (!s.blink && f_talkAccumMs === 0 && Math.random() < 0.02) {
        statusText.textContent = 'Do not flinch.';
      }
    }

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
    clearTimeout(distractionTimeout);
    window.speechSynthesis.cancel();
    bgVideo.pause();

    document.getElementById('result-icon').textContent = survived ? '🏆' : '💀';
    document.getElementById('result-title').textContent = survived ? 'You survived!' : 'Eliminated';
    
    const modeText = isHardMode ? ' (Hard Mode)' : '';
    const desc = survived
      ? `Composure: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · rate: ${f_rateCount}${modeText}`
      : `Final composure: 0% · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate: ${f_rateCount}${modeText}`;
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
  document.getElementById('btn-normal').addEventListener('click', () => startFlinch(false));
  document.getElementById('btn-hard').addEventListener('click', () => startFlinch(true));
  document.getElementById('btn-replay').addEventListener('click', startReplay);
  document.getElementById('btn-flinch-restart').addEventListener('click', () => startFlinch(isHardMode));
  document.getElementById('btn-back').addEventListener('click', () => { show('consent'); });
  document.getElementById('btn-back-player').addEventListener('click', () => {
    activeMode = 'none';
    video.pause();
    show('consent');
  });

  show('consent');
})();
