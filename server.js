const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path')

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
      origin: [
      "https://your-vercel-app.vercel.app",
      "http://localhost:3000" // Keep for local testing
    ],
  }
});

// Store active rooms
const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle room creation
  socket.on('createRoom', (data) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      host: socket.id,
      users: [{
        id: socket.id,
        name: data.username
      }],
      currentTrack: null,
      playbackState: 'paused',
      position: 0
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
  });

  // Handle joining a room
  socket.on('joinRoom', (data) => {
    if (!rooms[data.roomId]) {
      return socket.emit('error', { message: 'Room not found' });
    }

    socket.join(data.roomId);
    rooms[data.roomId].users.push({
      id: socket.id,
      name: data.username
    });

    // Notify room about new user
    io.to(data.roomId).emit('userJoined', {
      user: data.username,
      users: rooms[data.roomId].users
    });

    // Send current room state to new user
    socket.emit('roomState', {
      currentTrack: rooms[data.roomId].currentTrack,
      playbackState: rooms[data.roomId].playbackState,
      position: rooms[data.roomId].position
    });
  });

  // Handle play/pause events
  socket.on('playbackEvent', (data) => {
    if (rooms[data.roomId] && rooms[data.roomId].host === socket.id) {
      rooms[data.roomId].playbackState = data.state;
      rooms[data.roomId].position = data.position || 0;
      
      io.to(data.roomId).emit('playbackUpdate', {
        state: data.state,
        position: data.position
      });
    }
  });

  // Handle track change
  socket.on('changeTrack', (data) => {
    if (rooms[data.roomId] && rooms[data.roomId].host === socket.id) {
      rooms[data.roomId].currentTrack = data.track;
      rooms[data.roomId].playbackState = 'playing';
      rooms[data.roomId].position = 0;
      
      io.to(data.roomId).emit('trackChanged', {
        track: data.track
      });
    }
  });

  // Handle chat messages
  socket.on('sendMessage', (data) => {
    if (rooms[data.roomId]) {
      io.to(data.roomId).emit('newMessage', {
        user: data.user,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    // Clean up room if host leaves
    for (const roomId in rooms) {
      if (rooms[roomId].host === socket.id) {
        io.to(roomId).emit('roomClosed');
        delete rooms[roomId];
      } else {
        // Remove user from room
        rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
        io.to(roomId).emit('userLeft', {
          userId: socket.id,
          users: rooms[roomId].users
        });
      }
    }
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}


app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
