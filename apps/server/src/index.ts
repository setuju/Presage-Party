import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Izinkan koneksi dari Windows Electron
    methods: ['GET', 'POST']
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Presage Party Server is running.');
});

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  // Event: Buat Room
  socket.on('create_room', (callback) => {
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.join(roomCode);
    console.log(`Room created: ${roomCode} by ${socket.id}`);
    callback({ success: true, roomCode });
  });

  // Event: Gabung Room
  socket.on('join_room', (roomCode, callback) => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    if (room) {
      socket.join(roomCode);
      console.log(`[>] ${socket.id} joined room ${roomCode}`);
      socket.to(roomCode).emit('player_joined', socket.id);
      callback({ success: true });
    } else {
      callback({ success: false, error: 'Room not found' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Connect from Windows via http://localhost:${PORT}`);
});
