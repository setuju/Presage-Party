(function () {
  const SERVER_URLS = [
    "https://presage-party.onrender.com",
    "https://presage-party.enzonic.dev"
  ];

  let socket = null;
  let serverIndex = 0;
  let cameraStream = null;
  let myRole = "guest";

  const statusEl = document.getElementById("mp-status");
  const serverInfoEl = document.getElementById("mp-server-info");
  const roomListEl = document.getElementById("room-list");
  const camVideoEl = document.getElementById("local-cam-preview");
  const camStatusEl = document.getElementById("cam-status");

  function setStatus(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "#e5e7eb";
    }
  }

  function setServerInfo(msg) {
    if (serverInfoEl) {
      serverInfoEl.textContent = msg;
    }
  }

  window.enableLocalCamera = async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (camStatusEl) camStatusEl.textContent = "Browser tidak mendukung kamera (getUserMedia).";
      return;
    }
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      if (camVideoEl) {
        camVideoEl.srcObject = cameraStream;
      }
      if (camStatusEl) {
        camStatusEl.textContent = "Kamera aktif secara lokal (tidak dikirim ke server / tidak disimpan).";
        camStatusEl.style.color = "#4ade80";
      }
    } catch (err) {
      if (camStatusEl) {
        camStatusEl.textContent = "Izin kamera ditolak / tidak tersedia: " + (err && err.message ? err.message : err);
        camStatusEl.style.color = "#f87171";
      }
    }
  };

  window.disableLocalCamera = function () {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (camVideoEl) {
      camVideoEl.srcObject = null;
    }
    if (camStatusEl) {
      camStatusEl.textContent = "Kamera lokal dimatikan.";
      camStatusEl.style.color = "#9ca3af";
    }
  };

  function renderRooms(rooms) {
    if (!roomListEl) return;
    if (!Array.isArray(rooms) || rooms.length === 0) {
      roomListEl.innerHTML = '<div style="color:#9ca3af;font-size:13px;">Belum ada room aktif.</div>';
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
      setStatus("Socket.IO client tidak dimuat.", "#f87171");
      return;
    }
    const url = SERVER_URLS[serverIndex];
    setServerInfo("Menghubungkan ke: " + url);
    setStatus("Menyambungkan ke server...", "#fbbf24");

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
      setServerInfo("Terhubung ke: " + url + (serverIndex === 0 ? " (Primary Render)" : " (Backup Enzonic)"));
      setStatus("Terhubung! Siap membuat atau bergabung ke room.", "#4ade80");
      socket.emit("get_rooms");
    });

    socket.on("connect_error", (err) => {
      const nextIndex = serverIndex + 1;
      if (nextIndex < SERVER_URLS.length) {
        serverIndex = nextIndex;
        setStatus("Server utama lambat/gagal, beralih ke cadangan...", "#fbbf24");
        connectWithFailover();
      } else {
        setStatus("Gagal terhubung ke server Render & Enzonic: " + (err && err.message ? err.message : err), "#f87171");
      }
    });

    socket.on("rooms_list", renderRooms);

    socket.on("room_created", (data) => {
      myRole = "host";
      setStatus("Room dibuat! Kode: " + (data && data.roomCode ? data.roomCode : "-"), "#4ade80");
    });

    socket.on("room_joined", (data) => {
      myRole = "guest";
      setStatus("Bergabung ke room " + (data && data.hostName ? data.hostName : "host"), "#4ade80");
    });

    socket.on("game_result", (payload) => {
      const mine = myRole === "host" ? payload.host : payload.guest;
      const opp = myRole === "host" ? payload.guest : payload.host;
      setStatus("Hasil — Skor Anda: " + (mine ? mine.score : 0) + " | Lawan: " + (opp ? opp.score : 0), "#60a5fa");
    });
  }

  window.refreshRooms = function () {
    if (socket && socket.connected) socket.emit("get_rooms");
    else connectWithFailover();
  };

  window.createGameRoom = function () {
    const nameInput = document.getElementById("player-name");
    const hostName = (nameInput && nameInput.value.trim()) || "Player";
    if (!socket || !socket.connected) {
      connectWithFailover();
      return;
    }
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
    if (!roomCode) {
      setStatus("Masukkan kode room terlebih dahulu.", "#fbbf24");
      return;
    }
    if (!socket || !socket.connected) {
      connectWithFailover();
      return;
    }
    socket.emit("join_room", { roomCode, name: playerName });
  };

  window.sendTestScore = function () {
    if (!socket || !socket.connected) return;
    socket.emit("report_score", { score: 100, blinks: 0, talks: 0, rateSpikes: 0 });
    setStatus("Skor uji coba (100) dikirim.", "#4ade80");
  };

  document.addEventListener("visibilitychange", () => {
    if (socket && socket.connected) {
      socket.emit("visibility_change", document.hidden);
    }
  });

  window.addEventListener("DOMContentLoaded", connectWithFailover);
})();
