'use strict';

// GLOBAL SHARE FUNCTION
window.shareResult = function(platform, score) {
  const url = 'https://github.com/setuju/Presage-Party';
  const text = `I just ${score ? 'scored ' + score + ' in' : 'played'} Flinch Royale! Can you beat me? Play now:`;
  let shareUrl = '';
  
  if (platform === 'whatsapp') shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
  else if (platform === 'telegram') shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  else if (platform === 'twitter') shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  else if (platform === 'instagram' || platform === 'tiktok') {
    navigator.clipboard.writeText(text + ' ' + url);
    alert('Link copied to clipboard! Open Instagram/TikTok and paste it in your story.');
    return;
  }
  
  window.open(shareUrl, '_blank');
};

document.addEventListener('DOMContentLoaded', () => {
  const screens = {
    name: document.getElementById('screen-name'),
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
  
  const composureBar = document.getElementById('composure-bar');
  const composureLabel = document.getElementById('composure-label');
  const timerEl = document.getElementById('timer');
  const statusText = document.getElementById('status-text');
  const alertFlinch = document.getElementById('alert-flinch');
  const debugHud = document.getElementById('debug-hud');
  const distractionContainer = document.getElementById('distraction-container');
  const revealMessage = document.getElementById('reveal-message');
  const jumpscareOverlay = document.getElementById('jumpscare-overlay');
  const jumpscareFace = document.getElementById('jumpscare-face');
  
  const mpStatus = document.getElementById('mp-status');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnStartGame = document.getElementById('btn-mp-start');
  const inputRoomCode = document.getElementById('input-room-code');
  const inputRoomPassword = document.getElementById('input-room-password');
  const inputCreatePassword = document.getElementById('input-create-password');
  const roomListEl = document.getElementById('room-list');
  const levelSelector = document.getElementById('mp-level-selector');
  const selectLevel = document.getElementById('select-mp-level');
  const assetWarning = document.getElementById('mp-asset-warning');
  const mpServerInfo = document.getElementById('mp-server-info');
  const assetStatus = document.getElementById('asset-status');

  const mBr = document.getElementById('m-br');
  const mRate = document.getElementById('m-rate');
  const mBlink = document.getElementById('m-blink');
  const mTalk = document.getElementById('m-talk');

  let timeline = null;
  let videoUrl = null;
  let rafId = 0;
  let activeMode = 'none';
  let currentLevel = 1;
  let currentOnFinish = null;
  let myRoleInRoom = null;
  let socket = null;
  let myUsername = 'Player';
  let assetsReady = false;

  let currentRng = Math.random;
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
  function hashRoomCode(code) {
    let hash = 0;
    if (!code) return 0;
    for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash) + code.charCodeAt(i);
    return Math.abs(hash);
  }

  const F_PENALTY_BLINK = 4;
  const F_PENALTY_BLINK_JUMP = 15;
  const BLINK_COOLDOWN_MS = 2000;
  const F_PENALTY_TALK = 8;
  const TALK_SUSTAIN_MS = 2000;
  const TALK_COOLDOWN_MS = 4000;
  const F_RATE_THRESHOLD = 24;
  const F_RATE_PENALTY_TICK = 1000;
  const F_RATE_PENALTY = 1;

  let f_durationMs = 30000;
  let f_composure = 100;
  let f_startTime = 0;
  let f_lastFrameTime = 0;
  let f_lastBlinkState = false;
  let f_lastBlinkPenaltyTime = -Infinity;
  let f_talkAccumMs = 0;
  let f_lastTalkPenaltyTime = -Infinity;
  let f_lastRatePenaltyTime = -Infinity;
  let f_lastTriggerTick = -1;
  let isPostJumpscare = false;
  let f_blinkCount = 0;
  let f_talkCount = 0;
  let f_rateCount = 0;
  let r_cursor = 0;
  let videoErrorCount = 0;

  let audioCtx = null;
  let distractionTimeout = null;
  let jumpscareTimeout = null;

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
  for (let i = 1; i <= 8; i++) challengeVideoUrls.push(`presage://local/distractions/distraction_${i}.mp4`);
  const scaryFaces = ['😱', '👹', '💀', '👻', '😈'];

  function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    setTimeout(() => {
      if (!audioCtx) return;
      const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
      osc2.type = 'sine'; osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain2.gain.setValueAtTime(0.1, audioCtx.currentTime); gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc2.connect(gain2); gain2.connect(audioCtx.destination); osc2.start(); osc2.stop(audioCtx.currentTime + 0.5);
    }, 600);
  }

  function playCar() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 2; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioCtx.currentTime); filter.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 1); filter.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 2);
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.5); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
    noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); noise.start();
  }

  function playScream() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.8);
  }

  function triggerDistraction() {
    if (activeMode !== 'flinch' || currentLevel !== 2) return;
    const d = distractions[Math.floor(currentRng() * distractions.length)];
    const el = document.createElement('div'); el.className = 'distraction-text'; el.textContent = d.text;
    el.style.left = (10 + Math.random() * 60) + '%'; el.style.top = (20 + Math.random() * 60) + '%';
    el.style.color = d.type === 'ringtone' ? '#fbbf24' : (d.type === 'car' ? '#f87171' : 'rgba(255,255,255,0.9)');
    distractionContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
    if (d.type === 'speech') playSpeech(d.text, d.lang);
    else if (d.type === 'ringtone') playRingtone();
    else if (d.type === 'car') playCar();
  }

  function playRandomChallengeVideo() {
    if (currentLevel !== 3 || activeMode !== 'flinch' || challengeVideoUrls.length === 0) return;
    const url = challengeVideoUrls[Math.floor(currentRng() * challengeVideoUrls.length)];
    challengeVideo.src = url;
    challengeVideo.play().catch(e => setTimeout(playRandomChallengeVideo, 1000));
  }

  function triggerJumpscare() {
    if (activeMode !== 'flinch' || currentLevel !== 4) return;
    jumpscareFace.textContent = scaryFaces[Math.floor(currentRng() * scaryFaces.length)];
    playScream();
    jumpscareOverlay.classList.add('active');
    isPostJumpscare = true;
    setTimeout(() => { jumpscareOverlay.classList.remove('active'); isPostJumpscare = false; }, 600);
  }

  challengeVideo.addEventListener('ended', () => {
    if (activeMode === 'flinch' && currentLevel === 3) playRandomChallengeVideo();
  });
  challengeVideo.addEventListener('error', () => {
    if (currentLevel === 3 && activeMode === 'flinch') {
      videoErrorCount++;
      if (videoErrorCount >= 3) {
        currentLevel = 2; gameContainer.classList.remove('level3-mode'); bgVideo.style.opacity = '0.2';
        statusText.textContent = 'Video missing. Distractions active!';
      } else {
        setTimeout(() => { if (currentLevel === 3 && activeMode === 'flinch') playRandomChallengeVideo(); }, 1000);
      }
    }
  });

  function show(name) {
    Object.keys(screens).forEach(k => {
      const el = screens[k];
      if (el) el.classList.toggle('active', k === name);
    });
  }

  async function loadData() {
    if (!timeline) {
      const res = await window.presage.getTimeline();
      if (res && res.error) { alert('Timeline error: ' + res.error); return false; }
      timeline = res;
    }
    if (!videoUrl) {
      videoUrl = await window.presage.getVideoUrl();
      bgVideo.src = videoUrl; video.src = videoUrl;
    }
    return true;
  }

  function findRate(tMs) {
    if (!timeline || !timeline.rates) return null;
    let best = null;
    for (const r of timeline.rates) { if (r.t <= tMs) best = r; else break; }
    return best;
  }

  function updateDebugHud() {
    if (debugHud) debugHud.textContent = `blink: ${f_blinkCount} | talk: ${f_talkCount} | rate: ${f_rateCount} | talkAccum: ${Math.round(f_talkAccumMs/1000)}s | post-jump: ${isPostJumpscare}`;
  }

  async function startFlinch(level, durationSeconds, onFinish) {
    if (!await loadData()) return;
    currentLevel = level;
    currentOnFinish = onFinish || null;
    activeMode = 'flinch';
    show('flinch');

    initAudio();
    window.speechSynthesis.cancel();
    distractionContainer.innerHTML = '';
    clearTimeout(distractionTimeout); clearTimeout(jumpscareTimeout);
    jumpscareOverlay.classList.remove('active');
    isPostJumpscare = false; revealMessage.style.display = 'none';
    videoErrorCount = 0;

    gameContainer.classList.remove('level3-mode');
    challengeVideo.pause(); challengeVideo.removeAttribute('src');
    
    if (level === 3) {
      gameContainer.classList.add('level3-mode'); bgVideo.style.opacity = '0';
      setTimeout(playRandomChallengeVideo, 1000);
    } else {
      bgVideo.style.opacity = '0.2';
    }

    f_durationMs = (durationSeconds || 30) * 1000;
    f_composure = 100; f_startTime = performance.now(); f_lastFrameTime = f_startTime;
    f_lastBlinkState = false; f_lastBlinkPenaltyTime = -Infinity; f_talkAccumMs = 0; f_lastTalkPenaltyTime = -Infinity; f_lastRatePenaltyTime = -Infinity; f_lastTriggerTick = -1;
    f_blinkCount = 0; f_talkCount = 0; f_rateCount = 0;

    if (level !== 3) { bgVideo.currentTime = 0; bgVideo.play().catch(e => console.error(e)); }
    cancelAnimationFrame(rafId); rafId = requestAnimationFrame(flinchLoop);
  }

  function flinchLoop(now) {
    if (activeMode !== 'flinch') return;

    const elapsed = now - f_startTime;
    const dt = now - f_lastFrameTime;
    f_lastFrameTime = now;
    const tMs = elapsed;
    const timeLeft = Math.max(0, (f_durationMs - elapsed) / 1000);

    if (elapsed >= f_durationMs) { endFlinch(true); return; }
    timerEl.textContent = Math.ceil(timeLeft);

    if (activeMode === 'flinch' && (currentLevel === 2 || currentLevel === 4)) {
      const interval = 4000;
      const triggerTick = Math.floor(elapsed / interval);
      if (triggerTick > f_lastTriggerTick) {
        f_lastTriggerTick = triggerTick;
        if (currentLevel === 2) triggerDistraction();
        else if (currentLevel === 4) triggerJumpscare();
      }
    }

    const samples = timeline.samples || [];
    let s = null;
    if (samples.length > 0) {
      const maxT = samples[samples.length - 1].t;
      const loopedTMs = (tMs > maxT) ? (tMs % maxT) : tMs;
      for (let i = 0; i < samples.length; i++) { if (samples[i].t <= loopedTMs) s = samples[i]; else break; }
    }

    if (s) {
      if (s.blink && !f_lastBlinkState) {
        if (elapsed - f_lastBlinkPenaltyTime >= BLINK_COOLDOWN_MS) {
          const penalty = isPostJumpscare ? F_PENALTY_BLINK_JUMP : F_PENALTY_BLINK;
          f_composure -= penalty; f_blinkCount++; f_lastBlinkPenaltyTime = elapsed;
          popAlert('FLINCH!'); statusText.textContent = isPostJumpscare ? 'You flinched at the scare!' : 'You blinked!';
        }
      }
      f_lastBlinkState = s.blink;

      if (s.talk) f_talkAccumMs += dt; else f_talkAccumMs = Math.max(0, f_talkAccumMs - (dt * 2));

      if (f_talkAccumMs >= TALK_SUSTAIN_MS && (elapsed - f_lastTalkPenaltyTime >= TALK_COOLDOWN_MS)) {
        f_composure -= F_PENALTY_TALK; f_talkCount++; f_lastTalkPenaltyTime = elapsed; f_talkAccumMs = 0;
        popAlert('TALKING!'); statusText.textContent = 'Sustained talking detected!';
      }
      if (!s.blink && f_talkAccumMs === 0 && !isPostJumpscare && Math.random() < 0.02) statusText.textContent = 'Do not flinch.';
    }

    const rate = findRate(tMs);
    if (rate && rate.value > F_RATE_THRESHOLD) {
      if (elapsed - f_lastRatePenaltyTime >= F_RATE_PENALTY_TICK) {
        f_composure -= F_RATE_PENALTY; f_rateCount++; f_lastRatePenaltyTime = elapsed;
        statusText.textContent = `Heart rate too high (${rate.value.toFixed(1)})!`;
      }
    }

    updateFlinchUI(); updateDebugHud();
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
    alertFlinch.textContent = text; alertFlinch.classList.remove('pop');
    void alertFlinch.offsetWidth; alertFlinch.classList.add('pop');
  }

  function endFlinch(survived) {
    activeMode = 'none';
    cancelAnimationFrame(rafId);
    clearTimeout(distractionTimeout); clearTimeout(jumpscareTimeout);
    window.speechSynthesis.cancel();
    bgVideo.pause(); challengeVideo.pause(); challengeVideo.removeAttribute('src');
    jumpscareOverlay.classList.remove('active');

    const score = survived ? Math.round(f_composure * 10) : 0;
    
    if (currentOnFinish) {
      const scoreData = { score, blinks: f_blinkCount, talks: f_talkCount, rateSpikes: f_rateCount, survived };
      const cb = currentOnFinish; currentOnFinish = null; cb(scoreData); return;
    }

    document.getElementById('result-icon').textContent = survived ? '🏆' : '💀';
    document.getElementById('result-title').textContent = survived ? 'You survived!' : 'Eliminated';
    document.getElementById('result-score-value').textContent = score;
    
    let modeText = currentLevel === 2 ? 'Seriously?' : currentLevel === 3 ? 'Why So Serious?' : currentLevel === 4 ? "Don't Scream" : 'Chill Mode';
    document.getElementById('result-level').textContent = modeText;
    document.getElementById('result-desc').textContent = survived ? `Composure: ${Math.round(f_composure)}% · blinks: ${f_blinkCount} · rate: ${f_rateCount}` : `Final composure: 0% · blinks: ${f_blinkCount} · rate: ${f_rateCount}`;
    if (currentLevel > 1) revealMessage.style.display = 'block';

    show('flinchResult');
  }

  async function startReplay() {
    if (!await loadData()) return;
    activeMode = 'replay'; show('player'); r_cursor = 0;
    video.currentTime = 0; video.play().catch(e => console.error(e));
    cancelAnimationFrame(rafId); rafId = requestAnimationFrame(replayLoop);
  }

  function replayLoop() {
    if (activeMode !== 'replay' || video.paused || video.ended) return;
    const tMs = Math.round(video.currentTime * 1000);
    const samples = timeline.samples || [];
    while (r_cursor + 1 < samples.length && samples[r_cursor + 1].t <= tMs) r_cursor++;
    const s = samples[r_cursor];
    if (s) { mBr.textContent = s.br.toFixed(2); mBlink.textContent = s.blink ? 'yes' : 'no'; mTalk.textContent = s.talk ? 'yes' : 'no'; }
    const r = findRate(tMs); if (r) mRate.textContent = r.value.toFixed(1) + ' bpm';
    rafId = requestAnimationFrame(replayLoop);
  }

  function showMultiplayerResult(mine, opp, iWon, isTie, payload) {
    const title = isTie ? "IT'S A TIE" : (iWon ? 'YOU WIN' : 'YOU LOSE');
    const color = isTie ? '#fbbf24' : (iWon ? '#4ade80' : '#ef4444');
    const tEl = document.getElementById('mp-result-title'); if (tEl) { tEl.textContent = title; tEl.style.color = color; }
    
    const mineLabel = myRoleInRoom === 'host' ? payload.hostName : payload.guestName;
    const oppLabel = myRoleInRoom === 'host' ? payload.guestName : payload.hostName;
    const mineEl = document.getElementById('mp-result-mine');
    const oppEl = document.getElementById('mp-result-opp');
    if (mineEl && mineEl.previousElementSibling) mineEl.previousElementSibling.textContent = `${mineLabel} (You)`;
    if (oppEl && oppEl.previousElementSibling) oppEl.previousElementSibling.textContent = oppLabel;

    if (mine) { document.getElementById('mp-result-mine').textContent = mine.score; document.getElementById('mp-result-mine-stats').textContent = `blinks ${mine.blinks} · talks ${mine.talks} · rate ${mine.rateSpikes}`; }
    if (opp) { document.getElementById('mp-result-opp').textContent = opp.score; document.getElementById('mp-result-opp-stats').textContent = `blinks ${opp.blinks} · talks ${opp.talks} · rate ${opp.rateSpikes}`; }
    show('mp-result');
  }

  // SOCKET LOGIC
  function connectSocket() {
    if (socket) return;
    socket = io('http://127.0.0.1:3000', { transports: ['websocket', 'polling'], timeout: 5000, reconnectionAttempts: 3 });
    
    socket.on('connect', () => {
      if(mpServerInfo) mpServerInfo.textContent = 'Connected to 127.0.0.1:3000';
      mpStatus.textContent = 'Connected!'; mpStatus.style.color = '#4ade80';
      btnCreateRoom.disabled = false; btnJoinRoom.disabled = false;
      if (assetsReady) socket.emit('assets_ready');
      socket.emit('get_rooms');
    });
    
    socket.on('connect_error', (err) => {
      mpStatus.innerHTML = `Cannot reach server. <span style="color:#666;font-size:12px;display:block;">${err.message}</span>`;
      mpStatus.style.color = '#ef4444';
      btnCreateRoom.disabled = true; btnJoinRoom.disabled = true;
    });
    
    socket.on('rooms_list', (rooms) => {
      if (rooms.length === 0) { roomListEl.innerHTML = '<div style="color: #666; font-size: 13px; text-align: center;">No rooms available.</div>'; return; }
      roomListEl.innerHTML = rooms.map(r => `<div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #222;"><span style="font-family: monospace; font-size: 16px; color: #fff;">${r.code}</span><button class="btn btn-level2 btn-join-lobby" data-code="${r.code}" style="margin:0; padding:4px 12px; font-size:12px;">Join</button></div>`).join('');
      document.querySelectorAll('.btn-join-lobby').forEach(btn => {
        btn.addEventListener('click', (e) => { const code = e.target.getAttribute('data-code'); inputRoomCode.value = code; inputRoomPassword.value = ''; btnJoinRoom.click(); });
      });
    });

    socket.on('room_created', (data) => {
      console.log('[socket] room_created:', data);
      myRoleInRoom = 'host';
      // UI yang lebih bagus untuk menampilkan kode room
      mpStatus.innerHTML = `
        <div style="background:#1a1a1a; border:2px solid #4ade80; border-radius:12px; padding:20px; margin-bottom:16px;">
          <div style="color:#aaa; font-size:14px; margin-bottom:8px;">Room Code</div>
          <div style="font-size:48px; font-weight:900; color:#fff; letter-spacing:8px; margin-bottom:12px;">${data.roomCode}</div>
          <button onclick="navigator.clipboard.writeText('${data.roomCode}'); alert('Code copied!')" class="btn" style="margin:0; padding:8px 16px; font-size:14px;">Copy Code</button>
        </div>
        <div style="color:#4ade80; font-weight:bold;">Waiting for opponent to join...</div>
      `;
    });

    socket.on('room_joined', (data) => {
      myRoleInRoom = 'guest';
      mpStatus.innerHTML = `<span style="color:#4ade80;">Joined ${data.hostName}'s room</span><br><span style="color:#aaa;font-size:13px;">(Waiting for host to start...)</span>`;
      btnCreateRoom.disabled = true; btnJoinRoom.disabled = true;
    });

    socket.on('player_joined', (data) => {
      mpStatus.innerHTML = `<span style="color:#4ade80;">${data.name} joined!</span> <span style="color:#aaa;font-size:13px;">(You are the Room Master)</span>`;
      if (btnStartGame) { btnStartGame.disabled = false; btnStartGame.style.display = 'inline-flex'; }
      if (levelSelector) levelSelector.style.display = 'block';
    });

    socket.on('game_start', (payload) => {
      const delay = Math.max(0, (payload.startAt || Date.now()) - Date.now());
      if (payload.roomCode) currentRng = mulberry32(hashRoomCode(payload.roomCode));
      mpStatus.textContent = 'Starting in ' + Math.ceil(delay / 1000) + '...';
      mpStatus.style.color = '#fbbf24';
      setTimeout(() => { startFlinch(payload.level, payload.duration || 30, (scoreData) => { socket.emit('report_score', scoreData); show('mp-waiting'); }); }, delay);
    });

    socket.on('game_result', (payload) => {
      const mine = myRoleInRoom === 'host' ? payload.host : payload.guest;
      const opp  = myRoleInRoom === 'host' ? payload.guest : payload.host;
      showMultiplayerResult(mine, opp, mine && opp && mine.score > opp.score, mine && opp && mine.score === opp.score, payload);
    });

    socket.on('host_migrated', (newHostId) => {
      if (socket.id === newHostId) {
        myRoleInRoom = 'host';
        mpStatus.innerHTML = `<span style="color:#fbbf24;">Host left. You are now Room Master.</span>`;
        if (btnStartGame) { btnStartGame.disabled = false; btnStartGame.style.display = 'inline-flex'; }
        if (levelSelector) levelSelector.style.display = 'block';
      }
    });

    socket.on('opponent_left', () => {
      mpStatus.innerHTML = `<span style="color:#ef4444;">Opponent left.</span> Waiting...`;
      if (btnStartGame) { btnStartGame.disabled = true; btnStartGame.style.display = 'none'; }
      if (levelSelector) levelSelector.style.display = 'none';
    });

    socket.on('cheat_detected', (cheaterId) => {
      if (cheaterId === socket.id) {
        if (activeMode === 'flinch') { f_composure = 0; statusText.textContent = "DISQUALIFIED: Window minimized!"; }
      } else {
        mpStatus.textContent = "Opponent disqualified for minimizing window."; mpStatus.style.color = '#ef4444';
      }
    });
  }

  // INIT
  function initApp() {
    // STEP 1: Pasang listener tombol Continue DULUAN (sebelum await apa pun)
    // Ini memastikan tombol selalu berfungsi meski checkAssets() crash.
    const btnSaveName = document.getElementById('btn-save-name');
    if (btnSaveName) {
      btnSaveName.addEventListener('click', () => {
        const name = document.getElementById('input-username').value.trim();
        if (!name) { alert('Please enter a name'); return; }
        myUsername = name;
        show('consent');
      });
      console.log('[init] btn-save-name listener attached');
    } else {
      console.error('[init] btn-save-name NOT FOUND in DOM');
    }

    // STEP 2: Tampilkan layar name segera (tidak tunggu IPC)
    show('name');

    // STEP 3: Async check assets di background (boleh gagal, tidak memblokir UI)
    (async () => {
      try {
        if (!window.presage || typeof window.presage.checkAssets !== 'function') {
          console.warn('[init] presage.checkAssets unavailable - skipping asset check');
          assetStatus.textContent = 'Asset check unavailable (preload missing). Level 3 disabled.';
          assetStatus.style.color = '#fbbf24';
          return;
        }
        const res = await window.presage.checkAssets();
        if (res.ready) {
          assetsReady = true;
          assetStatus.textContent = '✓ Game materials ready.';
          assetStatus.style.color = '#4ade80';
          if (socket && socket.connected) socket.emit('assets_ready');
        } else {
          assetsReady = false;
          assetStatus.textContent = `Missing ${res.missing} video(s). Level 3 is disabled.`;
          assetStatus.style.color = '#fbbf24';
        }
      } catch (err) {
        console.error('[init] checkAssets failed:', err);
        assetStatus.textContent = 'Asset check failed. Level 3 disabled.';
        assetStatus.style.color = '#ef4444';
      }
    })();

    document.getElementById('btn-level1').addEventListener('click', () => startFlinch(1, parseInt(document.getElementById('select-solo-duration').value, 10)));
    document.getElementById('btn-level2').addEventListener('click', () => startFlinch(2, parseInt(document.getElementById('select-solo-duration').value, 10)));
    document.getElementById('btn-level3').addEventListener('click', () => startFlinch(3, parseInt(document.getElementById('select-solo-duration').value, 10)));
    document.getElementById('btn-level4').addEventListener('click', () => startFlinch(4, parseInt(document.getElementById('select-solo-duration').value, 10)));
    document.getElementById('btn-replay').addEventListener('click', startReplay);
    document.getElementById('btn-flinch-restart').addEventListener('click', () => startFlinch(currentLevel, f_durationMs / 1000));
    document.getElementById('btn-back').addEventListener('click', () => show('consent'));
    
    document.getElementById('btn-rules').addEventListener('click', () => show('rules'));
    document.getElementById('btn-rules-back').addEventListener('click', () => show('consent'));
    document.getElementById('btn-rules-back-top').addEventListener('click', () => show('consent'));
    
    document.getElementById('btn-back-player').addEventListener('click', () => { activeMode = 'none'; video.pause(); show('consent'); });

    document.getElementById('btn-multiplayer').addEventListener('click', () => { show('multiplayer'); connectSocket(); });
    document.getElementById('btn-mp-back').addEventListener('click', () => show('consent'));
    document.getElementById('btn-refresh-rooms').addEventListener('click', () => { if (socket) socket.emit('get_rooms'); });

    const retryBtn = document.getElementById('btn-mp-retry');
    if (retryBtn) retryBtn.addEventListener('click', () => { if (socket) { socket.disconnect(); socket = null; } mpStatus.textContent = 'Reconnecting...'; connectSocket(); });

    btnCreateRoom.addEventListener('click', () => {
      console.log('[ui] Create Room clicked');
      if (!socket || !socket.connected) {
        mpStatus.textContent = 'Error: Not connected to server.';
        mpStatus.style.color = '#ef4444';
        return;
      }
      
      btnCreateRoom.disabled = true; 
      btnJoinRoom.disabled = true;
      mpStatus.textContent = 'Creating room...';
      mpStatus.style.color = '#fbbf24';
      
      const pwd = inputCreatePassword.value.trim();
      socket.emit('create_room', { password: pwd, name: myUsername });
    });

    btnJoinRoom.addEventListener('click', () => {
      console.log('[ui] Join Room clicked');
      if (!socket || !socket.connected) {
        mpStatus.textContent = 'Error: Not connected to server.';
        mpStatus.style.color = '#ef4444';
        return;
      }
      const code = inputRoomCode.value.trim().toUpperCase();
      const pwd = inputRoomPassword.value.trim();
      if (!code) return;
      socket.emit('join_room', { code, password: pwd, name: myUsername }, (res) => {
        console.log('[socket] join_room ack:', res);
        if (!res.success) { mpStatus.textContent = 'Error: ' + res.error; mpStatus.style.color = '#ef4444'; }
      });
    });

    if (selectLevel) selectLevel.addEventListener('change', (e) => { 
      if (e.target.value === '3') {
        assetWarning.style.display = 'block';
        if (!assetsReady) { alert('Level 3 is disabled because you are missing video assets.'); selectLevel.value = '1'; assetWarning.style.display = 'none'; }
      } else { assetWarning.style.display = 'none'; }
    });

    if (btnStartGame) btnStartGame.addEventListener('click', () => {
      const level = parseInt(selectLevel.value, 10);
      const duration = parseInt(document.getElementById('select-mp-duration').value, 10);
      socket.emit('start_game', { level, duration }, (res) => {
        if (res.success) { btnStartGame.disabled = true; btnStartGame.style.display = 'none'; levelSelector.style.display = 'none'; mpStatus.textContent = 'Waiting for countdown...'; }
        else { mpStatus.textContent = 'Error: ' + (res.error || 'unknown'); mpStatus.style.color = '#ef4444'; }
      });
    });

    const rematchBtn = document.getElementById('btn-mp-rematch');
    if (rematchBtn) rematchBtn.addEventListener('click', () => {
      show('multiplayer');
      if (myRoleInRoom === 'host') { btnStartGame.disabled = false; btnStartGame.style.display = 'inline-flex'; levelSelector.style.display = 'block'; mpStatus.textContent = 'Select a level to start rematch.'; mpStatus.style.color = '#4ade80'; }
      else { btnStartGame.disabled = true; btnStartGame.style.display = 'none'; levelSelector.style.display = 'none'; mpStatus.textContent = 'Waiting for Room Master to start rematch...'; mpStatus.style.color = '#fbbf24'; }
    });

    const mpResultBack = document.getElementById('btn-mp-result-back');
    if (mpResultBack) mpResultBack.addEventListener('click', () => { myRoleInRoom = null; show('consent'); });

    const waitingBack = document.getElementById('btn-mp-waiting-back');
    if (waitingBack) waitingBack.addEventListener('click', () => { myRoleInRoom = null; show('consent'); });

    document.addEventListener('visibilitychange', () => {
      if (socket && socket.connected) socket.emit('visibility_change', document.visibilityState === 'visible');
    });
  }

  initApp();
});
