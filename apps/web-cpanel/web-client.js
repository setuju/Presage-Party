(function () {
  const SERVER_URLS = [
    "https://finchparty.saturumah.net",
    "https://presage-party.onrender.com"
  ];

  let socket = null;
  let serverIdx = 0;
  let cameraStream = null;
  let cameraActive = false;

  let myName = "Jack";
  let myRole = "solo"; // "host" | "guest" | "solo"
  let currentRoom = "";
  let roomPlayers = [];
  let activeRooms = [];
  let scoreboard = [];

  let selectedMode = "signal-focus";
  let roundActive = false;
  let roundDurationSec = 30;
  let roundEndEpochMs = 0;
  let composure = 100;
  let score = 0;
  let signalHits = 0;
  let rafHandle = null;
  let roomPollHandle = null;
  let lastFrameData = null;

  const serverStatusEl = document.getElementById("server-status-line");
  const camPillEl = document.getElementById("cam-pill");
  const hostPillEl = document.getElementById("host-pill");
  const hostBadgeSmallEl = document.getElementById("host-badge-small");
  const lobbyFeedbackEl = document.getElementById("lobby-feedback");
  const activeRoomsListEl = document.getElementById("active-rooms-list");
  const roomCountLabelEl = document.getElementById("room-count-label");
  const roomPlayersListEl = document.getElementById("room-players-list");
  const btnHostStartEl = document.getElementById("btn-host-start");
  const btnArenaStartEl = document.getElementById("btn-arena-start");
  const camVideoEl = document.getElementById("camera-video");

  const sigPulseEl = document.getElementById("sig-pulse");
  const sigBreathEl = document.getElementById("sig-breath");
  const sigHrvEl = document.getElementById("sig-hrv");
  const sigSourceEl = document.getElementById("sig-source");

  const hudTimeEl = document.getElementById("hud-time");
  const hudComposureEl = document.getElementById("hud-composure");
  const hudScoreEl = document.getElementById("hud-score");
  const hudSignalsEl = document.getElementById("hud-signals");
  const arenaModeTitleEl = document.getElementById("arena-mode-title");
  const arenaPromptEl = document.getElementById("arena-prompt");
  const arenaEl = document.getElementById("game-arena");
  const orbEl = document.getElementById("focus-orb");
  const scoreboardListEl = document.getElementById("scoreboard-list");

  window.switchTab = function (tabName) {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.remove("active");
    });
    const target = document.getElementById("tab-" + tabName);
    if (target) target.classList.add("active");
  };

  function canStart() {
    if (!currentRoom) return true;
    return myRole === "host";
  }

  function refreshRoleUi() {
    const allowed = canStart();
    if (btnHostStartEl) btnHostStartEl.disabled = !allowed;
    if (btnArenaStartEl) btnArenaStartEl.disabled = !allowed;

    if (hostPillEl) {
      if (myRole === "host") hostPillEl.textContent = "👑 ROOM MASTER";
      else if (myRole === "guest") hostPillEl.textContent = "🎮 GUEST";
      else hostPillEl.textContent = "ROLE: SOLO";
    }
    if (hostBadgeSmallEl) {
      if (myRole === "host") hostBadgeSmallEl.textContent = "👑 ROOM MASTER";
      else if (myRole === "guest") hostBadgeSmallEl.textContent = "🎮 GUEST";
      else hostBadgeSmallEl.textContent = "HOST READY";
    }
  }

  function renderPlayers() {
    if (!roomPlayersListEl) return;
    if (!currentRoom) {
      roomPlayersListEl.innerHTML = '<div class="sub">Create or join a room to view players.</div>';
      return;
    }
    const list = roomPlayers.length > 0
      ? roomPlayers
      : [{ name: myName, role: myRole === "host" ? "host" : "guest", id: (socket && socket.id) || "local" }];

    roomPlayersListEl.innerHTML = list.map(p => {
      const isMaster = p.role === "host" || p.isHost === true;
      const badge = isMaster
        ? '<span class="badge-master">👑 ROOM MASTER</span>'
        : '<span class="badge-guest">🎮 PLAYER</span>';
      return '<div class="player-row"><strong>' + (p.name || "Player") + '</strong>' + badge + '</div>';
    }).join("");
  }

  function renderRooms() {
    if (!activeRoomsListEl) return;
    const list = Array.isArray(activeRooms) ? activeRooms : [];
    if (roomCountLabelEl) roomCountLabelEl.textContent = list.length + (list.length === 1 ? " room" : " rooms");
    if (list.length === 0) {
      activeRoomsListEl.innerHTML = '<div class="sub">No active rooms right now. Click Create Room to host one.</div>';
      return;
    }
    activeRoomsListEl.innerHTML = list.map(r => {
      const code = r.code || r.roomCode || "";
      const hostName = r.hostName || "Host";
      return '<div class="room-row">' +
        '<div><strong>' + code + '</strong> <span class="sub">by 👑 ' + hostName + '</span></div>' +
        '<button type="button" class="secondary" onclick="window.quickJoin(\'' + code + '\')">Join</button>' +
        '</div>';
    }).join("");
  }

  function renderScoreboard() {
    if (!scoreboardListEl) return;
    if (!Array.isArray(scoreboard) || scoreboard.length === 0) {
      scoreboardListEl.innerHTML = '<div class="sub">No scores recorded yet.</div>';
      return;
    }
    const sorted = [...scoreboard].sort((a, b) => (b.score || 0) - (a.score || 0));
    scoreboardListEl.innerHTML = sorted.map((entry, idx) => {
      const roleBadge = entry.role === "host"
        ? '<span class="badge-master">👑 MASTER</span>'
        : '<span class="badge-guest">🎮 PLAYER</span>';
      return '<div class="score-row">' +
        '<div><strong>#' + (idx + 1) + ' ' + (entry.name || "Player") + '</strong> ' + roleBadge + '</div>' +
        '<strong>' + (entry.score || 0) + ' pts</strong>' +
        '</div>';
    }).join("");
  }

  function upsertScore(name, pts, role) {
    const idx = scoreboard.findIndex(s => s.name === name);
    const item = { name, score: Math.max(0, Math.round(pts)), role: role || myRole };
    if (idx >= 0) scoreboard[idx] = item;
    else scoreboard.push(item);
    renderScoreboard();
  }

  function updateHud(remainingMs) {
    const rem = Math.max(0, remainingMs / 1000);
    if (hudTimeEl) hudTimeEl.textContent = rem.toFixed(1) + "s";
    if (hudComposureEl) hudComposureEl.textContent = String(Math.max(0, Math.round(composure)));
    if (hudScoreEl) hudScoreEl.textContent = String(Math.max(0, Math.round(score)));
    if (hudSignalsEl) hudSignalsEl.textContent = String(signalHits);
  }

  function sampleCameraSignals() {
    if (!cameraActive || !camVideoEl || camVideoEl.readyState < 2) {
      if (sigPulseEl) sigPulseEl.textContent = "--";
      if (sigBreathEl) sigBreathEl.textContent = "--";
      if (sigHrvEl) sigHrvEl.textContent = "--";
      if (sigSourceEl) sigSourceEl.textContent = "Camera Req";
      return 0;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 36;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(camVideoEl, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let diffSum = 0;
    let lumaSum = 0;
    const pixels = frame.length / 4;
    for (let i = 0; i < frame.length; i += 4) {
      const luma = 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
      lumaSum += luma;
      if (lastFrameData) {
        const prevLuma = 0.299 * lastFrameData[i] + 0.587 * lastFrameData[i + 1] + 0.114 * lastFrameData[i + 2];
        diffSum += Math.abs(luma - prevLuma);
      }
    }
    lastFrameData = new Uint8ClampedArray(frame);

    const avgLuma = lumaSum / pixels;
    const motion = diffSum / pixels;
    const pulseEst = Math.round(64 + Math.min(45, motion * 2.4) + Math.sin(Date.now() / 650) * 3);
    const breathEst = Math.round(13 + Math.min(10, motion * 0.6));
    const hrvEst = Math.max(22, Math.round(68 - motion * 1.5));

    if (sigPulseEl) sigPulseEl.textContent = pulseEst + " bpm";
    if (sigBreathEl) sigBreathEl.textContent = breathEst + "/m";
    if (sigHrvEl) sigHrvEl.textContent = hrvEst + " ms";
    if (sigSourceEl) sigSourceEl.textContent = "Live Cam";
    return motion;
  }

  function moveOrb() {
    if (!arenaEl || !orbEl) return;
    const maxX = Math.max(40, arenaEl.clientWidth - 84);
    const maxY = Math.max(40, arenaEl.clientHeight - 84);
    orbEl.style.left = (12 + Math.random() * (maxX - 12)) + "px";
    orbEl.style.top = (12 + Math.random() * (maxY - 12)) + "px";
    orbEl.style.transform = "none";
  }

  window.tapTarget = function () {
    if (!roundActive) {
      if (arenaPromptEl) arenaPromptEl.textContent = "Start the round first to sync signals.";
      return;
    }
    if (!cameraActive && selectedMode !== "flinch-challenge") {
      if (arenaPromptEl) arenaPromptEl.textContent = "Enable Camera in Tab 2 for live camera signal response.";
      return;
    }
    signalHits += 1;
    score += 20;
    composure = Math.min(100, composure + 2);
    moveOrb();
    updateHud(Math.max(0, roundEndEpochMs - Date.now()));
  };

  function loopRound() {
    if (!roundActive) return;
    const now = Date.now();
    const remaining = roundEndEpochMs - now;
    const motion = sampleCameraSignals();

    if (cameraActive && motion > 14) {
      composure = Math.max(0, composure - 0.15);
    }

    updateHud(remaining);

    if (remaining <= 0 || composure <= 0) {
      window.finishRound(true);
      return;
    }
    rafHandle = requestAnimationFrame(loopRound);
  }

  function startRoundNow(mode, durationSec) {
    selectedMode = mode || (document.getElementById("game-mode-select") && document.getElementById("game-mode-select").value) || "signal-focus";
    roundDurationSec = Number(durationSec || (document.getElementById("game-duration-select") && document.getElementById("game-duration-select").value) || 30) || 30;

    if (rafHandle) cancelAnimationFrame(rafHandle);
    roundActive = true;
    composure = 100;
    score = 0;
    signalHits = 0;
    roundEndEpochMs = Date.now() + roundDurationSec * 1000;

    if (arenaModeTitleEl) arenaModeTitleEl.textContent = "Mode: " + selectedMode;
    if (arenaPromptEl) {
      arenaPromptEl.textContent = cameraActive
        ? "Live camera active — sync PULSE orb steadily!"
        : "Camera off — enable Camera in Tab 2 for SmartSpectra signals.";
    }
    moveOrb();
    window.switchTab("arena");
    rafHandle = requestAnimationFrame(loopRound);
  }

  window.hostStartGame = function () {
    if (!canStart()) {
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "Only the 👑 ROOM MASTER can start this room's game.";
      return;
    }
    const mode = (document.getElementById("game-mode-select") && document.getElementById("game-mode-select").value) || "signal-focus";
    const dur = Number((document.getElementById("game-duration-select") && document.getElementById("game-duration-select").value) || 30) || 30;
    if (currentRoom && socket && socket.connected) {
      socket.emit("start_game", { code: currentRoom, roomCode: currentRoom, mode, duration: dur });
    }
    startRoundNow(mode, dur);
  };

  window.submitScoreNow = function () {
    const finalPts = Math.round(score + composure);
    upsertScore(myName, finalPts, myRole);
    if (socket && socket.connected) {
      socket.emit("report_score", {
        roomCode: currentRoom || undefined,
        score: finalPts,
        blinks: 0,
        talks: 0,
        rateSpikes: 0,
        survived: composure > 0
      });
    }
  };

  window.finishRound = function (shouldSubmit) {
    roundActive = false;
    if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    updateHud(0);
    if (arenaPromptEl) arenaPromptEl.textContent = "Round finished. Check Scoreboard tab.";
    if (shouldSubmit) window.submitScoreNow();
    window.switchTab("scoreboard");
  };

  window.enableCamera = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camPillEl) camPillEl.textContent = "CAM: UNSUPPORTED";
      return;
    }
    try {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false
      });
      if (camVideoEl) camVideoEl.srcObject = cameraStream;
      cameraActive = true;
      lastFrameData = null;
      if (camPillEl) camPillEl.textContent = "CAM: LIVE";
      setInterval(() => {
        if (cameraActive && !roundActive) sampleCameraSignals();
      }, 600);
    } catch (err) {
      cameraActive = false;
      if (camPillEl) camPillEl.textContent = "CAM: BLOCKED";
      if (lobbyFeedbackEl) {
        lobbyFeedbackEl.textContent = "Camera access denied (" + (err && err.name ? err.name : "Error") + "). Allow camera permission in browser & OS settings.";
      }
    }
  };

  window.disableCamera = function () {
    cameraActive = false;
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (camVideoEl) camVideoEl.srcObject = null;
    if (camPillEl) camPillEl.textContent = "CAM: OFF";
    sampleCameraSignals();
  };

  window.refreshRooms = function () {
    if (socket && socket.connected) socket.emit("get_rooms");
  };

  window.createGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    myName = (nameInput && nameInput.value.trim()) || "Jack";
    if (!socket || !socket.connected) {
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "Server connecting... please try again in a moment.";
      return;
    }
    socket.emit("create_room", { hostName: myName, name: myName });
  };

  window.quickJoin = function (code) {
    const codeInput = document.getElementById("room-code-input");
    if (codeInput) codeInput.value = code;
    window.joinGameRoom();
  };

  window.joinGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    const codeInput = document.getElementById("room-code-input");
    myName = (nameInput && nameInput.value.trim()) || "Jack";
    const code = (codeInput && codeInput.value.trim().toUpperCase()) || "";
    if (!code) {
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "Enter a room code or click Join on an active room.";
      return;
    }
    if (!socket || !socket.connected) {
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "Server connecting... please try again.";
      return;
    }
    currentRoom = code;
    socket.emit("join_room", { code, roomCode: code, name: myName });
  };

  function connectServer() {
    if (typeof window.io !== "function") return;
    const url = SERVER_URLS[serverIdx];
    if (serverStatusEl) serverStatusEl.textContent = "Connecting to " + url + "...";

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    socket = window.io(url, {
      transports: ["websocket", "polling"],
      timeout: 4500,
      reconnection: true,
      reconnectionAttempts: 2
    });

    socket.on("connect", () => {
      if (serverStatusEl) {
        serverStatusEl.textContent = "Connected: " + url + (serverIdx === 0 ? " (Primary)" : " (Fallback Render)");
      }
      socket.emit("get_rooms");
      if (roomPollHandle) clearInterval(roomPollHandle);
      roomPollHandle = setInterval(() => {
        if (socket && socket.connected) socket.emit("get_rooms");
      }, 4000);
    });

    socket.on("connect_error", () => {
      if (serverIdx + 1 < SERVER_URLS.length) {
        serverIdx += 1;
        connectServer();
      } else if (serverStatusEl) {
        serverStatusEl.textContent = "Server connection unavailable right now.";
      }
    });

    socket.on("rooms_list", (list) => {
      activeRooms = Array.isArray(list) ? list : [];
      renderRooms();
    });

    socket.on("room_created", (data) => {
      myRole = "host";
      currentRoom = (data && (data.roomCode || data.code)) || "";
      const codeInput = document.getElementById("room-code-input");
      if (codeInput && currentRoom) codeInput.value = currentRoom;
      roomPlayers = [{ id: socket.id, name: myName, role: "host" }];
      refreshRoleUi();
      renderPlayers();
      upsertScore(myName, 0, "host");
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "👑 Room " + currentRoom + " created. Share code " + currentRoom + " to join.";
      socket.emit("get_rooms");
    });

    socket.on("player_joined", (p) => {
      if (p && p.name) {
        const exists = roomPlayers.some(x => x.name === p.name);
        if (!exists) roomPlayers.push({ id: p.id || p.name, name: p.name, role: "guest" });
        renderPlayers();
      }
    });

    socket.on("room_joined", (data) => {
      myRole = "guest";
      currentRoom = (data && (data.code || data.roomCode)) || currentRoom;
      roomPlayers = [];
      if (data && data.hostName) roomPlayers.push({ id: data.host || "host", name: data.hostName, role: "host" });
      roomPlayers.push({ id: socket.id, name: myName, role: "guest" });
      refreshRoleUi();
      renderPlayers();
      upsertScore(myName, 0, "guest");
      if (lobbyFeedbackEl) lobbyFeedbackEl.textContent = "🎮 Joined room " + currentRoom + " (Host: " + (data && data.hostName ? data.hostName : "Master") + ").";
    });

    socket.on("game_start", (payload) => {
      startRoundNow(payload && payload.mode, payload && payload.duration);
    });

    socket.on("game_result", (payload) => {
      if (payload && payload.host && payload.hostName) {
        upsertScore(payload.hostName, payload.host.score || 0, "host");
      }
      if (payload && payload.guest && payload.guestName) {
        upsertScore(payload.guestName, payload.guest.score || 0, "guest");
      }
      window.switchTab("scoreboard");
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    refreshRoleUi();
    renderRooms();
    renderPlayers();
    renderScoreboard();
    updateHud(30000);
    connectServer();
  });
})();
