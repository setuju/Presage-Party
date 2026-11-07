'use strict';

// Bungkus dalam DOMContentLoaded untuk memastikan DOM siap
document.addEventListener('DOMContentLoaded', () => {
  const screens = {
    consent: document.getElementById('screen-consent'),
    flinch: document.getElementById('screen-flinch'),
    flinchResult: document.getElementById('screen-flinch-result'),
    player: document.getElementById('screen-player')
  };

  const bgVideo = document.getElementById('bg-video');
  const video = document.getElementById('video');
  const distractionVideo = document.getElementById('distraction-video');
  let timeline = null;
  let videoUrl = null;

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
  let currentLevel = 1;

  const F_DURATION_MS        = 30000;
  const F_PENALTY_BLINK      = 4;
  const BLINK_COOLDOWN_MS    = 2000;
  const F_PENALTY_TALK       = 8;
  const TALK_SUSTAIN_MS      = 2000;
  const TALK_COOLDOWN_MS     = 4000;
  const F_RATE_THRESHOLD     = 24;
  const F_RATE_PENALTY_TICK  = 1000;
  const F_RATE_PENALTY       = 1;

  let f_composure = 100;
  let f_startTime = 0;
  let f_lastFrameTime = 0;
  let f_lastBlinkState = false;
  let f_lastBlinkPenaltyTime = -Infinity;
  let f_talkAccumMs = 0;
  let f_lastTalkPenaltyTime = -Infinity;
  let f_lastRatePenaltyTime = -Infinity;

  let f_blinkCount = 0;
  let f_talkCount = 0;
  let f_rateCount = 0;

  let r_cursor = 0;

  const distractions = [
    { type: 'speech', text: 'Is that a pimple on your nose?', lang: 'en-US' },
    { type: 'speech', text: 'Your fly is down.', lang: 'en-US' },
    { type: 'speech', text: 'Did you hear that sound?', lang: 'en-US' },
    { type: 'speech', text: 'Look behind you.', lang: 'en-US' },
    { type: 'speech', text: 'You have something on your face.', lang: 'en-US' },
    { type: 'speech', text: 'I am watching you.', lang: 'en-US' },
    { type: 'speech', text: 'Are you nervous?', lang: 'en-US' },
    { type: 'speech', text: 'Don\'t blink. I dare you.', lang: 'en-US' },
    { type: 'ringtone', text: 'Brrring! Brrring!' },
    { type: 'car', text: 'Vroooom!' }
  ];
  
  const distractionVideoUrls = [];
  for (let i = 1; i <= 8; i++) {
    distractionVideoUrls.push(`presage://local/distractions/distraction_${i}.mp4`);
  }

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
      window.speechSynthesis.speak(utter);
    }
  }

  function playRingtone() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
    
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
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
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

  function playDistractionVideo() {
    if (currentLevel !== 3 || distractionVideoUrls.length === 0) return;
    const url = distractionVideoUrls[Math.floor(Math.random() * distractionVideoUrls.length)];
    distractionVideo.src = url;
    distractionVideo.style.display = 'block';
    distractionVideo.style.left = (5 + Math.random() * 60) + '%';
    distractionVideo.style.top = (5 + Math.random() * 60) + '%';
    
    distractionVideo.play().catch(e => {
      console.warn('Failed to play distraction video:', e);
      distractionVideo.style.display = 'none';
    });

    setTimeout(() => {
      distractionVideo.pause();
      distractionVideo.style.display = 'none';
    }, 3000 + Math.random() * 2000);
  }

  function triggerDistraction() {
    if (activeMode !== 'flinch' || currentLevel === 1) return;

    if (currentLevel === 3 && Math.random() < 0.6) {
      playDistractionVideo();
    } else {
      const d = distractions[Math.floor(Math.random() * distractions.length)];
      const el = document.createElement('div');
      el.className = 'distraction-text';
      el.textContent = d.text;
      el.style.left = (10 + Math.random() * 60) + '%';
      el.style.top = (20 + Math.random() * 60) + '%';
      el.style.color = d.type === 'ringtone' ? '#fbbf24' : (d.type === 'car' ? '#f87171' : 'rgba(255,255,255,0.9)');
      distractionContainer.appendChild(el);
      
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);

      if (d.type === 'speech') playSpeech(d.text, d.lang);
      else if (d.type === 'ringtone') playRingtone();
      else if (d.type === 'car') playCar();
    }

    const nextDelay = 4000 + Math.random() * 3000;
    distractionTimeout = setTimeout(triggerDistraction, nextDelay);
  }

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

  async function startFlinch(level) {
    if (!await loadData()) return;
    currentLevel = level;
    activeMode = 'flinch';
    show('flinch');

    initAudio();
    window.speechSynthesis.cancel();
    distractionContainer.innerHTML = '';
    clearTimeout(distractionTimeout);
    distractionVideo.style.display = 'none';
    
    if (level > 1) {
      distractionTimeout = setTimeout(triggerDistraction, 3000);
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
    distractionVideo.pause();
    distractionVideo.style.display = 'none';

    document.getElementById('result-icon').textContent = survived ? '🏆' : '💀';
    document.getElementById('result-title').textContent = survived ? 'You survived!' : 'Eliminated';
    
    let modeText = '';
    if (currentLevel === 2) modeText = ' (Seriously?)';
    if (currentLevel === 3) modeText = ' (Why So Serious?)';
    
    const desc = survived
      ? `Composure: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · rate: ${f_rateCount}${modeText}`
      : `Final composure: 0% · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate: ${f_rateCount}${modeText}`;
    document.getElementById('result-desc').textContent = desc;

    show('flinchResult');
  }

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

  document.getElementById('btn-level1').addEventListener('click', () => startFlinch(1));
  document.getElementById('btn-level2').addEventListener('click', () => startFlinch(2));
  document.getElementById('btn-level3').addEventListener('click', () => startFlinch(3));
  document.getElementById('btn-replay').addEventListener('click', startReplay);
  document.getElementById('btn-flinch-restart').addEventListener('click', () => startFlinch(currentLevel));
  document.getElementById('btn-back').addEventListener('click', () => { show('consent'); });
  document.getElementById('btn-back-player').addEventListener('click', () => {
    activeMode = 'none';
    video.pause();
    show('consent');
  });

  show('consent');
});
