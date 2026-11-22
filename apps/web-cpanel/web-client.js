(function () {
  const SERVER_URLS = [
    "https://presage-party.onrender.com",
    "https://presage-party.enzonic.dev"
  ];

  const LEVEL_PROMPTS = {
    1: ["Stay calm...", "Keep your eyes steady!", "Hold your focus."],
    2: ["FLASH DISTRACTION!", "Sudden visual & audio triggers!", "Keep your composure!"],
    3: ["CHAOS RUSH!", "Distraction pace increasing!", "Stay steady!"],
    4: ["FLINCH ROYALE!", "Maximum intensity mode!", "Do not flinch!"]
  };

  let socket = null;
  let serverIndex = 0;
  let cameraStream = null;
  let myRole = "guest";
  let currentRoomCode = "";

  let selectedLevel = 1;
  let gameRunning = false;
  let composure = 100;
  let score = 0;
  let flinchCount = 0;
  let remainingSec = 0;
  let tickTimer = null;
  let promptTimer = null;

  const statusEl = document.getElementById("mp-status");
  const serverInfoEl = document.getElementById("mp-server-info");
  const roomListEl = document.getElementById("room-list");
  const camVideoEl = document.getElementById("local-cam-preview");
  const camStatusEl = document.getElementById("cam-status");
  const hudLevelEl = document.getElementById("hud-level");
  const hudTimeEl = document.getElementById("hud-time");
  const hudComposureEl = document.getElementById("hud-composure");
  const hudScoreEl = document.getElementById("hud-score");
  const bannerEl = document.getElementById("distraction-banner");

  function setStatus(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "#e5e7eb";
    }
  }

  function setServerInfo(msg) {
    if (serverInfoEl) serverInfoEl.textContent = msg;
  }

  function updateHud() {
    if (hudLevelEl) hudLevelEl.textContent = String(selectedLevel);
    if (hudTimeEl) hudTimeEl.textContent = Math.max(0, remainingSec) + "s";
    if (hudComposureEl) hudComposureEl.textContent = String(Math.max(0, Math.round(composure)));
    if (hudScoreEl) hudScoreEl.textContent = String(Math.max(0, Math.round(score)));
  }

  window.selectGameLevel = function (lvl) {
    selectedLevel = Number(lvl) || 1;
    for (let i = 1; i <= 4; i++) {
      const btn = document.getElementById("btn-lvl-" + i);
      if (btn) btn.classList.toggle("active", i === selectedLevel);
    }
    updateHud();
    if (bannerEl) bannerEl.textContent = "Level " + selectedLevel + " selected. Click Start Game to begin.";
  };

  window.triggerFlinchEvent = function (penalty) {
    const pen = typeof penalty === "number" ? penalty : 15;
    flinchCount += 1;
    composure = Math.max(0, composure - pen);
    score = Math.max(0, score - pen * 2);
    updateHud();
    if (bannerEl) bannerEl.textContent = "FLINCH! Composure -" + pen + " (Total flinches: " + flinchCount + ")";
    if (composure <= 0 && gameRunning) {
      window.stopGameRound();
    }
  };

  function cleanupRoundTimers() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (promptTimer) { clearInterval(promptTimer); promptTimer = null; }
  }

  window.stopGameRound = function () {
    if (!gameRunning && remainingSec === 0) return;
    gameRunning = false;
    cleanupRoundTimers();
    const finalScore = Math.max(0, Math.round(score + composure * selectedLevel));
    score = finalScore;
    updateHud();
    if (bannerEl) bannerEl.textContent = "Round finished! Final score: " + finalScore;
    if (socket && socket.connected) {
      socket.emit("report_score", {
        level: selectedLevel,
        score: finalScore,
        blinks: flinchCount,
        talks: 0,
        rateSpikes: 0
      });
      setStatus("Score (" + finalScore + ") submitted to server.", "#4ade80");
    }
  };

  window.startSoloGame = function (overrideLevel, overrideDuration) {
    if (overrideLevel) window.selectGameLevel(overrideLevel);
    const durSelect = document.getElementById("game-duration");
    const duration = Number(overrideDuration || (durSelect ? durSelect.value : 30)) || 30;

    cleanupRoundTimers();
    gameRunning = true;
    composure = 100;
    score = 0;
    flinchCount = 0;
    remainingSec = duration;
    updateHud();

    const prompts = LEVEL_PROMPTS[selectedLevel] || LEVEL_PROMPTS[1];
    let pIdx = 0;
    if (bannerEl) bannerEl.textContent = prompts[0];

    const intervalMs = selectedLevel >= 3 ? 1600 : (selectedLevel === 2 ? 2200 : 3000);
    promptTimer = setInterval(() => {
      if (!gameRunning) return;
      pIdx = (pIdx + 1) % prompts.length;
      if (bannerEl) bannerEl.textContent = prompts[pIdx];
      if (selectedLevel >= 2 && Math.random() < (0.2 * selectedLevel)) {
        window.triggerFlinchEvent(5 * selectedLevel);
      }
    }, intervalMs);

    tickTimer = setInterval(() => {
      if (!gameRunning) return;
      remainingSec -= 1;
      score += 10 * selectedLevel;
      updateHud();
      if (remainingSec <= 0) {
        window.stopGameRound();
      }
    }, 1000);
  };

  window.enableLocalCamera = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camStatusEl) camStatusEl.textContent = "Browser does not support camera (getUserMedia).";
      return;
    }
    try {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      if (camVideoEl) camVideoEl.srcObject = cameraStream;
      if (camStatusEl) {
        camStatusEl.textContent = "Local camera active (no frames uploaded / no biometric data stored).";
        camStatusEl.style.color = "#4ade80";
      }
    } catch (err) {
      if (camStatusEl) {
        camStatusEl.textContent = "Camera permission denied or unavailable: " + (err && err.message ? err.message : err);
        camStatusEl.style.color = "#f87171";
      }
    }
  };

  window.disableLocalCamera = function () {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (camVideoEl) camVideoEl.srcObject = null;
    if (camStatusEl) {
      camStatusEl.textContent = "Local camera disabled.";
      camStatusEl.style.color = "#9ca3af";
    }
  };

  function renderRooms(rooms) {
    if (!roomListEl) return;
    if (!Array.isArray(rooms) || rooms.length === 0) {
      roomListEl.innerHTML = '<div style="color:#9ca3af;font-size:13px;">No active rooms available.</div>';
      return;
    }
    roomListEl.innerHTML = rooms.map(r => {
      const code = r.code || r.roomCode || "";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #262626;">' +
        '<span style="font-family:monospace;font-size:15px;color:#fff;">' + code + '</span>' +
        '<button type="button" onclick="window.quickJoinRoom(\'' + code + '\')" style="padding:5px 12px;border-radius:6px;border:1px solid #4ade80;background:transparent;color:#4ade80;cursor:pointer;">Join</button>' +
        '</div>';
    }).join("");
  }

  function connectWithFailover() {
    if (typeof window.io !== "function") {
      setStatus("Socket.IO client not loaded.", "#f87171");
      return;
    }
    const url = SERVER_URLS[serverIndex];
    setServerInfo("Connecting to: " + url);
    setStatus("Connecting to server...", "#fbbf24");

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
      setServerInfo("Connected to: " + url + (serverIndex === 0 ? " (Primary Render)" : " (Backup Enzonic)"));
      setStatus("Connected! Ready to play or join a room.", "#4ade80");
      socket.emit("get_rooms");
    });

    socket.on("connect_error", (err) => {
      const nextIndex = serverIndex + 1;
      if (nextIndex < SERVER_URLS.length) {
        serverIndex = nextIndex;
        setStatus("Primary server unreachable, switching to backup...", "#fbbf24");
        connectWithFailover();
      } else {
        setStatus("Failed to connect to Render & Enzonic: " + (err && err.message ? err.message : err), "#f87171");
      }
    });

    socket.on("rooms_list", renderRooms);

    socket.on("room_created", (data) => {
      myRole = "host";
      currentRoomCode = (data && data.roomCode) || "";
      const codeInput = document.getElementById("room-code");
      if (codeInput && currentRoomCode) codeInput.value = currentRoomCode;
      setStatus("Room created! Code: " + (currentRoomCode || "-"), "#4ade80");
    });

    socket.on("room_joined", (data) => {
      myRole = "guest";
      setStatus("Joined " + (data && data.hostName ? data.hostName : "host") + "'s room", "#4ade80");
    });

    socket.on("game_start", (payload) => {
      const lvl = (payload && payload.level) || selectedLevel;
      const dur = (payload && payload.duration) || 30;
      window.startSoloGame(lvl, dur);
    });

    socket.on("game_result", (payload) => {
      const mine = myRole === "host" ? payload.host : payload.guest;
      const opp = myRole === "host" ? payload.guest : payload.host;
      setStatus("Result — Your Score: " + (mine ? mine.score : 0) + " | Opponent: " + (opp ? opp.score : 0), "#60a5fa");
    });
  }

  window.refreshRooms = function () {
    if (socket && socket.connected) socket.emit("get_rooms");
    else connectWithFailover();
  };

  window.createGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    const hostName = (nameInput && nameInput.value.trim()) || "Player";
    if (!socket || !socket.connected) { connectWithFailover(); return; }
    socket.emit("create_room", { hostName });
  };

  window.quickJoinRoom = function (code) {
    const codeInput = document.getElementById("room-code");
    if (codeInput) codeInput.value = code;
    window.joinGameRoom();
  };

  window.joinGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    const codeInput = document.getElementById("room-code");
    const playerName = (nameInput && nameInput.value.trim()) || "Player";
    const roomCode = (codeInput && codeInput.value.trim().toUpperCase()) || "";
    if (!roomCode) { setStatus("Please enter a room code first.", "#fbbf24"); return; }
    if (!socket || !socket.connected) { connectWithFailover(); return; }
    currentRoomCode = roomCode;
    socket.emit("join_room", { roomCode, name: playerName });
  };

  window.startMultiplayerFromHost = function () {
    const codeInput = document.getElementById("room-code");
    const code = (codeInput && codeInput.value.trim().toUpperCase()) || currentRoomCode;
    if (socket && socket.connected && code) {
      socket.emit("start_game", { code, level: selectedLevel });
    }
    window.startSoloGame(selectedLevel);
  };

  window.sendTestScore = function () {
    if (!socket || !socket.connected) return;
    socket.emit("report_score", { level: selectedLevel, score: 100, blinks: 0, talks: 0, rateSpikes: 0 });
    setStatus("Test score (100) sent.", "#4ade80");
  };

  document.addEventListener("visibilitychange", () => {
    if (socket && socket.connected) {
      socket.emit("visibility_change", document.hidden);
    }
    if (document.hidden && gameRunning) {
      window.triggerFlinchEvent(10);
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    updateHud();
    connectWithFailover();
  });
})();
