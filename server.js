const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 3000;

// Simpan info room di memory
// rooms[roomId] = { participants: { socketId: { name, joinedAt } } }
const rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/meeting/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'meeting.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, name }, callback) => {
    if (!roomId || !name) {
      callback && callback({ error: 'Room ID dan nama wajib diisi' });
      return;
    }

    if (!rooms[roomId]) rooms[roomId] = { participants: {} };

    const room = rooms[roomId];
    socket.roomId = roomId;
    socket.userName = name;
    room.participants[socket.id] = { name, joinedAt: Date.now() };
    socket.join(roomId);

    // Kirim daftar peserta yang sudah ada ke user baru
    const others = Object.entries(room.participants)
      .filter(([id]) => id !== socket.id)
      .map(([id, p]) => ({ id, name: p.name }));

    callback && callback({ ok: true, others });

    // Beri tahu peserta lain bahwa ada user baru
    socket.to(roomId).emit('user-joined', { id: socket.id, name });
    console.log(`${name} joined room ${roomId}`);
  });

  // WebRTC signaling
  socket.on('offer', ({ to, sdp }) => {
    io.to(to).emit('offer', { from: socket.id, name: socket.userName, sdp });
  });

  socket.on('answer', ({ to, sdp }) => {
    io.to(to).emit('answer', { from: socket.id, sdp });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Chat
  socket.on('chat-message', ({ roomId, message }) => {
    const payload = {
      id: socket.id,
      name: socket.userName,
      message,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
    io.to(roomId).emit('chat-message', payload);
  });

  // Status mic/kamera berubah
  socket.on('media-state', ({ roomId, micOn, camOn }) => {
    socket.to(roomId).emit('peer-media-state', { id: socket.id, micOn, camOn });
  });

  socket.on('screen-sharing', ({ roomId, active }) => {
    socket.to(roomId).emit('peer-screen-share', { id: socket.id, active });
  });

  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    handleLeave(socket, socket.roomId);
    console.log('User disconnected:', socket.id);
  });

  function handleLeave(socket, roomId) {
    if (!roomId || !rooms[roomId]) return;
    delete rooms[roomId].participants[socket.id];
    if (Object.keys(rooms[roomId].participants).length === 0) {
      delete rooms[roomId];
    }
    socket.leave(roomId);
    io.to(roomId).emit('user-left', { id: socket.id, name: socket.userName });
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
