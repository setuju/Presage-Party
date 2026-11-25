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
    3: { name: "Why So Serious?", hint: "Vertical video challenge active. Keep composure!" },
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

  const STORAGE_KEY_SCORES = "flinch_royale_scoreboard_v1";
  const STORAGE_KEY_ASSET_PACK = "flinch_video_pack_ready_v1";

  function loadStoredScores() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SCORES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function saveStoredScores() {
    try {
      localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(scores));
    } catch (e) {}
  }

  function checkStoredAssetPackReady() {
    try {
      return localStorage.getItem(STORAGE_KEY_ASSET_PACK) === "true";
    } catch (e) {
      return false;
    }
  }

  const STORAGE_KEY_PLAYER_NAME = "flinch_player_name";

  let socket = null;
  let serverIndex = 0;
  let pollTimer = null;

  const storedPlayerName = (function () {
    try {
      return localStorage.getItem(STORAGE_KEY_PLAYER_NAME) || "";
    } catch (e) {
      return "";
    }
  })();
  let playerName = storedPlayerName;
  let role = "solo";
  let roomCode = "";
  let players = [];
  let rooms = [];
  let scores = loadStoredScores();

  let videoPackReady = checkStoredAssetPackReady();
  let videoPackDownloading = false;
  const cachedBlobUrls = [];

  let currentLevel = 1;
  let durationSec = 30;
  let roundRunning = false;
  let roundStartMs = 0;
  let roundEndMs = 0;
  let syncSeed = 0;
  let videoPlayOrder = [];
  let currentVideoIndex = 0;
  let composure = 100;
  let blinks = 0;
  let talks = 0;
  let rateSpikes = 0;
  let lastTriggerSlot = -1;
  let postScareUntilMs = 0;
  let rafId = null;

  // Real-time Camera & Optical Motion/Flinch Tracker
  let camStream = null;
  let motionCheckTimer = null;
  let prevFrameData = null;
  let lastFlinchTime = 0;
  let sustainedMotionMs = 0;
  let lastMotionCheckTime = 0;
  const FLINCH_THRESHOLD = 9.5;
  const FLINCH_COOLDOWN_MS = 1400;

  const motionCanvas = document.createElement("canvas");
  motionCanvas.width = 64;
  motionCanvas.height = 48;
  const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });

  // Replay timeline
  let replayData = null;
  let lastReplayBlinkState = false;
  let lastReplayBlinkTime = -Infinity;
  let replayTalkAccumMs = 0;
  let lastReplayTalkTime = -Infinity;
  let lastRatePenaltyTime = -Infinity;

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

  // Stage boxes
  const reelStageBoxEl = document.getElementById("reel-stage-box");
  const reelVideoEl = document.getElementById("reel-video");
  const cameraStageBoxEl = document.getElementById("camera-stage-box");
  const cameraVideoEl = document.getElementById("camera-video");
  const camBadgeTextEl = document.getElementById("cam-badge-text");
  const camDotEl = document.getElementById("cam-dot");
  const motionTextEl = document.getElementById("motion-text");
  const signalTextEl = document.getElementById("signal-text");
  const btnCamEl = document.getElementById("btn-cam");

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
  // Simple HTML escape to prevent XSS
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

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

  // --- 8-BIT RETRO SFX AUDIO SYNTHESIZER ---
  function play8BitSound(type) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (type === "blink") {
        // High-pitched blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === "flinch") {
        // Low distorted buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.22);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "countdown") {
        // Retro coin / pip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(587.33, now); // D5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === "victory") {
        // 8-bit celebratory arpeggio
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(0.12, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.2);
        });
      } else if (type === "gameover") {
        // 8-bit failure descend
        const notes = [311.13, 293.66, 277.18, 261.63];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, now + idx * 0.14);
          gain.gain.setValueAtTime(0.2, now + idx * 0.14);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.14 + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.14);
          osc.stop(now + idx * 0.14 + 0.22);
        });
      }
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

    if (tabId === "arena") {
      window.ensureCameraActive();
    }
  };

  function showAlert(msg) {
    if (!alertBadgeEl) return;
    alertBadgeEl.textContent = msg;
    alertBadgeEl.classList.add("show");
    setTimeout(() => alertBadgeEl.classList.remove("show"), 950);
  }

  // --- CAMERA & REAL-TIME MOTION SENSING ENGINE ---

  window.requestCameraPermission = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camBadgeTextEl) camBadgeTextEl.textContent = "NO CAMERA (REPLAY ACTIVE)";
      if (signalTextEl) signalTextEl.textContent = "Signals: SmartSpectra Timeline";
      if (btnCamEl) btnCamEl.textContent = "📷 Camera: OFF";
      return false;
    }
    try {
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (cameraVideoEl) {
        cameraVideoEl.srcObject = camStream;
        cameraVideoEl.muted = true;
        await cameraVideoEl.play().catch(() => {});
      }
      if (camBadgeTextEl) camBadgeTextEl.textContent = "CAMERA LIVE · FLINCH TRACKER";
      if (camDotEl) { camDotEl.style.backgroundColor = "#4ade80"; camDotEl.style.display = "inline-block"; }
      if (signalTextEl) signalTextEl.textContent = "Signals: Live Camera (Tracking)";
      if (btnCamEl) btnCamEl.textContent = "📷 Camera: ON";
      if (stageStatusEl && !roundRunning) {
        stageStatusEl.textContent = "Camera active — stay steady and don't flinch!";
      }

      if (motionCheckTimer) clearInterval(motionCheckTimer);
      motionCheckTimer = setInterval(analyzeCameraFrame, 100);
      return true;
    } catch (err) {
      console.warn("[camera] Permission not granted or device unavailable:", err);
      if (camBadgeTextEl) camBadgeTextEl.textContent = "CAMERA OFF (REPLAY ACTIVE)";
      if (camDotEl) camDotEl.style.backgroundColor = "#fbbf24";
      if (signalTextEl) signalTextEl.textContent = "Signals: SmartSpectra Replay";
      if (btnCamEl) btnCamEl.textContent = "📷 Camera: OFF";
      if (stageStatusEl && !roundRunning) {
        stageStatusEl.textContent = "Camera unavailable. SmartSpectra Replay metrics active.";
      }
      return false;
    }
  };

  window.ensureCameraActive = async function () {
    if (camStream && camStream.active) return true;
    return await window.requestCameraPermission();
  };

  window.toggleCameraPreview = async function () {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
      if (cameraVideoEl) cameraVideoEl.srcObject = null;
      if (motionCheckTimer) { clearInterval(motionCheckTimer); motionCheckTimer = null; }
      if (camBadgeTextEl) camBadgeTextEl.textContent = "CAMERA OFF · REPLAY READY";
      if (camDotEl) camDotEl.style.backgroundColor = "#fbbf24";
      if (signalTextEl) signalTextEl.textContent = "Signals: SmartSpectra Replay";
      if (btnCamEl) btnCamEl.textContent = "📷 Camera: OFF";
      if (stageStatusEl) stageStatusEl.textContent = "Camera paused. SmartSpectra Replay metrics active.";
      return;
    }
    await window.requestCameraPermission();
  };

  function analyzeCameraFrame() {
    if (!camStream || !cameraVideoEl || cameraVideoEl.readyState < 2) return;
    try {
      motionCtx.drawImage(cameraVideoEl, 0, 0, 64, 48);
      const img = motionCtx.getImageData(0, 0, 64, 48);
      const data = img.data;
      const now = Date.now();
      const dt = lastMotionCheckTime ? now - lastMotionCheckTime : 100;
      lastMotionCheckTime = now;

      if (prevFrameData) {
        let diffSum = 0;
        let sampledCount = 0;
        // Sample face center region (y: 8..40, x: 14..50)
        for (let y = 8; y < 40; y++) {
          for (let x = 14; x < 50; x++) {
            const idx = (y * 64 + x) * 4;
            const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
            const prevLum = (prevFrameData[idx] * 299 + prevFrameData[idx + 1] * 587 + prevFrameData[idx + 2] * 114) / 1000;
            diffSum += Math.abs(lum - prevLum);
            sampledCount++;
          }
        }
        const energy = diffSum / (sampledCount || 1);

        if (motionTextEl) {
          const isFlinch = energy > FLINCH_THRESHOLD;
          motionTextEl.textContent = "Motion: " + energy.toFixed(1) + (isFlinch ? " (FLINCH!)" : " (Calm)");
          motionTextEl.style.color = isFlinch ? "#f87171" : "#4ade80";
        }

        // Apply real-time camera scoring penalty during round
        if (roundRunning) {
          if (energy > FLINCH_THRESHOLD && (now - lastFlinchTime) > FLINCH_COOLDOWN_MS) {
            lastFlinchTime = now;
            const isScare = now < postScareUntilMs;
            const pen = isScare ? 15 : 4;
            blinks += 1;
            composure = Math.max(0, composure - pen);
            play8BitSound("flinch");
            showAlert(isScare ? "📷 POST-SCARE FLINCH -" + pen : "📷 FLINCH DETECTED -" + pen);
            refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
            if (composure <= 0) window.endRound(true);
          }

          // Sustained high motion = talking / laughing
          if (energy > 5.5) {
            sustainedMotionMs += dt;
            if (sustainedMotionMs > 1700) {
              sustainedMotionMs = 0;
              talks += 1;
              composure = Math.max(0, composure - 8);
              showAlert("📷 TALK / MOVEMENT -8");
              refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
              if (composure <= 0) window.endRound(true);
            }
          } else {
            sustainedMotionMs = Math.max(0, sustainedMotionMs - dt * 0.5);
          }
        }
      }
      prevFrameData = data;
    } catch (e) {}
  }

  // --- ASSET PACK DOWNLOAD & LEVEL 3 REELS ---

  function updateAssetBannerUi(pct, statusText) {
    if (assetProgressBarEl && typeof pct === "number") {
      assetProgressBarEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }
    if (videoPackReady) {
      if (assetBannerEl) assetBannerEl.classList.add("ready");
      if (assetBannerTitleEl) assetBannerTitleEl.textContent = "✅ Video Pack Ready (8/8 Clips Cached)";
      if (assetBannerDescEl) {
        assetBannerDescEl.textContent = statusText || "All distraction YouTube Reel clips for Level 3 ('Why So Serious?') are cached & ready in 9:16 vertical format. Play anytime without re-downloading.";
      }
      if (btnDownloadAssetsEl) {
        btnDownloadAssetsEl.disabled = false;
        btnDownloadAssetsEl.textContent = "✅ Video Pack Installed (Re-verify)";
      }
    } else {
      if (assetBannerEl) assetBannerEl.classList.remove("ready");
      if (assetBannerTitleEl) assetBannerTitleEl.textContent = "Data Download Notice — Level 3 Video Pack (~26.8 MB)";
      if (assetBannerDescEl) {
        assetBannerDescEl.textContent = statusText || "Level 3 ('Why So Serious?') plays 8 vertical YouTube Reels (~26.8 MB total). Download/cache the pack below or use Level 2 ('Seriously?') to avoid video data usage.";
      }
      if (btnDownloadAssetsEl) {
        btnDownloadAssetsEl.disabled = videoPackDownloading;
        btnDownloadAssetsEl.textContent = videoPackDownloading ? "Downloading Video Pack..." : "Download Video Pack (~26.8 MB)";
      }
    }
  }

  async function restoreCachedBlobs() {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open("flinch-distractions-v1");
      for (let i = 0; i < DISTRACTION_FILES.length; i++) {
        if (!cachedBlobUrls[i]) {
          const match = await cache.match(DISTRACTION_FILES[i]);
          if (match) {
            const blob = await match.blob();
            cachedBlobUrls[i] = URL.createObjectURL(blob);
          }
        }
      }
    } catch (e) {
      console.warn("[asset-pack] restore cache error:", e);
    }
  }

  window.downloadVideoPack = async function () {
    if (videoPackDownloading) return;
    videoPackDownloading = true;
    let totalBytes = 0;
    let loadedFiles = 0;
    updateAssetBannerUi(5, "Downloading 8 vertical distraction reels (~26.8 MB)...");

    let cache = null;
    if ('caches' in window) {
      try { cache = await caches.open("flinch-distractions-v1"); } catch (e) {}
    }

    for (let i = 0; i < DISTRACTION_FILES.length; i++) {
      const url = DISTRACTION_FILES[i];
      try {
        let resp = null;
        if (cache) {
          resp = await cache.match(url);
        }
        if (!resp) {
          resp = await fetch(url, { cache: "default" });
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          if (cache) {
            try { await cache.put(url, resp.clone()); } catch (ce) {}
          }
        }
        const blob = await resp.blob();
        totalBytes += blob.size;
        cachedBlobUrls[i] = URL.createObjectURL(blob);
        loadedFiles += 1;
        const pct = Math.round(((i + 1) / DISTRACTION_FILES.length) * 100);
        const mb = (totalBytes / (1024 * 1024)).toFixed(1);
        updateAssetBannerUi(pct, "Downloaded " + loadedFiles + "/" + DISTRACTION_FILES.length + " reels (" + mb + " MB)...");
      } catch (e) {
        console.warn("[asset-pack] fallback stream for", url, e);
      }
    }

    videoPackDownloading = false;
    videoPackReady = loadedFiles >= 1;
    if (videoPackReady) {
      try { localStorage.setItem(STORAGE_KEY_ASSET_PACK, "true"); } catch (e) {}
    }
    const mbDone = (totalBytes / (1024 * 1024)).toFixed(1);
    updateAssetBannerUi(
      videoPackReady ? 100 : 0,
      videoPackReady
        ? "Video pack ready: " + loadedFiles + "/" + DISTRACTION_FILES.length + " reels cached permanently (" + mbDone + " MB). Level 3 unlocked."
        : "Could not pre-download video pack. Use Level 2 ('Seriously?') or try again."
    );
  };

  function generateVideoOrder(seed) {
    const arr = Array.from({ length: DISTRACTION_FILES.length }, (_, i) => i);
    let s = Number(seed) || 12345;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const rnd = s / 233280;
      const j = Math.floor(rnd * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  let reelTransitioning = false;

  function playNextLevel3Clip() {
    if (!reelVideoEl || !reelStageBoxEl) return;
    if (currentLevel !== 3) {
      stopLevel3Reel();
      return;
    }
    if (!videoPlayOrder || videoPlayOrder.length === 0) {
      videoPlayOrder = generateVideoOrder(syncSeed || Date.now());
      currentVideoIndex = 0;
    }
    if (currentVideoIndex >= videoPlayOrder.length) {
      videoPlayOrder = generateVideoOrder((syncSeed || Date.now()) + currentVideoIndex + 1);
      currentVideoIndex = 0;
    }
    const idx = videoPlayOrder[currentVideoIndex];
    currentVideoIndex++;
    const src = cachedBlobUrls[idx] || DISTRACTION_FILES[idx];

    if (videoCaptionEl) {
      videoCaptionEl.textContent = "Reel #" + (idx + 1) + " of " + DISTRACTION_FILES.length + " · Keep composure!";
    }

    try {
      reelVideoEl.pause();
    } catch (e) {}

    reelTransitioning = false;
    reelVideoEl.setAttribute("playsinline", "true");
    reelVideoEl.setAttribute("webkit-playsinline", "true");
    reelVideoEl.src = src;
    reelVideoEl.currentTime = 0;

    const tryPlay = () => {
      const p = reelVideoEl.play();
      if (p !== undefined) {
        p.catch(() => {
          reelVideoEl.muted = true;
          reelVideoEl.play().catch(() => {
            if (stageStatusEl) stageStatusEl.textContent = "Tap video or play button to start Reel!";
          });
        });
      }
    };

    if (reelVideoEl.readyState >= 2) {
      tryPlay();
    } else {
      const onCanPlay = () => {
        reelVideoEl.removeEventListener("canplay", onCanPlay);
        tryPlay();
      };
      reelVideoEl.addEventListener("canplay", onCanPlay, { once: true });
      reelVideoEl.load();
    }
  }


  function stopLevel3Reel() {
    if (reelVideoEl) {
      reelVideoEl.pause();
      reelVideoEl.removeAttribute("src");
      reelVideoEl.load();
    }
    if (reelStageBoxEl) reelStageBoxEl.style.display = "none";
    if (videoCaptionEl) videoCaptionEl.textContent = "";
  }

  if (reelVideoEl) {
    reelVideoEl.addEventListener("ended", () => {
      if (currentLevel === 3 && roundRunning) {
        playNextLevel3Clip();
      }
    });

    reelVideoEl.addEventListener("timeupdate", () => {
      if (currentLevel === 3 && roundRunning && reelVideoEl.duration > 1) {
        if (!reelTransitioning && reelVideoEl.currentTime >= reelVideoEl.duration - 0.3) {
          reelTransitioning = true;
          playNextLevel3Clip();
        }
      }
    });

    reelVideoEl.addEventListener("error", () => {
      if (currentLevel === 3 && roundRunning) {
        videoErrorCount++;
        if (videoErrorCount >= 3) {
          currentLevel = 2;
          stopLevel3Reel();
          if (arenaStageEl) arenaStageEl.className = "stage";
          if (stageStatusEl) stageStatusEl.textContent = "Video unavailable. Switched to Level 2 ('Seriously?') distractors.";
          showAlert("LEVEL 2 FALLBACK");
        } else {
          setTimeout(() => {
            if (currentLevel === 3 && roundRunning) playNextLevel3Clip();
          }, 1000);
        }
      }
    });
  }

  // --- REPLAY TIMELINE ---

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
      const code = escapeHTML(r.code || r.roomCode || "");
      const hostName = escapeHTML(r.host || r.hostName || "Room Master");
      const safeCode = String(r.code || r.roomCode || "").replace(/[^a-zA-Z0-9_-]/g, "");
      return '<div class="room-item">' +
        '<div><strong>' + escapeHTML(safeCode) + '</strong> <span class="muted">· Host: ' + hostName + '</span></div>' +
        '<button type="button" class="btn btn-m2" data-room="' + escapeHTML(safeCode) + '" onclick="window.joinWithCode(this.getAttribute(\'data-room\'))">Join</button>' +
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
      return '<div class="player-item"><strong>' + escapeHTML(p.name || "Player") + '</strong>' + badge + '</div>';
    }).join("");
  }

  function renderScoreboard() {
    if (!scoreboardRowsEl) return;
    if (!Array.isArray(scores) || scores.length === 0) {
      scoreboardRowsEl.innerHTML = '<div class="muted">No match results recorded yet. Complete a round in the Arena!</div>';
      return;
    }
    const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
    scoreboardRowsEl.innerHTML = sorted.map((s, i) => {
      const tag = s.role === "host"
        ? '<span class="badge-master">👑 ROOM MASTER</span>'
        : '<span class="badge-guest">🎮 PLAYER</span>';
      const rankBadge = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1);
      const datePart = s.date ? ` <span class="muted" style="font-size:11px;">· ${s.date}</span>` : "";
      return `<div class="score-item">
        <div><strong>${rankBadge} ${escapeHTML(s.name)}</strong> ${tag} <span class="muted">(${escapeHTML(s.modeName)})</span>${datePart}</div>
        <strong style="color:var(--green);font-size:15px;letter-spacing:0.5px;">${s.score} / 1000</strong>
      </div>`;
    }).join("");
  }

  function recordScore(name, pts, r) {
    if (!name || !name.trim()) return;
    const modeName = (MODE_META[currentLevel] && MODE_META[currentLevel].name) || "Chill Mode";
    const clamped = Math.max(0, Math.min(1000, Math.round(pts)));
    const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const idx = scores.findIndex(item => item.name === name && item.modeName === modeName);
    const entry = { name, score: clamped, role: r || role, modeName, date: dateStr };
    if (idx >= 0) {
      if (clamped >= (scores[idx].score || 0)) {
        scores[idx] = entry;
      }
    } else {
      scores.push(entry);
    }
    saveStoredScores();
    renderScoreboard();

    // Persist to Leaderboard backend database
    if (clamped > 0) {
      try {
        fetch("api_leaderboard.php?action=submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
            score: clamped,
            modeId: currentLevel,
            modeName: modeName,
            role: r || role
          })
        }).catch(err => console.warn("Leaderboard sync warning:", err));
      } catch (e) {}
    }
  }

  window.clearScoreboard = function () {
    scores = [];
    saveStoredScores();
    renderScoreboard();
    showAlert("LEADERBOARD CLEARED");
  };

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
      if (stageStatusEl) stageStatusEl.textContent = "Why So Serious? Watch YouTube Reel & keep composure!";
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

    // If camera is NOT active, drive penalties from SmartSpectra Replay timeline
    if (!camStream && replayData && Array.isArray(replayData.samples) && replayData.samples.length > 0) {
      const samples = replayData.samples;
      const maxT = samples[samples.length - 1].t || 1;
      const tMs = elapsed % maxT;
      let cur = samples[0];
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].t <= tMs) cur = samples[i];
        else break;
      }
      if (cur) {
        if (cur.blink && !lastReplayBlinkState) {
          if (now - lastReplayBlinkTime > 2000) {
            lastReplayBlinkTime = now;
            const isScare = now < postScareUntilMs;
            const pen = isScare ? 15 : 4;
            blinks += 1;
            composure = Math.max(0, composure - pen);
            showAlert(isScare ? "REPLAY POST-SCARE -" + pen : "REPLAY BLINK -" + pen);
          }
        }
        lastReplayBlinkState = Boolean(cur.blink);

        if (cur.talk) {
          replayTalkAccumMs += 16;
          if (replayTalkAccumMs >= 2000 && (now - lastReplayTalkTime > 3000)) {
            replayTalkAccumMs = 0;
            lastReplayTalkTime = now;
            talks += 1;
            composure = Math.max(0, composure - 8);
            showAlert("REPLAY TALK -8");
          }
        } else {
          replayTalkAccumMs = Math.max(0, replayTalkAccumMs - 8);
        }
      }
    }

    // Breathing rate spike penalty (> 24 bpm) from SmartSpectra rates
    if (replayData && Array.isArray(replayData.rates) && replayData.rates.length > 0) {
      const maxT = replayData.rates[replayData.rates.length - 1].t || 1;
      const tMs = elapsed % maxT;
      let curRate = replayData.rates[0];
      for (let j = 0; j < replayData.rates.length; j++) {
        if (replayData.rates[j].t <= tMs) curRate = replayData.rates[j];
        else break;
      }
      if (curRate && typeof curRate.value === "number") {
        if (curRate.value > 24 && (now - lastRatePenaltyTime > 1500)) {
          lastRatePenaltyTime = now;
          rateSpikes += 1;
          composure = Math.max(0, composure - 1);
          showAlert("BREATHING SPIKE -1");
        }
      }
    }

    // Level-specific cues (cues trigger every 5s for Level 2, 3, 4)
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

  async function startRound(level, sec, seed) {
    let targetLevel = Number(level) || 1;
    if (targetLevel === 3 && !videoPackReady && !cachedBlobUrls.length) {
      updateAssetBannerUi(0, "Level 3 video pack (~26.8 MB) is not downloaded yet. Download it first or play Level 2.");
    }

    currentLevel = targetLevel;
    durationSec = Number(sec) || 30;
    syncSeed = Number(seed) || Math.floor(Math.random() * 1000000);
    videoPlayOrder = generateVideoOrder(syncSeed);
    currentVideoIndex = 0;
    videoErrorCount = 0;
    const meta = MODE_META[currentLevel] || MODE_META[1];

    if (pillModeEl) pillModeEl.textContent = "MODE: " + meta.name.toUpperCase();
    if (arenaTitleEl) arenaTitleEl.textContent = meta.name;
    if (arenaSubEl) arenaSubEl.textContent = meta.hint;
    if (stageStatusEl) stageStatusEl.textContent = meta.hint;

    // Sizing & layout for games:
    // Level 3 displays vertical reel alongside live camera tracker
    // Levels 1, 2, 4 display camera tracker centered on stage
    // Ensure camera is active and asking for permission
    await window.ensureCameraActive();

    if (rafId) cancelAnimationFrame(rafId);
    roundRunning = true;

    // Sizing & layout for games:
    // Level 3 displays vertical reel alongside live camera tracker
    // Levels 1, 2, 4 display camera tracker centered on stage
    if (currentLevel === 3) {
      if (arenaStageEl) arenaStageEl.className = "stage level3-active";
      if (reelStageBoxEl) reelStageBoxEl.style.display = "flex";
      playNextLevel3Clip();
    } else {
      if (arenaStageEl) arenaStageEl.className = "stage";
      stopLevel3Reel();
    }
    composure = 100;
    blinks = 0;
    talks = 0;
    rateSpikes = 0;
    lastTriggerSlot = 0;
    postScareUntilMs = 0;
    lastReplayBlinkTime = 0;
    lastReplayTalkTime = 0;
    lastRatePenaltyTime = 0;
    replayTalkAccumMs = 0;
    roundStartMs = Date.now();
    roundEndMs = roundStartMs + durationSec * 1000;

    refreshArenaHud(durationSec * 1000);
    window.setTab("arena");

    // Scroll smoothly to the Game Arena and lock scrolling during the round
    document.body.classList.add("game-active");
    if (arenaStageEl) {
      arenaStageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    rafId = requestAnimationFrame(stepRound);
  }

  function ensurePlayerName() {
    const nameEl = document.getElementById("input-name");
    const val = (nameEl && nameEl.value.trim()) || playerName.trim();
    if (val) {
      playerName = val;
      try { localStorage.setItem(STORAGE_KEY_PLAYER_NAME, val); } catch (e) {}
      if (nameEl) {
        nameEl.value = val;
        nameEl.style.borderColor = "";
      }
      return val;
    }

    // Politely prompt the user and guide them to the input field
    window.setTab("lobby");
    if (nameEl) {
      nameEl.focus();
      nameEl.style.borderColor = "var(--coral)";
      nameEl.style.boxShadow = "0 0 12px rgba(255, 75, 75, 0.7)";
      setTimeout(() => {
        if (nameEl) nameEl.style.boxShadow = "";
      }, 3000);
    }
    if (lobbyMsgEl) {
      lobbyMsgEl.textContent = "👋 Welcome! Please enter your gamer name first to continue.";
    }
    showAlert("ENTER YOUR NAME");
    return "";
  }

  window.selectAndLaunchMode = async function (level) {
    const validName = ensurePlayerName();
    if (!validName) return;
    const durEl = document.getElementById("select-duration");
    const dur = durEl ? Number(durEl.value) : 30;
    const targetLvl = Number(level);

    if (targetLvl === 3 && !videoPackReady) {
      if (checkStoredAssetPackReady()) {
        videoPackReady = true;
      } else {
        // Automatically unlock and stream directly from server assets
        videoPackReady = true;
        try { localStorage.setItem(STORAGE_KEY_ASSET_PACK, "true"); } catch (e) {}
        updateAssetBannerUi(100, "Level 3 unlocked. Streaming distraction reels directly from server.");
      }
    }
    await startRound(targetLvl, dur);
  };

  window.startSoloNow = async function () {
    const validName = ensurePlayerName();
    if (!validName) return;
    await startRound(currentLevel, durationSec);
  };

  window.simBlink = function () {
    if (!roundRunning) return;
    const pen = Date.now() < postScareUntilMs ? 15 : 4;
    blinks += 1;
    play8BitSound("blink");
    composure = Math.max(0, composure - pen);
    showAlert(pen === 15 ? "POST-SCARE -" + pen : "MANUAL BLINK -" + pen);
    refreshArenaHud(Math.max(0, roundEndMs - Date.now()));
    if (composure <= 0) window.endRound(true);
  };

  window.simTalk = function () {
    if (!roundRunning) return;
    talks += 1;
    composure = Math.max(0, composure - 8);
    showAlert("MANUAL TALK -8");
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
    // Release scroll lock immediately when round terminates
    document.body.classList.remove("game-active");
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (jumpscareLayerEl) jumpscareLayerEl.classList.remove("active");
    stopLevel3Reel();
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
    const validName = ensurePlayerName();
    if (!validName) return;
    const passEl = document.getElementById("input-pass");
    if (!socket || !socket.connected) {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Connecting to server... try again in a moment.";
      return;
    }
    socket.emit("create_room", {
      name: validName,
      hostName: validName,
      password: passEl ? passEl.value.trim() : ""
    });
  };

  window.joinWithCode = function (code) {
    const codeEl = document.getElementById("input-code");
    if (codeEl) codeEl.value = code;
    window.joinRoom();
  };

  window.joinRoom = function () {
    const validName = ensurePlayerName();
    if (!validName) return;
    const codeEl = document.getElementById("input-code");
    const passEl = document.getElementById("input-pass");
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
      name: validName,
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
    const validName = ensurePlayerName();
    if (!validName) return;
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
    const modeEl = document.getElementById("select-mp-mode");
    const selectedLvl = modeEl ? Number(modeEl.value) : currentLevel;
    const seed = Math.floor(Math.random() * 1000000);
    if (socket && socket.connected) {
      socket.emit("start_game", { level: selectedLvl, duration: dur, seed: seed }, (res) => {
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
      const seed = (payload && typeof payload.seed === "number") ? payload.seed : Date.now();
      if (stageStatusEl) stageStatusEl.textContent = "Match starting in " + Math.ceil(delay / 1000) + "s... Mode " + lvl;
      showAlert("MATCH STARTING");
      window.ensureCameraActive();
      window.setTab("arena");
      setTimeout(() => startRound(lvl, dur, seed), delay);
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
    const nameEl = document.getElementById("input-name");
    if (nameEl) {
      if (storedPlayerName) {
        nameEl.value = storedPlayerName;
      } else {
        nameEl.value = "";
      }
      nameEl.addEventListener("input", () => {
        const val = nameEl.value.trim();
        playerName = val;
        if (val) {
          try { localStorage.setItem(STORAGE_KEY_PLAYER_NAME, val); } catch (e) {}
          nameEl.style.borderColor = "";
        }
      });
    }
    updateRoleUi();
    if (checkStoredAssetPackReady()) {
      videoPackReady = true;
      updateAssetBannerUi(100, "Level 3 distraction reels are cached and ready. Play anytime without re-downloading.");
      restoreCachedBlobs();
    } else {
      updateAssetBannerUi(0);
    }
    renderRooms();
    renderPlayers();
    renderScoreboard();
    refreshArenaHud(30000);
    window.loadReplaySample();
    connectSocket();
    // Proactively initialize camera preview
    window.requestCameraPermission();
  });
})();

  // Prevent touchmove/wheel scroll during active game round
  window.addEventListener("wheel", (e) => {
    if (roundRunning && document.body.classList.contains("game-active")) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (roundRunning && document.body.classList.contains("game-active")) {
      e.preventDefault();
    }
  }, { passive: false });
