const express = require('express');
const https = require('https');
const socketIo = require('socket.io');
const Turn = require('node-turn');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const selfsigned = require('selfsigned');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

// Helper to get local network IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIpAddress();
console.log(`Detected Server LAN IP: ${localIp}`);

// Generate self-signed SSL Certificate for Secure Context (WebRTC requirements over LAN)
const attrs = [
  { name: 'commonName', value: localIp },
  { name: 'organizationName', value: 'Atomberg AtomQuest' }
];
const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048 });
const sslOptions = {
  key: pems.private,
  cert: pems.cert
};

const app = express();
const server = https.createServer(sslOptions, app);

// Prevent default Node.js HTTPS server socket timeouts (which cause 2-minute disconnect drops)
server.timeout = 0; 
server.keepAliveTimeout = 60000; 

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,   // Wait 60s for a ping response before terminating
  pingInterval: 25000   // Send ping heartbeat packets every 25s
});

// Port settings
const PORT = process.env.PORT || 3000;
const TURN_PORT = process.env.TURN_PORT || 3478;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create folders if they don't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const recordingsDir = path.join(__dirname, 'public', 'recordings');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

// Setup Muther storage for file sharing & recordings
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: fileStorage });

const recordingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recordingsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `recording-${req.body.sessionId}-${Date.now()}.webm`);
  }
});
const uploadRecording = multer({ storage: recordingStorage });

// ----------------------------------------------------
// 1. Initialize STUN/TURN Server
// ----------------------------------------------------
try {
  const turnServer = new Turn({
    authMech: 'long-term',
    credentials: {
      'atomquest': 'supersecretpassword'
    },
    listeningPort: TURN_PORT
  });
  turnServer.start();
  console.log(`STUN/TURN Server listening on UDP/TCP port ${TURN_PORT}`);
} catch (err) {
  console.error('Failed to start TURN server:', err.message);
}

// ----------------------------------------------------
// 2. HTTP Routes / API
// ----------------------------------------------------

