(function () {
  const SERVER_URLS = [
    "https://finchparty.saturumah.net",
    "https://presage-party.onrender.com",
    "https://presage-party.enzonic.dev"
  ];

  // Optional manual override via ?server=render | local | <url>
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const explicitServer = urlParams.get("server");
    if (explicitServer) {
      if (explicitServer === "render") {
        SERVER_URLS.unshift("https://presage-party.onrender.com");
      } else if (explicitServer === "local") {
        SERVER_URLS.unshift("http://127.0.0.1:3000");
      } else if (explicitServer.startsWith("http")) {
        SERVER_URLS.unshift(explicitServer);
      }
    }
  } catch (e) {}

  const DISTRACTION_FILES = [
    "./assets/distractions/distraction_1.mp4",
    "./assets/distractions/distraction_2.mp4",
    "./assets/distractions/distraction_3.mp4",
    "./assets/distractions/distraction_4.mp4",
    "./assets/distractions/distraction_5.mp4",
    "./assets/distractions/distraction_6.mp4",
    "./assets/distractions/distraction_7.mp4",
    "./assets/distractions/distraction_8.mp4"
  ];

  const MODE_META = {
    1: { name: "Chill Mode", hint: "Steady composure. Baseline round." },
    2: { name: "Seriously?", hint: "Audio & text distractions active." },
    3: { name: "Why So Serious?", hint: "Video challenge active. Keep composure!" },
    4: { name: "Don't Scream", hint: "Scare cues active. Post-scare flinches cost -15." }
  };

  const DISTRACTION_CUES = [
    { type: "speech", text: "Look behind you!" },
    { type: "speech", text: "Don't blink. Keep composure!" },
    { type: "ringtone", text: "Brrring! Brrring!" },
    { type: "speech", text: "Are you nervous?" },
    { type: "car", text: "Vroooom! Sound incoming!" },
    { type: "speech", text: "Steady focus... stay composed!" }
  ];

  const SCARY_FACES = ["😱", "👹", "💀", "👻", "😈"];

  let socket = null;
  let serverIndex = 0;
  let pollTimer = null;

  let playerName = "Jack";
  let role = "solo";
  let roomCode = "";
  let players = [];
  let rooms = [];
  let scores = [];

  let videoPackReady = false;
  let videoPackDownloading = false;
  const cachedBlobUrls = [];

  let currentLevel = 1;
  let durationSec = 30;
  let roundRunning = false;
  let roundStartMs = 0;
  let roundEndMs = 0;
  let composure = 100;
  let blinks = 0;
  let talks = 0;
  let rateSpikes = 0;
  let lastTriggerSlot = -1;
  let postScareUntilMs = 0;
  let rafId = null;
  let camStream = null;
  let replayData = null;
  let videoErrorCount = 0;
  let audioCtx = null;

  // DOM Elements
  const connStatusEl = document.getElementById("conn-status");
  const pillModeEl = document.getElementById("pill-mode");
  const pillRoleEl = document.getElementById("pill-role");
  const hostBadgeEl = document.getElementById("host-status-badge");
  const lobbyMsgEl = document.getElementById("lobby-msg");
  const roomCountEl = document.getElementById("room-count");
  const roomListEl = document.getElementById("room-list");
  const activeRoomCodeEl = document.getElementById("active-room-code");
  const playerListEl = document.getElementById("player-list");
  const btnStartMpEl = document.getElementById("btn-start-mp");
  const btnLeaveRoomEl = document.getElementById("btn-leave-room");

  const assetBannerEl = document.getElementById("asset-banner");
  const assetBannerTitleEl = document.getElementById("asset-banner-title");
  const assetBannerDescEl = document.getElementById("asset-banner-desc");
  const assetProgressBarEl = document.getElementById("asset-progress-bar");
  const btnDownloadAssetsEl = document.getElementById("btn-download-assets");

  const arenaTitleEl = document.getElementById("arena-title");
  const arenaSubEl = document.getElementById("arena-sub");
  const composureBarEl = document.getElementById("composure-bar");
  const composureTextEl = document.getElementById("composure-text");
  const penaltyCountersEl = document.getElementById("penalty-counters");
  const hudTimeEl = document.getElementById("hud-time");
  const hudScoreEl = document.getElementById("hud-score");
  const hudBlinksEl = document.getElementById("hud-blinks");
  const hudTalksEl = document.getElementById("hud-talks");
  const arenaStageEl = document.getElementById("arena-stage");
  const videoStageBoxEl = document.getElementById("video-stage-box");
  const arenaVideoEl = document.getElementById("arena-video");
  const stageTimerEl = document.getElementById("stage-timer");
  const stageStatusEl = document.getElementById("stage-status");
  const videoCaptionEl = document.getElementById("video-caption");
  const alertBadgeEl = document.getElementById("alert-badge");
  const jumpscareLayerEl = document.getElementById("jumpscare-layer");
  const scoreboardRowsEl = document.getElementById("scoreboard-rows");

  const telBrEl = document.getElementById("tel-br");
  const telRateEl = document.getElementById("tel-rate");
  const telBlinkEl = document.getElementById("tel-blink");
  const telTalkEl = document.getElementById("tel-talk");

  // Web Audio Synthesizer (for distraction and scare cues)
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playRingtone() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      setTimeout(() => {
        if (!ctx) return;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, ctx.currentTime);
        gain2.gain.setValueAtTime(0.12, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.45);
      }, 550);
    } catch (e) {}
  }

  function playCar() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const bufferSize = ctx.sampleRate * 1.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(200, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(750, ctx.currentTime + 0.7);
      filter.frequency.linearRampToValueAtTime(200, ctx.currentTime + 1.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.35);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.4);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch (e) {}
  }

  function playScream() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.65);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  }

  function playSpeech(text) {
    if ("speechSynthesis" in window) {
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-US";
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      } catch (e) {}
    }
  }

  window.setTab = function (tabId) {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".panel").forEach(panel => {
      panel.classList.remove("active");
    });
    const el = document.getElementById("panel-" + tabId);
    if (el) el.classList.add("active");
  };

  function showAlert(msg) {
    if (!alertBadgeEl) return;
    alertBadgeEl.textContent = msg;
    alertBadgeEl.classList.add("show");
    setTimeout(() => alertBadgeEl.classList.remove("show"), 950);
  }

  function updateAssetBannerUi(pct, statusText) {
    if (assetProgressBarEl && typeof pct === "number") {
      assetProgressBarEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }
    if (videoPackReady) {
      if (assetBannerEl) assetBannerEl.classList.add("ready");
      if (assetBannerTitleEl) assetBannerTitleEl.textContent = "Video Pack Ready (8/8 Clips Cached)";
      if (assetBannerDescEl) {
        assetBannerDescEl.textContent = statusText || "All distraction video clips for Level 3 ('Why So Serious?') are ready to play.";
      }
      if (btnDownloadAssetsEl) {
        btnDownloadAssetsEl.disabled = false;
        btnDownloadAssetsEl.textContent = "Video Pack Ready (Re-verify)";
      }
    } else {
      if (assetBannerEl) assetBannerEl.classList.remove("ready");
      if (assetBannerTitleEl) assetBannerTitleEl.textContent = "Data Download Notice — Level 3 Video Pack (~26.8 MB)";
      if (assetBannerDescEl) {
        assetBannerDescEl.textContent = statusText || "Level 3 ('Why So Serious?') downloads/plays 8 video clips (~26.8 MB total). Download the pack below or use Level 2 ('Seriously?') to avoid video data usage.";
      }
      if (btnDownloadAssetsEl) {
        btnDownloadAssetsEl.disabled = videoPackDownloading;
        btnDownloadAssetsEl.textContent = videoPackDownloading ? "Downloading Video Pack..." : "Download Video Pack (~26.8 MB)";
      }
    }
  }

  window.downloadVideoPack = async function () {
    if (videoPackDownloading) return;
    videoPackDownloading = true;
    let totalBytes = 0;
    let loadedFiles = 0;
    updateAssetBannerUi(5, "Downloading 8 distraction clips (~26.8 MB)...");

    for (let i = 0; i < DISTRACTION_FILES.length; i++) {
      const url = DISTRACTION_FILES[i];
      try {
        const resp = await fetch(url, { cache: "default" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const blob = await resp.blob();
        totalBytes += blob.size;
        cachedBlobUrls[i] = URL.createObjectURL(blob);
        loadedFiles += 1;
        const pct = Math.round(((i + 1) / DISTRACTION_FILES.length) * 100);
        const mb = (totalBytes / (1024 * 1024)).toFixed(1);
        updateAssetBannerUi(pct, "Downloaded " + loadedFiles + "/" + DISTRACTION_FILES.length + " clips (" + mb + " MB)...");
      } catch (e) {
        console.warn("[asset-pack] fallback stream for", url, e);
      }
    }

    videoPackDownloading = false;
    videoPackReady = loadedFiles >= 1;
    const mbDone = (totalBytes / (1024 * 1024)).toFixed(1);
    updateAssetBannerUi(
      videoPackReady ? 100 : 0,
      videoPackReady
        ? "Ready: " + loadedFiles + "/" + DISTRACTION_FILES.length + " clips loaded (" + mbDone + " MB). Level 3 unlocked."
        : "Could not pre-download video pack. Use Level 2 ('Seriously?') or try again."
    );
  };

  function playRandomLevel3Clip() {
    if (!arenaVideoEl || !videoStageBoxEl) return;
    const idx = Math.floor(Math.random() * DISTRACTION_FILES.length);
    const src = cachedBlobUrls[idx] || DISTRACTION_FILES[idx];
    videoStageBoxEl.style.display = "flex";
    if (arenaStageEl) arenaStageEl.classList.add("video-split");
    if (videoCaptionEl) videoCaptionEl.textContent = "Playing clip #" + (idx + 1) + " of " + DISTRACTION_FILES.length + " — stay composed!";

    arenaVideoEl.srcObject = null;
    arenaVideoEl.src = src;
    arenaVideoEl.muted = false;
    arenaVideoEl.play().catch(() => {
      arenaVideoEl.muted = true;
      arenaVideoEl.play().catch(() => {
        if (stageStatusEl) stageStatusEl.textContent = "Tap play on video or fallback to Level 2 ('Seriously?').";
      });
    });
  }

  function stopArenaVideo() {
    if (arenaVideoEl) {
      arenaVideoEl.pause();
      if (!camStream) {
        arenaVideoEl.removeAttribute("src");
        arenaVideoEl.load();
      }
    }
    if (!camStream) {
      if (videoStageBoxEl) videoStageBoxEl.style.display = "none";
      if (arenaStageEl) arenaStageEl.classList.remove("video-split");
      if (videoCaptionEl) videoCaptionEl.textContent = "";
    }
  }

  if (arenaVideoEl) {
    arenaVideoEl.addEventListener("error", () => {
      if (currentLevel === 3 && roundRunning) {
        videoErrorCount++;
        if (videoErrorCount >= 3) {
          currentLevel = 2;
          stopArenaVideo();
          if (stageStatusEl) stageStatusEl.textContent = "Video unavailable. Switched to Level 2 ('Seriously?') distractions.";
          showAlert("LEVEL 2 FALLBACK");
        } else {
          setTimeout(() => {
            if (currentLevel === 3 && roundRunning) playRandomLevel3Clip();
          }, 1000);
        }
      }
    });
  }

  window.toggleCameraPreview = async function () {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
      if (arenaVideoEl) arenaVideoEl.srcObject = null;
      if (videoStageBoxEl) videoStageBoxEl.style.display = "none";
      if (arenaStageEl) arenaStageEl.classList.remove("video-split");
      if (stageStatusEl) stageStatusEl.textContent = "Local camera stopped.";
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (stageStatusEl) stageStatusEl.textContent = "Browser camera API not available on this device.";
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (arenaVideoEl) {
        arenaVideoEl.removeAttribute("src");
        arenaVideoEl.srcObject = camStream;
        arenaVideoEl.muted = true;
        arenaVideoEl.play().catch(() => {});
      }
      if (videoStageBoxEl) videoStageBoxEl.style.display = "flex";
      if (arenaStageEl) arenaStageEl.classList.add("video-split");
      if (stageStatusEl) stageStatusEl.textContent = "Local camera active on device (no frames sent to server).";
    } catch (err) {
      if (stageStatusEl) stageStatusEl.textContent = "Camera permission denied or unavailable.";
    }
  };

  window.loadReplaySample = async function () {
    try {
      const resp = await fetch("./assets/face30.metrics.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      replayData = await resp.json();
      const s = (replayData.samples && replayData.samples[0]) || null;
      const r = (replayData.rates && replayData.rates[0]) || null;
      if (s) {
        if (telBrEl) telBrEl.textContent = typeof s.br === "number" ? s.br.toFixed(2) : "—";
        if (telBlinkEl) telBlinkEl.textContent = s.blink ? "yes" : "no";
        if (telTalkEl) telTalkEl.textContent = s.talk ? "yes" : "no";
      }
      if (telRateEl) telRateEl.textContent = r && typeof r.value === "number" ? r.value.toFixed(1) + " bpm" : "—";
      if (stageStatusEl) {
        stageStatusEl.textContent = "Loaded replay timeline (" + ((replayData.samples && replayData.samples.length) || 0) + " samples).";
      }
    } catch (e) {
      if (stageStatusEl) stageStatusEl.textContent = "Replay metrics file unavailable.";
    }
  };

  function updateReplayHud(elapsedMs) {
    if (!replayData || !Array.isArray(replayData.samples) || replayData.samples.length === 0) return;
    const samples = replayData.samples;
    const maxT = samples[samples.length - 1].t || 1;
    const tMs = elapsedMs % maxT;
    let cur = samples[0];
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].t <= tMs) cur = samples[i];
      else break;
    }
    if (cur) {
      if (telBrEl) telBrEl.textContent = typeof cur.br === "number" ? cur.br.toFixed(2) : "—";
      if (telBlinkEl) telBlinkEl.textContent = cur.blink ? "yes" : "no";
      if (telTalkEl) telTalkEl.textContent = cur.talk ? "yes" : "no";
    }
    if (Array.isArray(replayData.rates) && replayData.rates.length > 0) {
      let rateCur = replayData.rates[0];
      for (let j = 0; j < replayData.rates.length; j++) {
        if (replayData.rates[j].t <= tMs) rateCur = replayData.rates[j];
        else break;
      }
      if (rateCur && typeof rateCur.value === "number" && telRateEl) {
        telRateEl.textContent = rateCur.value.toFixed(1) + " bpm";
      }
    }
  }

  function updateRoleUi() {
    const isHost = role === "host";
    if (btnLeaveRoomEl) {
      btnLeaveRoomEl.style.display = roomCode ? "inline-flex" : "none";
    }
    if (btnStartMpEl) {
      btnStartMpEl.disabled = !(roomCode && isHost && players.length >= 2);
      if (roomCode && isHost && players.length < 2) {
        btnStartMpEl.title = "Waiting for a 2nd player to join before starting match.";
      } else {
        btnStartMpEl.title = "";
      }
    }
    if (pillRoleEl) {
      if (isHost) pillRoleEl.textContent = "ROLE: 👑 ROOM MASTER";
      else if (role === "guest") pillRoleEl.textContent = "ROLE: 🎮 GUEST";
      else pillRoleEl.textContent = "ROLE: SOLO";
    }
    if (hostBadgeEl) {
      if (isHost) hostBadgeEl.textContent = "👑 ROOM MASTER";
      else if (role === "guest") hostBadgeEl.textContent = "🎮 GUEST";
      else hostBadgeEl.textContent = "HOST CONTROL";
    }
  }

  function renderRooms() {
    if (!roomListEl) return;
    const list = Array.isArray(rooms) ? rooms : [];
    if (roomCountEl) roomCountEl.textContent = list.length + " active";
    if (list.length === 0) {
      roomListEl.innerHTML = '<div class="muted">No active rooms available. Create one as Room Master.</div>';
      return;
    }
    roomListEl.innerHTML = list.map(r => {
      const code = r.code || r.roomCode || "";
      const hostName = r.host || r.hostName || "Room Master";
      return '<div class="room-item">' +
        '<div><strong>' + code + '</strong> <span class="muted">· Host: ' + hostName + '</span></div>' +
        '<button type="button" class="btn btn-m2" onclick="window.joinWithCode(\'' + code + '\')">Join</button>' +
        '</div>';
    }).join("");
  }

  function renderPlayers() {
    if (!playerListEl) return;
    if (activeRoomCodeEl) activeRoomCodeEl.textContent = roomCode || "-";
    if (!roomCode) {
      playerListEl.innerHTML = '<div class="muted">Not in a multiplayer room.</div>';
      return;
    }
    const list = players.length > 0 ? players : [{ name: playerName, role: role === "host" ? "host" : "guest" }];
    playerListEl.innerHTML = list.map(p => {
      const badge = p.role === "host"
        ? '<span class="badge-master">👑 ROOM MASTER</span>'
        : '<span class="badge-guest">🎮 PLAYER</span>';
      return '<div class="player-item"><strong>' + (p.name || "Player") + '</strong>' + badge + '</div>';
    }).join("");
  }

  function renderScoreboard() {
    if (!scoreboardRowsEl) return;
    if (!Array.isArray(scores) || scores.length === 0) {
      scoreboardRowsEl.innerHTML = '<div class="muted">No match results recorded yet.</div>';
      return;
    }
    const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
    scoreboardRowsEl.innerHTML = sorted.map((s, i) => {
      const tag = s.role === "host"
        ? '<span class="badge-master">👑 ROOM MASTER</span>'
        : '<span class="badge-guest">🎮 PLAYER</span>';
      return '<div class="score-item">' +
        '<div><strong>#' + (i + 1) + ' ' + s.name + '</strong> ' + tag + ' <span class="muted">(' + s.modeName + ')</span></div>' +
        '<strong>' + s.score + ' / 1000</strong>' +
        '</div>';
    }).join("");
  }

  function recordScore(name, pts, r) {
    const modeName = (MODE_META[currentLevel] && MODE_META[currentLevel].name) || "Chill Mode";
    const clamped = Math.max(0, Math.min(1000, Math.round(pts)));
    const idx = scores.findIndex(item => item.name === name);
    const entry = { name, score: clamped, role: r || role, modeName };
    if (idx >= 0) scores[idx] = entry;
    else scores.push(entry);
    renderScoreboard();
  }

  function refreshArenaHud(remainingMs) {
    const secLeft = Math.max(0, Math.ceil(remainingMs / 1000));
    const liveScore = composure > 0 ? Math.round(composure * 10) : 0;

    if (stageTimerEl) stageTimerEl.textContent = String(secLeft);
    if (hudTimeEl) hudTimeEl.textContent = secLeft + "s";
    if (hudScoreEl) hudScoreEl.textContent = String(liveScore);
    if (hudBlinksEl) hudBlinksEl.textContent = String(blinks);
    if (hudTalksEl) hudTalksEl.textContent = String(talks);
    if (penaltyCountersEl) {
      penaltyCountersEl.textContent = "blinks: " + blinks + " · talks: " + talks + " · rate: " + rateSpikes;
    }

    const cRounded = Math.max(0, Math.min(100, Math.round(composure)));
    if (composureBarEl) {
      composureBarEl.style.width = cRounded + "%";
      if (cRounded > 60) composureBarEl.style.backgroundColor = "#4ade80";
      else if (cRounded > 30) composureBarEl.style.backgroundColor = "#fbbf24";
      else composureBarEl.style.backgroundColor = "#f87171";
    }
    if (composureTextEl) composureTextEl.textContent = "COMPOSURE " + cRounded + "%";
  }

  function triggerModeCue(slot) {
    if (currentLevel === 2) {
      const cue = DISTRACTION_CUES[slot % DISTRACTION_CUES.length];
      if (stageStatusEl) stageStatusEl.textContent = cue.text;
      showAlert("DISTRACTION");
      if (cue.type === "speech") playSpeech(cue.text);
      else if (cue.type === "ringtone") playRingtone();
      else if (cue.type === "car") playCar();
    } else if (currentLevel === 3) {
      if (stageStatusEl) stageStatusEl.textContent = "Why So Serious? Watch clip & keep composure!";
      showAlert("FOCUS TEST");
    } else if (currentLevel === 4) {
      postScareUntilMs = Date.now() + 1800;
      const face = SCARY_FACES[slot % SCARY_FACES.length];
      if (jumpscareLayerEl) {
        jumpscareLayerEl.textContent = face;
        jumpscareLayerEl.classList.add("active");
        setTimeout(() => jumpscareLayerEl.classList.remove("active"), 550);
      }
      playScream();
      if (stageStatusEl) stageStatusEl.textContent = "SCARE CUE! Post-scare blink penalty is -15!";
      showAlert("SCARE CUE!");
    }
  }

  function stepRound() {
    if (!roundRunning) return;
    const now = Date.now();
    const elapsed = now - roundStartMs;
    const remaining = roundEndMs - now;

    updateReplayHud(elapsed);

    if (currentLevel >= 2) {
      const slot = Math.floor(elapsed / 5000);
      if (slot > lastTriggerSlot && slot > 0) {
        lastTriggerSlot = slot;
        triggerModeCue(slot);
      }
    }

    refreshArenaHud(remaining);

    if (composure <= 0 || remaining <= 0) {
      window.endRound(true);
      return;
    }
    rafId = requestAnimationFrame(stepRound);
  }

  function startRound(level, sec) {
    let targetLevel = Number(level) || 1;
    if (targetLevel === 3 && !videoPackReady && !cachedBlobUrls.length) {
      updateAssetBannerUi(0, "Level 3 video pack (~26.8 MB) is not downloaded yet. Download it first or play Level 2.");
    }

    currentLevel = targetLevel;
    durationSec = Number(sec) || 30;
    videoErrorCount = 0;
    const meta = MODE_META[currentLevel] || MODE_META[1];

    if (pillModeEl) pillModeEl.textContent = "MODE: " + meta.name.toUpperCase();
    if (arenaTitleEl) arenaTitleEl.textContent = meta.name;
    if (arenaSubEl) arenaSubEl.textContent = meta.hint;
    if (stageStatusEl) stageStatusEl.textContent = meta.hint;

    if (currentLevel === 3) {
      playRandomLevel3Clip();
    } else if (!camStream) {
      stopArenaVideo();
    }

    if (rafId) cancelAnimationFrame(rafId);
    roundRunning = true;
    composure = 100;
    blinks = 0;
    talks = 0;
    rateSpikes = 0;
    lastTriggerSlot = 0;
    postScareUntilMs = 0;
    roundStartMs = Date.now();
    roundEndMs = roundStartMs + durationSec * 1000;

    refreshArenaHud(durationSec * 1000);
    window.setTab("arena");
    rafId = requestAnimationFrame(stepRound);
  }

  window.selectAndLaunchMode = function (level) {
    const durEl = document.getElementById("select-duration");
    const dur = durEl ? Number(durEl.value) : 30;
    if (Number(level) === 3 && !videoPackReady) {
      window.setTab("lobby");
      updateAssetBannerUi(0, "Please click 'Download Video Pack (~26.8 MB)' above before launching Level 3, or choose Level 2.");
      if (assetBannerEl && assetBannerEl.scrollIntoView) {
        assetBannerEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    startRound(level, dur);
  };

  window.startSoloNow = function () {
    startRound(currentLevel, durationSec);
  };

  window.simBlink = function () {
    if (!roundRunning) return;
    const pen = Date.now() < postScareUntilMs ? 15 : 4;
    blinks += 1;
    composure = Math.max(0, composure - pen);
    showAlert(pen === 15 ? "POST-SCARE -" + pen : "BLINK -" + pen);
    refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
    if (composure <= 0) window.endRound(true);
  };

  window.simTalk = function () {
    if (!roundRunning) return;
    talks += 1;
    composure = Math.max(0, composure - 8);
    showAlert("TALK -8");
    refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
    if (composure <= 0) window.endRound(true);
  };

  window.submitCurrentScore = function () {
    const finalPts = composure > 0 ? Math.round(composure * 10) : 0;
    recordScore(playerName, finalPts, role);
    if (socket && socket.connected) {
      socket.emit("report_score", {
        score: finalPts,
        blinks,
        talks,
        rateSpikes,
        survived: composure > 0
      });
    }
  };

  window.endRound = function (submit) {
    roundRunning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (jumpscareLayerEl) jumpscareLayerEl.classList.remove("active");
    stopArenaVideo();
    refreshArenaHud(0);
    if (stageStatusEl) {
      stageStatusEl.textContent = composure > 0
        ? "Round complete! Survived with " + Math.round(composure) + "% composure."
        : "Eliminated — composure reached 0%.";
    }
    if (submit) window.submitCurrentScore();
    window.setTab("scoreboard");
  };

  window.refreshRooms = function () {
    if (socket && socket.connected) socket.emit("get_rooms");
  };

  window.createRoom = function () {
    const nameEl = document.getElementById("input-name");
    const passEl = document.getElementById("input-pass");
    playerName = (nameEl && nameEl.value.trim()) || "Jack";
    if (!socket || !socket.connected) {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Connecting to server... try again in a moment.";
      return;
    }
    socket.emit("create_room", {
      name: playerName,
      hostName: playerName,
      password: passEl ? passEl.value.trim() : ""
    });
  };

  window.joinWithCode = function (code) {
    const codeEl = document.getElementById("input-code");
    if (codeEl) codeEl.value = code;
    window.joinRoom();
  };

  window.joinRoom = function () {
    const nameEl = document.getElementById("input-name");
    const codeEl = document.getElementById("input-code");
    const passEl = document.getElementById("input-pass");
    playerName = (nameEl && nameEl.value.trim()) || "Jack";
    const code = (codeEl && codeEl.value.trim().toUpperCase()) || "";
    if (!code) {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Enter a room code or pick a room from Active Rooms.";
      return;
    }
    if (!socket || !socket.connected) {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Server not connected yet.";
      return;
    }
    socket.emit("join_room", {
      code,
      name: playerName,
      password: passEl ? passEl.value.trim() : ""
    }, (res) => {
      if (res && res.success === false && lobbyMsgEl) {
        lobbyMsgEl.textContent = "Join failed: " + (res.error || "Unable to join room");
      }
    });
  };

  window.leaveRoom = function () {
    if (!roomCode) return;
    roomCode = "";
    role = "solo";
    players = [];
    const codeEl = document.getElementById("input-code");
    if (codeEl) codeEl.value = "";
    updateRoleUi();
    renderPlayers();
    if (lobbyMsgEl) lobbyMsgEl.textContent = "Left room. You are now in Solo mode.";
    showAlert("LEFT ROOM");
    if (socket && socket.connected) {
      socket.disconnect();
      socket.connect();
    }
  };

  window.startMultiplayerRound = function () {
    if (!roomCode || role !== "host") {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Only the 👑 ROOM MASTER can start the multiplayer round.";
      return;
    }
    if (players.length < 2) {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Wait for a 2nd player to join before starting.";
      showAlert("WAITING FOR GUEST");
      return;
    }
    const durEl = document.getElementById("select-duration");
    const dur = durEl ? Number(durEl.value) : 30;
    if (socket && socket.connected) {
      socket.emit("start_game", { level: currentLevel, duration: dur }, (res) => {
        if (res && res.success === false && lobbyMsgEl) {
          lobbyMsgEl.textContent = res.error || "Wait for a second player to join before starting.";
        }
      });
    }
  };

  // Visibility and Anti-cheat integration
  document.addEventListener("visibilitychange", () => {
    const isVisible = document.visibilityState === "visible";
    if (socket && socket.connected) {
      socket.emit("visibility_change", isVisible);
    }
    if (!isVisible && roundRunning) {
      showAlert("WINDOW MINIMIZED");
    }
  });

  function connectSocket() {
    if (typeof window.io !== "function") return;
    const target = SERVER_URLS[serverIndex];
    if (connStatusEl) connStatusEl.textContent = "Connecting to " + target + "...";

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    const isLastServer = serverIndex >= SERVER_URLS.length - 1;
    socket = window.io(target, {
      transports: ["polling", "websocket"],
      timeout: isLastServer ? 5000 : 2500,
      reconnection: isLastServer,
      reconnectionAttempts: isLastServer ? 5 : 0
    });

    socket.on("connect", () => {
      const serverLabel = target.includes("finchparty") ? " (Primary)" : (target.includes("onrender") ? " (Render Cloud)" : "");
      if (connStatusEl) {
        connStatusEl.textContent = "Connected: " + target + serverLabel;
      }
      if (socket.io) socket.io.opts.reconnection = true;
      socket.emit("get_rooms");
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (socket && socket.connected) socket.emit("get_rooms");
      }, 3500);
    });

    socket.on("connect_error", (err) => {
      console.warn("[socket] connect_error for " + target, err);
      if (serverIndex + 1 < SERVER_URLS.length) {
        serverIndex += 1;
        connectSocket();
      } else if (connStatusEl) {
        connStatusEl.textContent = "Server offline. Solo mode active.";
      }
    });

    socket.on("rooms_list", (list) => {
      rooms = Array.isArray(list) ? list : [];
      renderRooms();
    });

    socket.on("room_created", (data) => {
      role = "host";
      roomCode = (data && (data.roomCode || data.code)) || "";
      const codeEl = document.getElementById("input-code");
      if (codeEl && roomCode) codeEl.value = roomCode;
      players = [{ name: (data && data.hostName) || playerName, role: "host" }];
      updateRoleUi();
      renderPlayers();
      recordScore(playerName, 0, "host");
      if (lobbyMsgEl) lobbyMsgEl.textContent = "👑 Room " + roomCode + " created. You are Room Master.";
      showAlert("ROOM " + roomCode + " CREATED");
      socket.emit("get_rooms");
    });

    socket.on("room_joined", (data) => {
      role = "guest";
      roomCode = (data && data.code) || roomCode;
      players = [];
      if (data && data.hostName) players.push({ name: data.hostName, role: "host" });
      players.push({ name: playerName, role: "guest" });
      updateRoleUi();
      renderPlayers();
      recordScore(playerName, 0, "guest");
      if (lobbyMsgEl) {
        lobbyMsgEl.textContent = "🎮 Joined room " + roomCode + " (Host: " + ((data && data.hostName) || "Room Master") + ").";
      }
      showAlert("JOINED ROOM " + roomCode);
    });

    socket.on("player_joined", (p) => {
      if (p && p.name && !players.some(x => x.name === p.name)) {
        players.push({ name: p.name, role: "guest" });
        updateRoleUi();
        renderPlayers();
      }
      if (lobbyMsgEl) lobbyMsgEl.textContent = ((p && p.name) || "Player") + " joined room " + roomCode + ".";
      showAlert(((p && p.name) || "Player") + " JOINED");
    });

    socket.on("game_start", (payload) => {
      const startAt = (payload && payload.startAt) || Date.now();
      const delay = Math.max(0, startAt - Date.now());
      const lvl = (payload && payload.level) || currentLevel;
      const dur = (payload && payload.duration) || durationSec;
      if (stageStatusEl) stageStatusEl.textContent = "Match starting in " + Math.ceil(delay / 1000) + "s...";
      showAlert("MATCH STARTING");
      window.setTab("arena");
      setTimeout(() => startRound(lvl, dur), delay);
    });

    socket.on("game_result", (payload) => {
      if (payload && payload.hostName && payload.host) {
        recordScore(payload.hostName, payload.host.score || 0, "host");
      }
      if (payload && payload.guestName && payload.guest) {
        recordScore(payload.guestName, payload.guest.score || 0, "guest");
      }
      const winner = payload && payload.winner;
      const winnerMsg = winner === "tie"
        ? "Match ended in a tie!"
        : (winner === role ? "🏆 You won the match!" : "Match finished.");
      if (stageStatusEl) stageStatusEl.textContent = winnerMsg;
      showAlert(winnerMsg);
      window.setTab("scoreboard");
    });

    socket.on("cheat_penalty", (amount) => {
      const pen = Number(amount) || 10;
      composure = Math.max(0, composure - pen);
      if (stageStatusEl) stageStatusEl.textContent = "FOCUS! Penalty applied (-" + pen + "% composure).";
      showAlert("-" + pen + "% FOCUS PENALTY");
      refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
      if (composure <= 0) window.endRound(true);
    });

    socket.on("opponent_cheated", () => {
      if (stageStatusEl) stageStatusEl.textContent = "Opponent tab minimized — penalty applied!";
      showAlert("OPPONENT PENALIZED");
    });

    socket.on("host_migrated", (newHostId) => {
      if (socket && socket.id === newHostId) {
        role = "host";
        players = players.map(p => (p.name === playerName ? { ...p, role: "host" } : p));
        updateRoleUi();
        renderPlayers();
        if (lobbyMsgEl) lobbyMsgEl.textContent = "Host disconnected. You are now 👑 ROOM MASTER.";
        showAlert("YOU ARE NOW HOST");
      }
    });

    socket.on("opponent_left", () => {
      players = players.filter(p => p.name === playerName || p.role === "host");
      updateRoleUi();
      renderPlayers();
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Opponent left the room. Waiting for new player...";
      showAlert("OPPONENT LEFT");
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    updateRoleUi();
    updateAssetBannerUi(0);
    renderRooms();
    renderPlayers();
    renderScoreboard();
    refreshArenaHud(30000);
    window.loadReplaySample();
    connectSocket();
  });
})();
