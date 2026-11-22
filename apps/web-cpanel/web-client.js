(function () {
  const SERVER_URLS = [
    "https://finchparty.saturumah.net",
    "https://presage-party.onrender.com"
  ];

  const MODE_META = {
    1: { name: "Chill Mode", hint: "Steady composure. No distractions." },
    2: { name: "Seriously?", hint: "Audio & text distractions active." },
    3: { name: "Why So Serious?", hint: "Intense distraction focus. Stay composed." },
    4: { name: "Don't Scream", hint: "Scare cues active. Post-scare flinches cost -15." }
  };

  let socket = null;
  let serverIndex = 0;
  let pollTimer = null;

  let playerName = "Jack";
  let role = "solo"; // "host" | "guest" | "solo"
  let roomCode = "";
  let players = [];
  let rooms = [];
  let scores = [];

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

  const arenaTitleEl = document.getElementById("arena-title");
  const arenaSubEl = document.getElementById("arena-sub");
  const composureBarEl = document.getElementById("composure-bar");
  const composureTextEl = document.getElementById("composure-text");
  const penaltyCountersEl = document.getElementById("penalty-counters");
  const hudTimeEl = document.getElementById("hud-time");
  const hudScoreEl = document.getElementById("hud-score");
  const hudBlinksEl = document.getElementById("hud-blinks");
  const hudTalksEl = document.getElementById("hud-talks");
  const stageTimerEl = document.getElementById("stage-timer");
  const stageStatusEl = document.getElementById("stage-status");
  const alertBadgeEl = document.getElementById("alert-badge");
  const jumpscareLayerEl = document.getElementById("jumpscare-layer");
  const scoreboardRowsEl = document.getElementById("scoreboard-rows");

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
    setTimeout(() => alertBadgeEl.classList.remove("show"), 900);
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
    if (roomCountEl) roomCountEl.textContent = list.length + (list.length === 1 ? " active" : " active");
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
    const list = players.length > 0
      ? players
      : [{ name: playerName, role: role === "host" ? "host" : "guest" }];
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
      if (stageStatusEl) stageStatusEl.textContent = "Why So Serious? Hold your focus!";
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
    currentLevel = Number(level) || 1;
    durationSec = Number(sec) || 30;
    const meta = MODE_META[currentLevel] || MODE_META[1];

    if (pillModeEl) pillModeEl.textContent = "MODE: " + meta.name.toUpperCase();
    if (arenaTitleEl) arenaTitleEl.textContent = meta.name;
    if (arenaSubEl) arenaSubEl.textContent = meta.hint;
    if (stageStatusEl) stageStatusEl.textContent = meta.hint;

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
    startRound(level, dur);
  };

  window.startSoloNow = function () {
    window.selectAndLaunchMode(currentLevel);
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
      if (lobbyMsgEl) {
        lobbyMsgEl.textContent = "👑 Room " + roomCode + " created. You are Room Master.";
      }
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
    renderRooms();
    renderPlayers();
    renderScoreboard();
    refreshArenaHud(30000);
    connectSocket();
  });
})();
