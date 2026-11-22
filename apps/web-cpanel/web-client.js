(function () {
  const SERVER_URLS = [
    "https://finchparty.saturumah.net",
    "https://presage-party.onrender.com"
  ];

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
    1: { name: "Chill Mode", hint: "Steady composure. No distractions." },
    2: { name: "Seriously?", hint: "Audio & text distractions active." },
    3: { name: "Why So Serious?", hint: "Video challenge active. Keep composure!" },
    4: { name: "Don't Scream", hint: "Scare cues active. Post-scare flinches cost -15." }
  };

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
    if (btnStartMpEl) btnStartMpEl.disabled = !(roomCode && isHost);
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
      const cues = ["Do not flinch.", "Stay steady!", "Are you calm?", "Keep composure!"];
      if (stageStatusEl) stageStatusEl.textContent = cues[slot % cues.length];
      showAlert("DISTRACTION");
    } else if (currentLevel === 3) {
      if (stageStatusEl) stageStatusEl.textContent = "Why So Serious? Watch & keep composure!";
      showAlert("FOCUS TEST");
    } else if (currentLevel === 4) {
      postScareUntilMs = Date.now() + 1800;
      if (jumpscareLayerEl) {
        jumpscareLayerEl.classList.add("active");
        setTimeout(() => jumpscareLayerEl.classList.remove("active"), 550);
      }
      if (stageStatusEl) stageStatusEl.textContent = "JUMPSCARE! Do not flinch!";
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
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Connecting to server... try again in a second.";
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

  window.startMultiplayerRound = function () {
    if (!roomCode || role !== "host") {
      if (lobbyMsgEl) lobbyMsgEl.textContent = "Only the 👑 ROOM MASTER can start the multiplayer round.";
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

  function connectSocket() {
    if (typeof window.io !== "function") return;
    const target = SERVER_URLS[serverIndex];
    if (connStatusEl) connStatusEl.textContent = "Connecting to " + target + "...";

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    socket = window.io(target, {
      transports: ["websocket", "polling"],
      timeout: 4500,
      reconnection: true,
      reconnectionAttempts: 2
    });

    socket.on("connect", () => {
      if (connStatusEl) {
        connStatusEl.textContent = "Connected: " + target + (serverIndex === 0 ? " (Primary)" : " (Fallback)");
      }
      socket.emit("get_rooms");
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (socket && socket.connected) socket.emit("get_rooms");
      }, 3500);
    });

    socket.on("connect_error", () => {
      if (serverIndex + 1 < SERVER_URLS.length) {
        serverIndex += 1;
        connectSocket();
      } else if (connStatusEl) {
        connStatusEl.textContent = "Server unreachable right now.";
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
    });

    socket.on("player_joined", (p) => {
      if (p && p.name && !players.some(x => x.name === p.name)) {
        players.push({ name: p.name, role: "guest" });
        renderPlayers();
      }
      if (lobbyMsgEl) lobbyMsgEl.textContent = ((p && p.name) || "Player") + " joined room " + roomCode + ".";
    });

    socket.on("game_start", (payload) => {
      const startAt = (payload && payload.startAt) || Date.now();
      const delay = Math.max(0, startAt - Date.now());
      const lvl = (payload && payload.level) || currentLevel;
      const dur = (payload && payload.duration) || durationSec;
      if (stageStatusEl) stageStatusEl.textContent = "Starting round...";
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
      window.setTab("scoreboard");
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
