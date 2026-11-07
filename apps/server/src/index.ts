import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.get('/', (req, res) => res.send('Presage Party Server is running.'));

interface ScoreReport { score: number; blinks: number; talks: number; rateSpikes: number; survived: boolean; }
interface Room { 
  code: string; host: string; guest: string | null; startAt: number | null; 
  level: number; duration: number; results: { host: ScoreReport | null; guest: ScoreReport | null };
  password: string | null; hostName: string; guestName: string | null;
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();
const hiddenTimeouts = new Map<string, NodeJS.Timeout>();

process.on('uncaughtException', (err) => console.error('[FATAL]', err));

function broadcastRoomList() {
  const list = Array.from(rooms.values())
    .filter(r => !r.password && !r.guest && !r.startAt) 
    .map(r => ({ code: r.code, host: r.hostName }));
  io.emit('rooms_list', list);
}

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  socket.on('get_rooms', () => {
    broadcastRoomList();
  });

  socket.on('create_room', (data) => {
    try {
      const existingCode = socketToRoom.get(socket.id);
      if (existingCode && rooms.has(existingCode)) {
        const r = rooms.get(existingCode)!;
        socket.emit('room_created', { roomCode: existingCode, role: 'host', hostName: r.hostName });
        return;
      }

      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      const pwd = data && data.password ? data.password.trim() : null;
      const hostName = (data && data.name) ? data.name.trim() : 'Room Master';
      
      rooms.set(code, { 
        code, host: socket.id, guest: null, startAt: null, level: 1, duration: 30, 
        results: { host: null, guest: null }, password: pwd, hostName, guestName: null
      });
      socketToRoom.set(socket.id, code);
      socket.join(code);
      broadcastRoomList();
      
      // Emit explicit event (no callback)
      socket.emit('room_created', { roomCode: code, role: 'host', hostName });
      console.log(`Room created: ${code} by ${socket.id}`);
    } catch (e) { console.error(e); }
  });

  socket.on('join_room', (data, callback) => {
    try {
      const room = rooms.get(data.code);
      if (!room) return typeof callback === 'function' && callback({ success: false, error: 'Room not found' });
      if (room.guest) return typeof callback === 'function' && callback({ success: false, error: 'Room full' });
      if (room.password && room.password !== data.password) {
        return typeof callback === 'function' && callback({ success: false, error: 'Incorrect password' });
      }

      room.guest = socket.id;
      room.guestName = (data && data.name) ? data.name.trim() : 'Gamer';
      socketToRoom.set(socket.id, data.code);
      socket.join(data.code);
      socket.to(data.code).emit('player_joined', { id: socket.id, name: room.guestName });
      socket.emit('room_joined', { host: room.host, hostName: room.hostName, code: room.code, role: 'guest' });
      broadcastRoomList();
      
      if (typeof callback === 'function') callback({ success: true, role: 'guest' });
      console.log(`[>] ${socket.id} joined room ${data.code}`);
    } catch (e) { if (typeof callback === 'function') callback({ success: false }); }
  });

  socket.on('start_game', (data, callback) => {
    try {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.host !== socket.id || !room.guest) {
        return typeof callback === 'function' && callback({ success: false, error: 'Cannot start' });
      }

      room.level = (data && data.level) || 1;
      room.duration = (data && data.duration) || 30;
      room.startAt = Date.now() + 3000;
      room.results = { host: null, guest: null };
      broadcastRoomList();
      
      io.to(code).emit('game_start', { startAt: room.startAt, level: room.level, duration: room.duration, roomCode: code });
      if (typeof callback === 'function') callback({ success: true });
      console.log(`[game] room ${code} starting at ${room.startAt} level ${room.level}`);
    } catch (e) { if (typeof callback === 'function') callback({ success: false }); }
  });

  socket.on('report_score', (data, callback) => {
    try {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room) return typeof callback === 'function' && callback({ success: false });

      const role = socket.id === room.host ? 'host' : 'guest';
      room.results[role] = data;
      console.log(`[score] ${role} reported: ${JSON.stringify(data)}`);

      if (room.results.host && room.results.guest) {
        const hScore = room.results.host.score || 0;
        const gScore = room.results.guest.score || 0;
        const winner = hScore > gScore ? 'host' : gScore > hScore ? 'guest' : 'tie';
        io.to(code).emit('game_result', { host: room.results.host, guest: room.results.guest, winner, hostName: room.hostName, guestName: room.guestName });
        console.log(`[game] room ${code} result: winner=${winner}`);
      }
      if (typeof callback === 'function') callback({ success: true });
    } catch (e) { if (typeof callback === 'function') callback({ success: false }); }
  });

  socket.on('visibility_change', (isVisible) => {
    const code = socketToRoom.get(socket.id);
    const room = code ? rooms.get(code) : null;
    if (!room || !room.startAt || room.startAt > Date.now()) return; 

    if (!isVisible) {
      if (!hiddenTimeouts.has(socket.id)) {
        hiddenTimeouts.set(socket.id, setTimeout(() => {
          console.log(`[CHEAT] Player ${socket.id} minimized window for >3s.`);
          io.to(code).emit('cheat_detected', socket.id);
          hiddenTimeouts.delete(socket.id);
        }, 3000));
      }
    } else {
      if (hiddenTimeouts.has(socket.id)) {
        clearTimeout(hiddenTimeouts.get(socket.id));
        hiddenTimeouts.delete(socket.id);
      }
    }
  });

  socket.on('disconnect', () => {
    if (hiddenTimeouts.has(socket.id)) { clearTimeout(hiddenTimeouts.get(socket.id)); hiddenTimeouts.delete(socket.id); }
    const code = socketToRoom.get(socket.id);
    if (code) {
      const room = rooms.get(code);
      if (room) {
        if (room.host === socket.id) {
          if (room.guest) {
            room.host = room.guest; room.hostName = room.guestName;
            room.guest = null; room.guestName = null;
            io.to(code).emit('host_migrated', room.host);
          } else { rooms.delete(code); }
        } else if (room.guest === socket.id) {
          room.guest = null; room.guestName = null;
          io.to(code).emit('opponent_left');
        }
        broadcastRoomList();
      }
      socketToRoom.delete(socket.id);
    }
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(3000, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:3000`));
