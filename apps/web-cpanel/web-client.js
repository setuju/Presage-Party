(function () {
  const SERVER_URLS = [
    "https://finchparty.saturumah.net",
    "https://presage-party.onrender.com"
  ];

  const LEVEL_PROMPTS = {
    1: ["Stay calm — tap the green FOCUS orb & solve math!", "Steady focus, smooth pace.", "Keep Composure above 0."],
    2: ["FLASH DISTRACTION! Faster orb & decoy alerts!", "Stay composed while answering math!", "Watch out for sudden flinches!"],
    3: ["CHAOS RUSH! Rapid movement & decoy bursts!", "High tempo — accuracy keeps your rate steady!", "Don't lose your nerve!"],
    4: ["FLINCH ROYALE! Maximum pressure & fast shifts!", "Survive the storm until time runs out!", "Zero flinching is king!"]
  };

  let socket = null;
  let serverIndex = 0;
  let cameraStream = null;
  let myRole = "solo"; // "host" | "guest" | "solo"
  let myName = "Jack";
  let currentRoomCode = "";
  let roomMembers = [];

  let selectedLevel = 1;
  let gameRunning = false;
  let composure = 100;
  let score = 0;
  let flinchCount = 0;
  let blinkCount = 0;
  let talkCount = 0;
  let rateSpikes = 0;
  let remainingSec = 0;
  let tickTimer = null;
  let promptTimer = null;
  let currentMathAnswer = 12;

  const statusEl = document.getElementById("mp-status");
  const serverInfoEl = document.getElementById("mp-server-info");
  const roomListEl = document.getElementById("room-list");
  const waitingListEl = document.getElementById("room-waiting-list");
  const roleBadgeEl = document.getElementById("my-role-badge");
  const camVideoEl = document.getElementById("local-cam-preview");
  const camStatusEl = document.getElementById("cam-status");
  const hudLevelEl = document.getElementById("hud-level");
  const hudTimeEl = document.getElementById("hud-time");
  const hudComposureEl = document.getElementById("hud-composure");
  const hudScoreEl = document.getElementById("hud-score");
  const metricBlinksEl = document.getElementById("metric-blinks");
  const metricTalksEl = document.getElementById("metric-talks");
  const metricRateEl = document.getElementById("metric-rate");
  const bannerEl = document.getElementById("distraction-banner");
  const arenaEl = document.getElementById("game-arena");
  const orbEl = document.getElementById("focus-orb");
  const mathQuestionEl = document.getElementById("math-question");
  const mathAnswerEl = document.getElementById("math-answer");
  const mathFeedbackEl = document.getElementById("math-feedback");
  const btnStartGameEl = document.getElementById("btn-start-game");
  const btnHostStartEl = document.getElementById("btn-host-start");

  function setStatus(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "#e5e7eb";
    }
  }

  function setServerInfo(msg) {
    if (serverInfoEl) serverInfoEl.textContent = msg;
  }

  function canCurrentUserStartGame() {
    if (!currentRoomCode) return true;
    return myRole === "host";
  }

  function refreshStartPermissions() {
    const allowed = canCurrentUserStartGame();
    if (btnStartGameEl) btnStartGameEl.disabled = !allowed;
    if (btnHostStartEl) btnHostStartEl.disabled = !allowed;

    if (roleBadgeEl) {
      if (myRole === "host") {
        roleBadgeEl.className = "badge-host";
        roleBadgeEl.textContent = "👑 ROOM MASTER (" + (currentRoomCode || "ROOM") + ")";
      } else if (myRole === "guest") {
        roleBadgeEl.className = "badge-guest";
        roleBadgeEl.textContent = "🎮 GUEST (" + (currentRoomCode || "ROOM") + ") — WAITING FOR MASTER";
      } else {
        roleBadgeEl.className = "badge-you";
        roleBadgeEl.textContent = "SOLO MODE";
      }
    }
  }

  function renderWaitingList() {
    if (!waitingListEl) return;
    if (!currentRoomCode) {
      waitingListEl.innerHTML = '<div class="muted" style="margin:0;">Not in a room yet. Create or join a room to see members.</div>';
      return;
    }
    const list = Array.isArray(roomMembers) && roomMembers.length > 0
      ? roomMembers
      : [{ name: myName, role: myRole === "host" ? "host" : "guest", id: socket && socket.id ? socket.id : "local" }];

    waitingListEl.innerHTML = list.map(m => {
      const isHost = m.role === "host" || m.isHost === true;
      const isMe = (socket && socket.id && m.id === socket.id) || (!m.id && m.name === myName);
      const icon = isHost ? "👑" : "🎮";
      const label = isHost ? "ROOM MASTER" : "JOINED PLAYER";
      const badgeClass = isHost ? "badge-host" : "badge-guest";
      return '<div class="roster-item">' +
        '<div><strong>' + icon + ' ' + (m.name || "Player") + '</strong>' + (isMe ? '<span class="badge-you">YOU</span>' : '') + '</div>' +
        '<span class="' + badgeClass + '">' + label + '</span>' +
        '</div>';
    }).join("");
  }

  function upsertLocalMember(name, role) {
    const id = (socket && socket.id) || "local-" + name;
    const existingIdx = roomMembers.findIndex(item => item.name === name || (socket && socket.id && item.id === socket.id));
    const entry = { id, name, role };
    if (existingIdx >= 0) roomMembers[existingIdx] = entry;
    else roomMembers.push(entry);
    renderWaitingList();
  }

  function updateHud() {
    if (hudLevelEl) hudLevelEl.textContent = String(selectedLevel);
    if (hudTimeEl) hudTimeEl.textContent = Math.max(0, remainingSec) + "s";
    if (hudComposureEl) hudComposureEl.textContent = String(Math.max(0, Math.round(composure)));
    if (hudScoreEl) hudScoreEl.textContent = String(Math.max(0, Math.round(score)));
    if (metricBlinksEl) metricBlinksEl.textContent = String(blinkCount);
    if (metricTalksEl) metricTalksEl.textContent = String(talkCount);
    if (metricRateEl) {
      metricRateEl.textContent = rateSpikes > 2 ? "Unstable (" + rateSpikes + ")" : "Steady";
      metricRateEl.style.color = rateSpikes > 2 ? "#f87171" : "#4ade80";
    }
  }

  function generateMathPrompt() {
    const a = 2 + Math.floor(Math.random() * (8 + selectedLevel * 3));
    const b = 2 + Math.floor(Math.random() * (7 + selectedLevel * 2));
    const useSub = selectedLevel >= 2 && a > b && Math.random() < 0.4;
    if (useSub) {
      currentMathAnswer = a - b;
      if (mathQuestionEl) mathQuestionEl.textContent = a + " - " + b + " = ?";
    } else {
      currentMathAnswer = a + b;
      if (mathQuestionEl) mathQuestionEl.textContent = a + " + " + b + " = ?";
    }
  }

  window.submitMathAnswer = function () {
    if (!mathAnswerEl) return;
    const val = Number(mathAnswerEl.value);
    mathAnswerEl.value = "";
    if (!gameRunning) {
      if (mathFeedbackEl) mathFeedbackEl.textContent = "Start the game first to score math challenges.";
      return;
    }
    if (val === currentMathAnswer) {
      score += 30 * selectedLevel;
      composure = Math.min(100, composure + 3);
      if (mathFeedbackEl) {
        mathFeedbackEl.textContent = "Correct! +" + (30 * selectedLevel) + " score & +3 composure.";
        mathFeedbackEl.style.color = "#4ade80";
      }
    } else {
      rateSpikes += 1;
      composure = Math.max(0, composure - 5);
      if (mathFeedbackEl) {
        mathFeedbackEl.textContent = "Wrong answer (" + currentMathAnswer + ")! -5 composure.";
        mathFeedbackEl.style.color = "#f87171";
      }
    }
    generateMathPrompt();
    updateHud();
    if (composure <= 0 && gameRunning) {
      window.stopGameRound();
    }
  };

  window.toggleGameHelper = function () {
    const panel = document.getElementById("game-helper-panel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  };

  function clearDecoys() {
    if (!arenaEl) return;
    arenaEl.querySelectorAll(".hazard-decoy").forEach(el => el.remove());
    arenaEl.classList.remove("flash-alert");
  }

  function moveFocusOrb() {
    if (!arenaEl || !orbEl) return;
    const maxX = Math.max(50, arenaEl.clientWidth - 82);
    const maxY = Math.max(50, arenaEl.clientHeight - 82);
    const x = 16 + Math.random() * (maxX - 16);
    const y = 16 + Math.random() * (maxY - 16);
    orbEl.style.left = x + "px";
    orbEl.style.top = y + "px";
    orbEl.style.transform = "none";
  }

  function spawnDistractionDecoy() {
    if (!arenaEl || !gameRunning) return;
    const decoy = document.createElement("div");
    decoy.className = "hazard-decoy";
    const labels = ["BOO!", "FLASH!", "FLINCH!", "ALERT!"];
    decoy.textContent = labels[Math.floor(Math.random() * labels.length)];
    const maxX = Math.max(40, arenaEl.clientWidth - 95);
    const maxY = Math.max(40, arenaEl.clientHeight - 40);
    decoy.style.left = (10 + Math.random() * maxX) + "px";
    decoy.style.top = (10 + Math.random() * maxY) + "px";
    arenaEl.appendChild(decoy);
    arenaEl.classList.add("flash-alert");
    setTimeout(() => {
      decoy.remove();
      if (arenaEl && arenaEl.querySelectorAll(".hazard-decoy").length === 0) {
        arenaEl.classList.remove("flash-alert");
      }
    }, Math.max(450, 980 - selectedLevel * 120));
  }

  window.tapFocusOrb = function () {
    if (!gameRunning) {
      if (bannerEl) bannerEl.textContent = "Click Start Game first to begin the round!";
      return;
    }
    score += 25 * selectedLevel;
    composure = Math.min(100, composure + 2);
    moveFocusOrb();
    updateHud();
  };

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
    spawnDistractionDecoy();
    updateHud();
    if (bannerEl) bannerEl.textContent = "FLINCH [SIM]! Composure -" + pen + " (Total flinches: " + flinchCount + ")";
    if (composure <= 0 && gameRunning) {
      window.stopGameRound();
    }
  };

  window.triggerBlinkEvent = function () {
    blinkCount += 1;
    composure = Math.max(0, composure - 4);
    updateHud();
    if (bannerEl) bannerEl.textContent = "BLINK [SIM]! Composure -4 (Blinks: " + blinkCount + ")";
    if (composure <= 0 && gameRunning) window.stopGameRound();
  };

  window.triggerTalkEvent = function () {
    talkCount += 1;
    rateSpikes += 1;
    composure = Math.max(0, composure - 8);
    updateHud();
    if (bannerEl) bannerEl.textContent = "TALK [SIM]! Composure -8 (Talks: " + talkCount + ")";
    if (composure <= 0 && gameRunning) window.stopGameRound();
  };

  function cleanupRoundTimers() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (promptTimer) { clearInterval(promptTimer); promptTimer = null; }
    clearDecoys();
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
        blinks: blinkCount,
        talks: talkCount,
        rateSpikes: rateSpikes,
        flinches: flinchCount,
        roomCode: currentRoomCode || undefined
      });
      setStatus("Score (" + finalScore + ") submitted to server.", "#4ade80");
    } else {
      setStatus("Round finished! Final score: " + finalScore + " (offline/reconnecting)", "#fbbf24");
    }
  };

  function runRoundLocally(overrideLevel, overrideDuration) {
    if (overrideLevel) window.selectGameLevel(overrideLevel);
    const durSelect = document.getElementById("game-duration");
    const duration = Number(overrideDuration || (durSelect ? durSelect.value : 30)) || 30;

    cleanupRoundTimers();
    gameRunning = true;
    composure = 100;
    score = 0;
    flinchCount = 0;
    blinkCount = 0;
    talkCount = 0;
    rateSpikes = 0;
    remainingSec = duration;
    generateMathPrompt();
    moveFocusOrb();
    updateHud();

    const prompts = LEVEL_PROMPTS[selectedLevel] || LEVEL_PROMPTS[1];
    let pIdx = 0;
    if (bannerEl) bannerEl.textContent = "LIVE — " + prompts[0];
    setStatus("Game running on Level " + selectedLevel + " (" + duration + "s)!", "#4ade80");

    const intervalMs = selectedLevel === 4 ? 850 : (selectedLevel === 3 ? 1150 : (selectedLevel === 2 ? 1650 : 2300));
    promptTimer = setInterval(() => {
      if (!gameRunning) return;
      pIdx = (pIdx + 1) % prompts.length;
      if (bannerEl) bannerEl.textContent = "LIVE — " + prompts[pIdx];
      moveFocusOrb();
      if (selectedLevel >= 2) {
        spawnDistractionDecoy();
      }
      if (selectedLevel >= 2 && Math.random() < (0.16 * selectedLevel)) {
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
  }

  window.startSoloGame = function (overrideLevel, overrideDuration) {
    if (!canCurrentUserStartGame()) {
      setStatus("Only the 👑 ROOM MASTER can start the game in this room.", "#fbbf24");
      return;
    }
    if (currentRoomCode && socket && socket.connected && myRole === "host") {
      socket.emit("start_game", {
        code: currentRoomCode,
        roomCode: currentRoomCode,
        level: overrideLevel || selectedLevel,
        duration: Number((document.getElementById("game-duration") && document.getElementById("game-duration").value) || 30)
      });
    }
    runRoundLocally(overrideLevel, overrideDuration);
  };

  async function requestCameraWithFallback() {
    const attempts = [
      { video: { facingMode: { ideal: "user" } }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false }
    ];
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          throw err;
        }
      }
    }
    throw lastErr || new Error("Unable to access camera");
  }

  window.enableLocalCamera = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camStatusEl) {
        camStatusEl.textContent = "Browser does not support camera (getUserMedia). Game still works without camera.";
        camStatusEl.style.color = "#fbbf24";
      }
      return;
    }
    try {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      if (camStatusEl) {
        camStatusEl.textContent = "Requesting camera permission...";
        camStatusEl.style.color = "#fbbf24";
      }
      cameraStream = await requestCameraWithFallback();
      if (camVideoEl) camVideoEl.srcObject = cameraStream;
      if (camStatusEl) {
        camStatusEl.textContent = "Local camera preview active (no frames uploaded / no biometric data stored; simulation events remain active).";
        camStatusEl.style.color = "#4ade80";
      }
    } catch (err) {
      const errName = (err && err.name) || "Error";
      const hint = (errName === "NotAllowedError" || errName === "PermissionDeniedError")
        ? "Allow Camera in Android Settings -> Apps -> Chrome -> Permissions, and in Chrome site settings for finchgame.saturumah.net. (Game runs fine without camera.)"
        : ((err && err.message) || String(err));
      if (camStatusEl) {
        camStatusEl.textContent = "Camera permission denied (" + errName + "): " + hint;
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
      camStatusEl.textContent = "Local camera disabled. (Simulation events still run independently.)";
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
      const hostLabel = r.hostName ? " — 👑 " + r.hostName : "";
      const countLabel = typeof r.playerCount === "number" ? " (" + r.playerCount + ")" : "";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #262626;">' +
        '<span style="font-family:monospace;font-size:15px;color:#fff;">' + code + '<span style="font-family:sans-serif;font-size:12px;color:#9ca3af;">' + hostLabel + countLabel + '</span></span>' +
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
      setServerInfo("Connected to: " + url + (serverIndex === 0 ? " (Primary finchparty)" : " (Fallback Render)"));
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
        setStatus("Failed to connect to finchparty & Render: " + (err && err.message ? err.message : err), "#f87171");
      }
    });

    socket.on("rooms_list", renderRooms);

    socket.on("room_players", (payload) => {
      if (Array.isArray(payload)) {
        roomMembers = payload;
      } else if (payload && Array.isArray(payload.players)) {
        roomMembers = payload.players;
      }
      renderWaitingList();
    });

    socket.on("room_created", (data) => {
      myRole = "host";
      currentRoomCode = (data && (data.roomCode || data.code)) || "";
      const nameInput = document.getElementById("player-name");
      myName = (nameInput && nameInput.value.trim()) || "Jack";
      roomMembers = Array.isArray(data && data.players) && data.players.length > 0
        ? data.players
        : [{ id: socket.id, name: myName, role: "host" }];
      const codeInput = document.getElementById("room-code");
      if (codeInput && currentRoomCode) codeInput.value = currentRoomCode;
      refreshStartPermissions();
      renderWaitingList();
      setStatus("👑 Room created! You are Room Master. Code: " + (currentRoomCode || "-"), "#4ade80");
    });

    socket.on("room_joined", (data) => {
      myRole = "guest";
      currentRoomCode = (data && (data.roomCode || data.code)) || currentRoomCode;
      const nameInput = document.getElementById("player-name");
      myName = (nameInput && nameInput.value.trim()) || "Jack";
      if (Array.isArray(data && data.players) && data.players.length > 0) {
        roomMembers = data.players;
      } else {
        roomMembers = [];
        if (data && data.hostName) roomMembers.push({ id: "host-id", name: data.hostName, role: "host" });
        upsertLocalMember(myName, "guest");
      }
      refreshStartPermissions();
      renderWaitingList();
      setStatus("🎮 Joined " + (data && data.hostName ? data.hostName : "host") + "'s room as Guest (waiting for Room Master to start).", "#4ade80");
    });

    socket.on("game_start", (payload) => {
      const lvl = (payload && payload.level) || selectedLevel;
      const dur = (payload && payload.duration) || 30;
      runRoundLocally(lvl, dur);
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
    myName = (nameInput && nameInput.value.trim()) || "Jack";
    if (!socket || !socket.connected) { connectWithFailover(); return; }
    socket.emit("create_room", { hostName: myName, name: myName });
  };

  window.quickJoinRoom = function (code) {
    const codeInput = document.getElementById("room-code");
    if (codeInput) codeInput.value = code;
    window.joinGameRoom();
  };

  window.joinGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    const codeInput = document.getElementById("room-code");
    myName = (nameInput && nameInput.value.trim()) || "Jack";
    const roomCode = (codeInput && codeInput.value.trim().toUpperCase()) || "";
    if (!roomCode) { setStatus("Please enter a room code first.", "#fbbf24"); return; }
    if (!socket || !socket.connected) { connectWithFailover(); return; }
    currentRoomCode = roomCode;
    socket.emit("join_room", { roomCode, code: roomCode, name: myName });
  };

  window.startMultiplayerFromHost = function () {
    if (!canCurrentUserStartGame()) {
      setStatus("Only the 👑 ROOM MASTER can start the game in this room.", "#fbbf24");
      return;
    }
    const codeInput = document.getElementById("room-code");
    const code = (codeInput && codeInput.value.trim().toUpperCase()) || currentRoomCode;
    const dur = Number((document.getElementById("game-duration") && document.getElementById("game-duration").value) || 30);
    if (socket && socket.connected && code) {
      socket.emit("start_game", { code, roomCode: code, level: selectedLevel, duration: dur });
    }
    runRoundLocally(selectedLevel, dur);
  };

  window.sendTestScore = function () {
    if (!socket || !socket.connected) return;
    socket.emit("report_score", {
      level: selectedLevel,
      score: 100,
      blinks: blinkCount,
      talks: talkCount,
      rateSpikes: rateSpikes,
      roomCode: currentRoomCode || undefined
    });
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
    generateMathPrompt();
    refreshStartPermissions();
    renderWaitingList();
    updateHud();
    connectWithFailover();
  });
})();
