import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.get('/', (req, res) => res.send('Presage Party Server is running.'));

interface ScoreReport { score: number; blinks: number; talks: number; rateSpikes: number; survived: boolean; }
interface Room { code: string; host: string; guest: string | null; startAt: number | null; level: number; results: { host: ScoreReport | null; guest: ScoreReport | null }; }

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  socket.on('create_room', (callback) => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms.set(code, { code, host: socket.id, guest: null, startAt: null, level: 1, results: { host: null, guest: null } });
    socketToRoom.set(socket.id, code);
    socket.join(code);
    console.log(`Room created: ${code} by ${socket.id}`);
    callback({ success: true, roomCode: code, role: 'host' });
  });

  socket.on('join_room', (code, callback) => {
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: 'Room not found' });
    if (room.guest) return callback({ success: false, error: 'Room full' });

    room.guest = socket.id;
    socketToRoom.set(socket.id, code);
    socket.join(code);
    socket.to(code).emit('player_joined', socket.id);
    socket.emit('room_joined', { host: room.host, code, role: 'guest' });
    callback({ success: true, role: 'guest' });
    console.log(`[>] ${socket.id} joined room ${code}`);
  });

  socket.on('start_game', (data: { level: number }, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = code ? rooms.get(code) : null;
    if (!room) return callback({ success: false, error: 'Not in a room' });
    if (room.host !== socket.id) return callback({ success: false, error: 'Only host can start' });
    if (!room.guest) return callback({ success: false, error: 'No opponent yet' });

    room.level = data.level || 1;
    room.startAt = Date.now() + 3000;
    room.results = { host: null, guest: null };
    io.to(code).emit('game_start', { startAt: room.startAt, level: room.level });
    console.log(`[game] room ${code} starting at ${room.startAt} level ${room.level}`);
    callback({ success: true });
  });

  socket.on('report_score', (data: ScoreReport, callback) => {
    const code = socketToRoom.get(socket.id);
    const room = code ? rooms.get(code) : null;
    if (!room) return callback({ success: false, error: 'Not in a room' });

    const role: 'host' | 'guest' = socket.id === room.host ? 'host' : 'guest';
    room.results[role] = data;
    console.log(`[score] ${role} reported: ${JSON.stringify(data)}`);

    if (room.results.host && room.results.guest) {
      const hostScore = room.results.host.score || 0;
      const guestScore = room.results.guest.score || 0;
      const winner = hostScore > guestScore ? 'host' : guestScore > hostScore ? 'guest' : 'tie';
      io.to(code).emit('game_result', { host: room.results.host, guest: room.results.guest, winner });
      console.log(`[game] room ${code} result: winner=${winner}`);
    }
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    const code = socketToRoom.get(socket.id);
    if (code) {
      const room = rooms.get(code);
      if (room) {
        if (room.host === socket.id) {
          if (room.guest) {
            room.host = room.guest;
            room.guest = null;
            io.to(code).emit('host_migrated', room.host);
            console.log(`Room ${code}: host left, promoted guest to host`);
          } else {
            rooms.delete(code);
            console.log(`Room ${code} cleaned up (empty)`);
          }
        } else if (room.guest === socket.id) {
          room.guest = null;
          io.to(code).emit('opponent_left');
          console.log(`Room ${code}: guest left`);
        }
      }
      socketToRoom.delete(socket.id);
    }
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