// Create a new session (Agent only)
app.post('/api/sessions', async (req, res) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    const sessionId = uuidv4();
    const customerToken = uuidv4();

    await db.createSession(sessionId, agentId, customerToken);
    await db.logEvent(sessionId, 'info', `Session created by agent ${agentId}`);

    res.status(201).json({
      sessionId,
      customerToken,
      inviteLink: `https://${localIp}:${PORT}/join.html?token=${customerToken}`
    });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token and return session details
app.get('/api/verify-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const session = await db.getSessionByToken(token);
    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired invite token' });
    }
    if (session.status === 'ended') {
      return res.status(400).json({ error: 'This session has already ended' });
    }
    res.json({
      sessionId: session.id,
      agentId: session.agent_id,
      status: session.status
    });
  } catch (err) {
    console.error('Error verifying token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// File share upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { sessionId, role, userId } = req.body;
    if (!req.file || !sessionId || !role) {
      return res.status(400).json({ error: 'Missing file, sessionId, or role' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const content = req.file.originalname;

    await db.addChatMessage(sessionId, role, userId || null, 'file', content, filePath);
    await db.logEvent(sessionId, 'info', `${role} uploaded file: ${content}`);

    // Broadcast file to the session room
    io.to(`session_${sessionId}`).emit('chat_message', {
      sender_role: role,
      sender_id: userId || null,
      message_type: 'file',
      content,
      file_path: filePath,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, filePath, content });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call Recording upload
app.post('/api/recordings/upload', uploadRecording.single('recording'), async (req, res) => {
  try {
    const { sessionId, recordingId } = req.body;
    if (!req.file || !sessionId || !recordingId) {
      return res.status(400).json({ error: 'Missing recording file, sessionId, or recordingId' });
    }

    const filePath = `/recordings/${req.file.filename}`;
    await db.updateRecordingStatus(recordingId, 'processing', filePath);
    await db.logEvent(sessionId, 'info', `Recording saved to disk, starting processing simulation`);

    // Broadcast to room that recording is processing
    io.to(`session_${sessionId}`).emit('recording_status', {
      recordingId,
      status: 'processing'
    });

    // Simulate encoding / processing delay
    setTimeout(async () => {
      try {
        await db.updateRecordingStatus(recordingId, 'ready');
        await db.logEvent(sessionId, 'info', `Recording processing finished`);
        io.to(`session_${sessionId}`).emit('recording_status', {
          recordingId,
          status: 'ready',
          filePath
        });
      } catch (err) {
        console.error('Error in deferred recording status update:', err);
      }
    }, 5000);

    res.json({ success: true, recordingId, status: 'processing' });
  } catch (err) {
    console.error('Error uploading recording:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints
app.get('/api/admin/sessions', async (req, res) => {
  try {
    const sessions = await db.getAllSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const participants = await db.getAllParticipants(sessionId);
    const chatHistory = await db.getChatHistory(sessionId);
    const recording = await db.getRecordingBySession(sessionId);
    const logs = await db.getEventLogs(sessionId);

    res.json({ session, participants, chatHistory, recording, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete session and associated files route
app.delete('/api/admin/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // 1. Get recording and delete its file if exists
    const recording = await db.getRecordingBySession(sessionId);
    if (recording && recording.file_path) {
      const recPath = path.join(__dirname, 'public', recording.file_path);
      if (fs.existsSync(recPath)) {
        try {
          fs.unlinkSync(recPath);
          console.log(`Deleted recording file: ${recPath}`);
        } catch (e) {
          console.error(`Error deleting recording file ${recPath}:`, e);
        }
      }
    }

    // 2. Get chat history and delete uploaded shared files
    const chatHistory = await db.getChatHistory(sessionId);
    for (const msg of chatHistory) {
      if (msg.message_type === 'file' && msg.file_path) {
        const filePath = path.join(__dirname, 'public', msg.file_path);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`Deleted shared file: ${filePath}`);
          } catch (e) {
            console.error(`Error deleting shared file ${filePath}:`, e);
          }
        }
      }
    }

    // 3. Clear from database
    await db.deleteSessionData(sessionId);
    console.log(`Cleaned up session database entries for sessionId: ${sessionId}`);

    // 4. Notify admin panel to update
    broadcastAdminUpdate();

    res.json({ success: true, message: 'Session data and associated files deleted successfully' });
  } catch (err) {
    console.error('Error deleting session data:', err);
    res.status(500).json({ error: err.message });
  }
});

// Observability metrics (Prometheus format)
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(`
# HELP active_sessions Current number of active support sessions
# TYPE active_sessions gauge
active_sessions ${metrics.activeSessions}

# HELP connected_participants Current number of connected participants
# TYPE connected_participants gauge
connected_participants ${metrics.activeParticipants}

# HELP total_sessions_created Total support sessions created
# TYPE total_sessions_created counter
total_sessions_created ${metrics.totalSessions}

# HELP average_session_duration_seconds Average session duration of participants in seconds
# TYPE average_session_duration_seconds gauge
average_session_duration_seconds ${metrics.averageDuration}

# HELP error_events_total Total error events logged in session logs
# TYPE error_events_total counter
error_events_total ${metrics.errorCount}
`.trim() + '\n');
  } catch (err) {
    res.status(500).send('Error gathering metrics');
  }
});

// ----------------------------------------------------
// 3. Socket.io Signaling & Real-Time Coordination
// ----------------------------------------------------
const activeConnections = {}; // Map of socket.id -> { sessionId, userId, role }
const disconnectTimers = {}; // Map of userId -> setTimeout object (reconnect grace period)

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join session handler
  socket.on('join_session', async ({ sessionId, userId, role }) => {
    try {
      socket.join(`session_${sessionId}`);
      activeConnections[socket.id] = { sessionId, userId, role };

      // Find all existing users in the session room (except this joining user)
      const roomUsers = Object.keys(activeConnections)
        .filter(id => activeConnections[id].sessionId === sessionId && id !== socket.id)
        .map(id => ({
          socketId: id,
          userId: activeConnections[id].userId,
          role: activeConnections[id].role
        }));
      socket.emit('room_users', { users: roomUsers });

      // Handle Reconnection logic: if there was a disconnect timer for this user, clear it
      if (disconnectTimers[userId]) {
        console.log(`User ${userId} (${role}) reconnected within grace period. Clearing timer.`);
        clearTimeout(disconnectTimers[userId]);
        delete disconnectTimers[userId];
        
        // Notify others
        socket.to(`session_${sessionId}`).emit('peer_reconnected', { socketId: socket.id, userId, role });
        await db.logEvent(sessionId, 'info', `${role} (${userId}) reconnected`);
      } else {
        // First time joining or after expiration
        await db.addParticipant(sessionId, userId, role);
        await db.logEvent(sessionId, 'info', `${role} (${userId}) joined the session`);

        // If it's a customer, update the session status to active
        if (role === 'customer') {
          await db.updateSessionStatus(sessionId, 'active');
          socket.to(`session_${sessionId}`).emit('session_active');
        }

        socket.to(`session_${sessionId}`).emit('peer_joined', { socketId: socket.id, userId, role });
      }

      // Populate history of chat for the rejoining / newly joining participant
      const chatHistory = await db.getChatHistory(sessionId);
      socket.emit('chat_history', chatHistory);

      // Check if there is an active recording
      const recording = await db.getRecordingBySession(sessionId);
      if (recording) {
        socket.emit('recording_status', {
          recordingId: recording.id,
          status: recording.status,
          filePath: recording.file_path
        });
      }

      // Update admin panel on connection changes
      broadcastAdminUpdate();
    } catch (err) {
      console.error('Error joining session:', err);
      socket.emit('error', 'Failed to join session');
    }
  });

  // Signaling relay: WebRTC offer, answer, ice-candidate
  socket.on('signal', (data) => {
    const { targetId, signalData } = data;
    // Relay signaling data directly to the target participant
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      signalData
    });
  });

  // Screen share status change
  socket.on('screen_share_change', (data) => {
    const { sessionId, isSharing, role } = data;
    socket.to(`session_${sessionId}`).emit('screen_share_change', {
      senderId: socket.id,
      isSharing,
      role
    });
  });

  // In-call chat message
  socket.on('send_chat_message', async ({ sessionId, role, userId, content }) => {
    try {
      await db.addChatMessage(sessionId, role, userId, 'text', content);
      
      io.to(`session_${sessionId}`).emit('chat_message', {
        sender_role: role,
        sender_id: userId,
        message_type: 'text',
        content,
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error saving chat message:', err);
    }
  });

  // Call Recording Controls (Agent only)
  socket.on('start_recording', async ({ sessionId }) => {
    try {
      const conn = activeConnections[socket.id];
      if (!conn || conn.role !== 'agent') {
        return socket.emit('error', 'Unauthorized: Only agents can control recordings');
      }

      const recordingId = uuidv4();
      await db.createRecording(recordingId, sessionId);
      await db.logEvent(sessionId, 'info', 'Recording started by agent');

      io.to(`session_${sessionId}`).emit('recording_status', {
        recordingId,
        status: 'in_progress'
      });
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  });

  socket.on('stop_recording', async ({ sessionId, recordingId }) => {
    try {
      const conn = activeConnections[socket.id];
      if (!conn || conn.role !== 'agent') {
        return socket.emit('error', 'Unauthorized: Only agents can control recordings');
      }

      await db.logEvent(sessionId, 'info', 'Recording stopped by agent');
      io.to(`session_${sessionId}`).emit('recording_status', {
        recordingId,
        status: 'stopping'
      });
    } catch (err) {
      console.error('Error stopping recording:', err);
    }
  });

  // End Session cleanly (either agent or customer)
  socket.on('end_session', async ({ sessionId, userId, role }) => {
    try {
      let resolvedRole = role;
      let resolvedUserId = userId;

      const conn = activeConnections[socket.id];
      if (conn) {
        resolvedRole = conn.role;
        resolvedUserId = conn.userId;
      }

      if (resolvedRole === 'customer') {
        console.log(`Customer ${resolvedUserId} requested to leave call session ${sessionId}`);
        
        // Remove customer from participants in DB
        await db.removeParticipant(sessionId, resolvedUserId);
        await db.logEvent(sessionId, 'info', `Customer (${resolvedUserId}) left the session`);

        // Notify other room participants that this customer left
        socket.to(`session_${sessionId}`).emit('peer_left', {
          socketId: socket.id,
          userId: resolvedUserId,
          role: resolvedRole
        });

        // Tell the customer socket to cleanup locally and redirect
        socket.emit('customer_exited');
        socket.disconnect();
        
        broadcastAdminUpdate();
      } else {
        // Agent / admin ending call: end for everyone!
        await db.updateSessionStatus(sessionId, 'ended');
        await db.logEvent(sessionId, 'info', `Session ended by agent ${resolvedUserId}`);

        io.to(`session_${sessionId}`).emit('session_ended', { endedBy: resolvedRole });

        // Clean up all active participants in database
        const activeParticipants = await db.getActiveParticipants(sessionId);
        for (const p of activeParticipants) {
          await db.removeParticipant(sessionId, p.user_id);
        }

        // Disconnect all sockets in that room
        const room = io.sockets.adapter.rooms.get(`session_${sessionId}`);
        if (room) {
          for (const socketId of room) {
            const s = io.sockets.sockets.get(socketId);
            if (s) s.disconnect();
          }
        }

        broadcastAdminUpdate();
      }
    } catch (err) {
      console.error('Error ending session:', err);
    }
  });  // Handle sudden disconnect (e.g. tab closed or network drop)
  socket.on('disconnect', async () => {
    const conn = activeConnections[socket.id];
    if (conn) {
      const { sessionId, userId, role } = conn;
      delete activeConnections[socket.id];

      console.log(`Socket disconnected unexpectedly: ${socket.id} (${role}). Entering 15s grace period.`);

      // Store a reconnect grace timer for this user
      disconnectTimers[userId] = setTimeout(async () => {
        // Grace period expired! Remove the timer and treat them as permanently left
        delete disconnectTimers[userId];
        console.log(`Grace period expired for ${role} (${userId})`);

        if (role === 'customer') {
          try {
            await db.removeParticipant(sessionId, userId);
            await db.logEvent(sessionId, 'info', `Customer (${userId}) left permanently after grace period`);

            // Notify other room participants that this customer left permanently
            io.to(`session_${sessionId}`).emit('peer_left', {
              socketId: socket.id,
              userId,
              role
            });

            // If session is empty, set session status to ended
            const active = await db.getActiveParticipants(sessionId);
            if (active.length === 0) {
              const session = await db.getSession(sessionId);
              if (session && session.status !== 'ended') {
                await db.updateSessionStatus(sessionId, 'ended');
                await db.logEvent(sessionId, 'info', `Session closed due to emptiness`);
              }
            }

            broadcastAdminUpdate();
          } catch (err) {
            console.error('Error handling customer permanent drop:', err);
          }
        } else {
          // Agent / admin left permanently: end session for everyone!
          try {
            await db.updateSessionStatus(sessionId, 'ended');
            await db.logEvent(sessionId, 'info', `Session ended due to agent permanent absence`);

            io.to(`session_${sessionId}`).emit('session_ended', { endedBy: role });

            // Clean up all active participants in database
            const activeParticipants = await db.getActiveParticipants(sessionId);
            for (const p of activeParticipants) {
              await db.removeParticipant(sessionId, p.user_id);
            }

            // Disconnect all sockets in that room
            const room = io.sockets.adapter.rooms.get(`session_${sessionId}`);
            if (room) {
              for (const socketId of room) {
                const s = io.sockets.sockets.get(socketId);
                if (s) s.disconnect();
              }
            }

            broadcastAdminUpdate();
          } catch (err) {
            console.error('Error handling agent permanent drop:', err);
          }
        }
      }, 15000); // 15 seconds grace period
    }
  });
});

// Admin channels updates
function broadcastAdminUpdate() {
  io.emit('admin_update');
}

// ----------------------------------------------------
// 4. Start Server & DB
// ----------------------------------------------------
db.initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Web server running on https://${localIp}:${PORT}`);
    console.log(`Fallback local URL: https://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database, shutting down:', err);
});
