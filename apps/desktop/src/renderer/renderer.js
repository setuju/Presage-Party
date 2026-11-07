'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Seeded PRNG (Mulberry32) for deterministic random events across clients
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
  let rng = Math.random; // Default to unseeded

  const screens = {
    consent: document.getElementById('screen-consent'),
    rules: document.getElementById('screen-rules'),
    flinch: document.getElementById('screen-flinch'),
    flinchResult: document.getElementById('screen-flinch-result'),
    player: document.getElementById('screen-player'),
    multiplayer: document.getElementById('screen-multiplayer'),
    'mp-waiting': document.getElementById('screen-mp-waiting'),
    'mp-result': document.getElementById('screen-mp-result')
  };

  const bgVideo = document.getElementById('bg-video');
  const video = document.getElementById('video');
  const challengeVideo = document.getElementById('challenge-video');
  const gameContainer = document.getElementById('game-container');
  
  let timeline = null;
  let videoUrl = null;

  const composureBar = document.getElementById('composure-bar');
  const composureLabel = document.getElementById('composure-label');
  const timerEl = document.getElementById('timer');
  const statusText = document.getElementById('status-text');
  const alertFlinch = document.getElementById('alert-flinch');
  const debugHud = document.getElementById('debug-hud');
  const distractionContainer = document.getElementById('distraction-container');
  const revealMessage = document.getElementById('reveal-message');
  
  // Elements for Level 4 Jumpscare
  const jumpscareOverlay = document.getElementById('jumpscare-overlay');
  const jumpscareFace = document.getElementById('jumpscare-face');

  const mBr = document.getElementById('m-br');
  const mRate = document.getElementById('m-rate');
  const mBlink = document.getElementById('m-blink');
  const mTalk = document.getElementById('m-talk');

  let rafId = 0;
  let activeMode = 'none';
  let distractionTimeout = null;
  let jumpscareTimeout = null;
  let currentLevel = 1;
  let currentOnFinish = null;
  let myRoleInRoom = null;
  let isPostJumpscare = false; // Flag untuk penalti ganda

  const F_DURATION_MS        = 30000;
  const F_PENALTY_BLINK      = 4;
  const F_PENALTY_BLINK_JUMP = 15; // Penalti kilat setelah jumpscare
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
  
  const challengeVideoUrls = [];
  for (let i = 1; i <= 8; i++) {
    challengeVideoUrls.push(`presage://local/distractions/distraction_${i}.mp4`);
  }
  
  const scaryFaces = ['😱', '👹', '💀', '👻', '😈'];

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
      data[i] = rng() * 2 - 1;
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

  function playScream() {
    if (!audioCtx) return;
    // Harsh oscillator + noise
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);

    // Add noise
    const bufferSize = audioCtx.sampleRate * 0.8;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = rng() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    noise.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start();
  }

  function triggerDistraction() {
    if (activeMode !== 'flinch' || currentLevel !== 2) return;

    const d = distractions[Math.floor(rng() * distractions.length)];
    const el = document.createElement('div');
    el.className = 'distraction-text';
    el.textContent = d.text;
    el.style.left = (10 + rng() * 60) + '%';
    el.style.top = (20 + rng() * 60) + '%';
    el.style.color = d.type === 'ringtone' ? '#fbbf24' : (d.type === 'car' ? '#f87171' : 'rgba(255,255,255,0.9)');
    distractionContainer.appendChild(el);
    
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);

    if (d.type === 'speech') playSpeech(d.text, d.lang);
    else if (d.type === 'ringtone') playRingtone();
    else if (d.type === 'car') playCar();

    const nextDelay = 4000 + rng() * 3000;
    distractionTimeout = setTimeout(triggerDistraction, nextDelay);
  }

  function triggerJumpscare() {
    if (activeMode !== 'flinch' || currentLevel !== 4) return;

    // Randomize face
    jumpscareFace.textContent = scaryFaces[Math.floor(rng() * scaryFaces.length)];
    
    // Play audio
    playScream();

    // Show visual
    jumpscareOverlay.classList.add('active');

    // Set post-jumpscare penalty flag
    isPostJumpscare = true;

    // Clean up after animation
    setTimeout(() => {
      jumpscareOverlay.classList.remove('active');
      isPostJumpscare = false;
    }, 600);

    // Schedule next jumpscare (random 4-7s)
    const nextDelay = 4000 + rng() * 3000;
    jumpscareTimeout = setTimeout(triggerJumpscare, nextDelay);
  }

  function playRandomChallengeVideo() {
    if (currentLevel !== 3 || activeMode !== 'flinch' || challengeVideoUrls.length === 0) return;
    const url = challengeVideoUrls[Math.floor(rng() * challengeVideoUrls.length)];
    challengeVideo.src = url;
    challengeVideo.play().catch(e => {
      setTimeout(playRandomChallengeVideo, 1000);
    });
  }

  challengeVideo.addEventListener('ended', () => {
    if (activeMode === 'flinch' && currentLevel === 3) playRandomChallengeVideo();
  });

  // Fallback: If video fails to load (e.g., asset missing on Windows), revert to Level 2 distractions
  challengeVideo.addEventListener('error', (e) => {
    if (currentLevel === 3) {
      console.warn('[game] Challenge video failed to load. Falling back to Level 2 distractions.');
      currentLevel = 2;
      gameContainer.classList.remove('level3-mode');
      bgVideo.style.opacity = '0.2';
      distractionTimeout = setTimeout(triggerDistraction, 1000);
      statusText.textContent = 'Video missing. Distractions active!';
    }
  });

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
      debugHud.textContent = `blink: ${f_blinkCount} | talk: ${f_talkCount} | rate: ${f_rateCount} | talkAccum: ${Math.round(f_talkAccumMs/1000)}s | post-jump: ${isPostJumpscare}`;
    }
  }

  async function startFlinch(level, onFinish) {
    if (!await loadData()) return;
    currentLevel = level;
    currentOnFinish = onFinish || null;
    activeMode = 'flinch';
    show('flinch');

    initAudio();
    window.speechSynthesis.cancel();
    distractionContainer.innerHTML = '';
    clearTimeout(distractionTimeout);
    clearTimeout(jumpscareTimeout);
    jumpscareOverlay.classList.remove('active');
    isPostJumpscare = false;
    revealMessage.style.display = 'none';

    gameContainer.classList.remove('level3-mode');
    challengeVideo.pause();
    challengeVideo.removeAttribute('src');
    
    if (level === 3) {
      gameContainer.classList.add('level3-mode');
      bgVideo.style.opacity = '0';
      setTimeout(playRandomChallengeVideo, 1000);
    } else {
      bgVideo.style.opacity = '0.2';
      if (level === 2) distractionTimeout = setTimeout(triggerDistraction, 3000);
      if (level === 4) jumpscareTimeout = setTimeout(triggerJumpscare, 3000);
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

    if (level !== 3) {
      bgVideo.currentTime = 0;
      bgVideo.play().catch(e => console.error(e));
    }

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
          const penalty = isPostJumpscare ? F_PENALTY_BLINK_JUMP : F_PENALTY_BLINK;
          f_composure -= penalty;
          f_blinkCount++;
          f_lastBlinkPenaltyTime = elapsed;
          popAlert('FLINCH!');
          statusText.textContent = isPostJumpscare ? 'You flinched at the scare!' : 'You blinked!';
        }
      }
      f_lastBlinkState = s.blink;

      if (s.talk) f_talkAccumMs += dt;
      else f_talkAccumMs = Math.max(0, f_talkAccumMs - (dt * 2));

      if (f_talkAccumMs >= TALK_SUSTAIN_MS && (elapsed - f_lastTalkPenaltyTime >= TALK_COOLDOWN_MS)) {
        f_composure -= F_PENALTY_TALK;
        f_talkCount++;
        f_lastTalkPenaltyTime = elapsed;
        f_talkAccumMs = 0;
        popAlert('TALKING!');
        statusText.textContent = 'Sustained talking detected!';
      }

      if (!s.blink && f_talkAccumMs === 0 && !isPostJumpscare && rng() < 0.02) {
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

  function computeFinalScore() {
    // score = composure_remaining * 10. Max 1000 at 100% composure.
    return Math.max(0, Math.round(f_composure * 10));
  }

  function endFlinch(survived) {
    activeMode = 'none';
    cancelAnimationFrame(rafId);
    clearTimeout(distractionTimeout);
    clearTimeout(jumpscareTimeout);
    window.speechSynthesis.cancel();
    
    bgVideo.pause();
    challengeVideo.pause();
    challengeVideo.removeAttribute('src');
    jumpscareOverlay.classList.remove('active');

    const score = survived ? computeFinalScore() : 0;

    document.getElementById('result-icon').textContent = survived ? '🏆' : '💀';
    document.getElementById('result-title').textContent = survived ? 'You survived!' : 'Eliminated';
    document.getElementById('result-score-value').textContent = score;
    
    let modeText = '';
    if (currentLevel === 2) modeText = 'Seriously?';
    if (currentLevel === 3) modeText = 'Why So Serious?';
    if (currentLevel === 4) modeText = 'Don\'t Scream';
    if (currentLevel === 1) modeText = 'Chill Mode';
    document.getElementById('result-level').textContent = modeText;
    
    const desc = survived
      ? `Composure: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate spikes: ${f_rateCount}`
      : `Eliminated at 0% composure · blinks: ${f_blinkCount} · talks: ${f_talkCount} · rate spikes: ${f_rateCount}`;
    document.getElementById('result-desc').textContent = desc;

    if (currentLevel > 1) revealMessage.style.display = 'block';

    if (currentOnFinish) {
      const scoreData = {
        score: survived ? Math.round(f_composure * 10) : 0,
        blinks: f_blinkCount,
        talks: f_talkCount,
        rateSpikes: f_rateCount,
        survived: survived
      };
      const cb = currentOnFinish;
      currentOnFinish = null;
      cb(scoreData);
      return;
    }
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
  document.getElementById('btn-level4').addEventListener('click', () => startFlinch(4));
  document.getElementById('btn-replay').addEventListener('click', startReplay);
  document.getElementById('btn-flinch-restart').addEventListener('click', () => startFlinch(currentLevel));
  document.getElementById('btn-back').addEventListener('click', () => { show('consent'); });
  
  document.getElementById('btn-rules').addEventListener('click', () => show('rules'));
  document.getElementById('btn-rules-back').addEventListener('click', () => show('consent'));
  document.getElementById('btn-rules-back-top').addEventListener('click', () => show('consent'));

  document.getElementById('btn-back-player').addEventListener('click', () => {
    activeMode = 'none';
    video.pause();
    show('consent');
  });


  // --- MULTIPLAYER LOGIC ---
  let socket = null;
  const mpStatus = document.getElementById('mp-status');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const inputRoomCode = document.getElementById('input-room-code');

  function connectSocket() {
    if (socket) return;
    
    // Koneksi ke server lokal (port 3000)
    socket = io('http://127.0.0.1:3000');

    socket.on('connect', () => {
      const info = document.getElementById('mp-server-info');
      if(info) info.textContent = 'Connected to 127.0.0.1:3000';
      mpStatus.textContent = 'Connected to server!';
      mpStatus.style.color = '#4ade80';
      btnCreateRoom.disabled = false;
      btnJoinRoom.disabled = false;
    });

    socket.on('game_start', (payload) => {
      console.log('[socket] game_start', payload);
      const startAt = payload && payload.startAt;
      const level = (payload && payload.level) || 1;
      const seed = payload && payload.seed;
      if (seed !== undefined) rng = mulberry32(seed);
      const delay = Math.max(0, (startAt || Date.now()) - Date.now());
      mpStatus.textContent = 'Starting in ' + Math.ceil(delay / 1000) + '...';
      mpStatus.style.color = '#fbbf24';
      setTimeout(() => {
        startFlinch(level, (scoreData) => {
          console.log('[socket] reporting score', scoreData);
          socket.emit('report_score', scoreData, (res) => console.log('[socket] score ack', res));
          show('mp-waiting');
        });
      }, delay);
    });

    socket.on('game_result', (payload) => {
      console.log('[socket] game_result', payload);
      const host = payload && payload.host;
      const guest = payload && payload.guest;
      const mine = myRoleInRoom === 'host' ? host : guest;
      const opp  = myRoleInRoom === 'host' ? guest : host;
      const iWon = !!(mine && opp && mine.score > opp.score);
      const isTie = !!(mine && opp && mine.score === opp.score);
      showMultiplayerResult(mine, opp, iWon, isTie);
    });

    socket.on('connect_error', (err) => {
      const msg = err && (err.message || err.description || String(err));
      const data = err && err.data ? ' data=' + JSON.stringify(err.data) : '';
      const ctx  = err && err.context ? ' ctx=' + err.context : '';
      console.error('[socket] connect_error:', msg, data, ctx, err);
      mpStatus.innerHTML = 'Cannot reach server. <span style="color:#666;font-size:12px;display:block;margin-top:6px;">' + (msg || 'unknown') + data + ctx + '</span>';
      mpStatus.style.color = '#ef4444';
      btnCreateRoom.disabled = true;
      btnJoinRoom.disabled = true;
    });

    socket.on('player_joined', (playerId) => {
      console.log('[socket] opponent joined:', playerId);
      mpStatus.innerHTML = '<span style="color:#4ade80;">Opponent joined!</span> <span style="color:#aaa;font-size:13px;">(You are the Room Master)</span>';
      const startBtn = document.getElementById('btn-mp-start');
      if (startBtn) { startBtn.disabled = false; startBtn.style.display = 'inline-flex'; }
      const lvlSel = document.getElementById('mp-level-selector');
      if (lvlSel) lvlSel.style.display = 'block';
    });

    socket.on('room_joined', (data) => {
      console.log('[socket] joined room', data);
      myRoleInRoom = 'guest';
      mpStatus.innerHTML = '<span style="color:#4ade80;">Joined room ' + data.code + '</span><br><span style="color:#aaa;font-size:13px;">(You are a Gamer. Waiting for Room Master to start...)</span>';
      btnCreateRoom.disabled = true;
      btnJoinRoom.disabled = true;
    });

    socket.on('host_migrated', (newHostId) => {
      console.log('[socket] host migrated to', newHostId);
      if (socket.id === newHostId) {
        myRoleInRoom = 'host';
        mpStatus.innerHTML = '<span style="color:#fbbf24;">Host left. You are now the Room Master.</span>';
        const startBtn = document.getElementById('btn-mp-start');
        if (startBtn) { startBtn.disabled = false; startBtn.style.display = 'inline-flex'; }
        const lvlSel = document.getElementById('mp-level-selector');
        if (lvlSel) lvlSel.style.display = 'block';
      }
    });

    socket.on('opponent_left', () => {
      console.log('[socket] opponent left');
      mpStatus.innerHTML = '<span style="color:#ef4444;">Opponent left the room.</span> Waiting for a new player...';
      const startBtn = document.getElementById('btn-mp-start');
      if (startBtn) { startBtn.disabled = true; startBtn.style.display = 'none'; }
      const lvlSel = document.getElementById('mp-level-selector');
      if (lvlSel) lvlSel.style.display = 'none';
    });
  }

  document.getElementById('btn-multiplayer').addEventListener('click', () => {
    show('multiplayer');
    connectSocket();
  });

  document.getElementById('btn-mp-back').addEventListener('click', () => {
    show('consent');
  });

  btnCreateRoom.addEventListener('click', () => {
    socket.emit('create_room', (res) => {
      if (res.success) {
        mpStatus.innerHTML = `Room Code: <span style="font-size:32px; color:#fff;">${res.roomCode}</span><br><span style="font-size:14px; color:#aaa;">Waiting for opponent...</span>`;
        btnCreateRoom.disabled = true;
        btnJoinRoom.disabled = true;
      }
    });
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = inputRoomCode.value.trim().toUpperCase();
    if (!code) return;
    
    socket.emit('join_room', code, (res) => {
      if (res.success) {
        myRoleInRoom = 'guest';
        mpStatus.innerHTML = 'Joined! <span style="color:#aaa;font-size:13px;">Waiting for host to start...</span>';
        mpStatus.style.color = '#4ade80';
        btnCreateRoom.disabled = true;
        btnJoinRoom.disabled = true;
      } else {
        mpStatus.textContent = 'Error: ' + res.error;
        mpStatus.style.color = '#ef4444';
      }
    });
  });

  const _retryBtn = document.getElementById('btn-mp-retry');
  if (_retryBtn) {
    _retryBtn.addEventListener('click', () => {
      console.log('[socket] retry clicked');
      if (socket) { try { socket.disconnect(); } catch (e) {} socket = null; }
      document.getElementById('mp-level-selector').style.display = 'none';
      mpStatus.textContent = 'Reconnecting...';
      mpStatus.style.color = '#fbbf24';
      btnCreateRoom.disabled = true;
      btnJoinRoom.disabled = true;
      connectSocket();
    });
  }

  function showMultiplayerResult(mine, opp, iWon, isTie) {
    const title = isTie ? "IT'S A TIE" : (iWon ? 'YOU WIN' : 'YOU LOSE');
    const color = isTie ? '#fbbf24' : (iWon ? '#4ade80' : '#ef4444');
    const tEl = document.getElementById('mp-result-title');
    if (tEl) { tEl.textContent = title; tEl.style.color = color; }
    if (mine) {
      document.getElementById('mp-result-mine').textContent = mine.score;
      document.getElementById('mp-result-mine-stats').textContent =
        'blinks ' + mine.blinks + ' \u00b7 talks ' + mine.talks + ' \u00b7 rate ' + mine.rateSpikes;
    }
    if (opp) {
      document.getElementById('mp-result-opp').textContent = opp.score;
      document.getElementById('mp-result-opp-stats').textContent =
        'blinks ' + opp.blinks + ' \u00b7 talks ' + opp.talks + ' \u00b7 rate ' + opp.rateSpikes;
    }
    show('mp-result');
  }

  const _lvlSel = document.getElementById('select-mp-level');
  if (_lvlSel) {
    _lvlSel.addEventListener('change', (e) => {
      const warn = document.getElementById('mp-asset-warning');
      if (warn) warn.style.display = (e.target.value === '3') ? 'block' : 'none';
    });
  }

  const _startBtn = document.getElementById('btn-mp-start');
  if (_startBtn) {
    _startBtn.addEventListener('click', () => {
      const level = parseInt(document.getElementById('select-mp-level').value, 10);
      socket.emit('start_game', { level }, (res) => {
        console.log('[socket] start_game ack', res);
        if (res && res.success) {
          _startBtn.disabled = true;
          _startBtn.style.display = 'none';
          const lvlSel = document.getElementById('mp-level-selector');
          if (lvlSel) lvlSel.style.display = 'none';
          mpStatus.textContent = 'Waiting for countdown...';
          mpStatus.style.color = '#fbbf24';
        } else {
          mpStatus.textContent = 'Error: ' + (res && res.error || 'unknown');
          mpStatus.style.color = '#ef4444';
        }
      });
    });
  }

  const _rematchBtn = document.getElementById('btn-mp-rematch');
  if (_rematchBtn) {
    _rematchBtn.addEventListener('click', () => {
      show('multiplayer');
      const sb = document.getElementById('btn-mp-start');
      const lvlSel = document.getElementById('mp-level-selector');
      
      if (myRoleInRoom === 'host') {
        if (sb) { sb.disabled = false; sb.style.display = 'inline-flex'; }
        if (lvlSel) { lvlSel.style.display = 'block'; } // Show level selector again
        mpStatus.textContent = 'Select a level to start rematch.';
        mpStatus.style.color = '#4ade80';
      } else {
        if (sb) { sb.disabled = true; sb.style.display = 'none'; }
        if (lvlSel) { lvlSel.style.display = 'none'; }
        mpStatus.textContent = 'Waiting for Room Master to start rematch...';
        mpStatus.style.color = '#fbbf24';
      }
    });
  }

  const _mpResultBack = document.getElementById('btn-mp-result-back');
  if (_mpResultBack) {
    _mpResultBack.addEventListener('click', () => {
      myRoleInRoom = null;
      show('consent');
    });
  }

  const _waitingBackBtn = document.getElementById('btn-mp-waiting-back');
  if (_waitingBackBtn) {
    _waitingBackBtn.addEventListener('click', () => {
      myRoleInRoom = null;
      show('consent');
    });
  }

  show('consent');
})();

