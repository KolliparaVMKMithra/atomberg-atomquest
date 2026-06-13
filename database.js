const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Helper functions to run queries with Promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables
async function initDatabase() {
  // 1. Sessions Table
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      customer_token TEXT NOT NULL UNIQUE,
      status TEXT CHECK(status IN ('created', 'active', 'ended')) DEFAULT 'created',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT
    )
  `);

  // 2. Participants Table (Tracks who is in a session at any time)
  await run(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT CHECK(role IN ('agent', 'customer')) NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      left_at TEXT,
      duration INTEGER DEFAULT 0, -- in seconds
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // 3. Chat Messages Table
  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sender_role TEXT CHECK(sender_role IN ('agent', 'customer')) NOT NULL,
      sender_id TEXT,
      message_type TEXT CHECK(message_type IN ('text', 'file')) NOT NULL,
      content TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Try to add sender_id column if table already exists without it
  try {
    await run('ALTER TABLE chat_messages ADD COLUMN sender_id TEXT');
    console.log('Added sender_id column to chat_messages successfully');
  } catch (e) {
    // Ignore error if column already exists
  }

  // 4. Recordings Table
  await run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT CHECK(status IN ('in_progress', 'processing', 'ready')) DEFAULT 'in_progress',
      file_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // 5. Event Logs Table (For session history and admin dashboard visibility)
  await run(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_description TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  console.log('Database tables initialized.');
}

// Database helper operations
const dbOperations = {
  initDatabase,
  
  // Session queries
  createSession: (id, agentId, customerToken) => {
    return run(
      'INSERT INTO sessions (id, agent_id, customer_token, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, agentId, customerToken, 'created', new Date().toISOString()]
    );
  },

  getSession: (id) => {
    return get('SELECT * FROM sessions WHERE id = ?', [id]);
  },

  getSessionByToken: (token) => {
    return get('SELECT * FROM sessions WHERE customer_token = ?', [token]);
  },

  updateSessionStatus: (id, status) => {
    const endedAt = status === 'ended' ? new Date().toISOString() : null;
    if (endedAt) {
      return run('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?', [status, endedAt, id]);
    }
    return run('UPDATE sessions SET status = ? WHERE id = ?', [status, id]);
  },

  getActiveSessions: () => {
    return all("SELECT * FROM sessions WHERE status IN ('created', 'active')");
  },

  getAllSessions: () => {
    return all("SELECT * FROM sessions ORDER BY created_at DESC");
  },

  // Participant queries
  addParticipant: (sessionId, userId, role) => {
    return run(
      'INSERT INTO participants (session_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [sessionId, userId, role, new Date().toISOString()]
    );
  },

  getParticipant: (sessionId, userId) => {
    return get('SELECT * FROM participants WHERE session_id = ? AND user_id = ? AND left_at IS NULL', [sessionId, userId]);
  },

  removeParticipant: async (sessionId, userId) => {
    const participant = await get('SELECT * FROM participants WHERE session_id = ? AND user_id = ? AND left_at IS NULL', [sessionId, userId]);
    if (!participant) return null;

    const leftAt = new Date().toISOString();
    const joinedAtMs = new Date(participant.joined_at).getTime();
    const leftAtMs = new Date(leftAt).getTime();
    const duration = Math.round((leftAtMs - joinedAtMs) / 1000);

    return run(
      'UPDATE participants SET left_at = ?, duration = ? WHERE id = ?',
      [leftAt, duration, participant.id]
    );
  },

  getActiveParticipants: (sessionId) => {
    return all('SELECT * FROM participants WHERE session_id = ? AND left_at IS NULL', [sessionId]);
  },

  getAllParticipants: (sessionId) => {
    return all('SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at ASC', [sessionId]);
  },

  // Chat queries
  addChatMessage: (sessionId, senderRole, senderId, messageType, content, filePath = null) => {
    return run(
      'INSERT INTO chat_messages (session_id, sender_role, sender_id, message_type, content, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sessionId, senderRole, senderId, messageType, content, filePath, new Date().toISOString()]
    );
  },

  getChatHistory: (sessionId) => {
    return all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  },

  // Recording queries
  createRecording: (id, sessionId) => {
    return run(
      'INSERT INTO recordings (id, session_id, status, created_at) VALUES (?, ?, ?, ?)',
      [id, sessionId, 'in_progress', new Date().toISOString()]
    );
  },

  updateRecordingStatus: (id, status, filePath = null) => {
    if (filePath) {
      return run('UPDATE recordings SET status = ?, file_path = ? WHERE id = ?', [status, filePath, id]);
    }
    return run('UPDATE recordings SET status = ? WHERE id = ?', [status, id]);
  },

  getRecordingBySession: (sessionId) => {
    return get('SELECT * FROM recordings WHERE session_id = ?', [sessionId]);
  },

  getRecording: (id) => {
    return get('SELECT * FROM recordings WHERE id = ?', [id]);
  },

  // Event log queries
  logEvent: (sessionId, eventType, eventDescription) => {
    return run(
      'INSERT INTO event_logs (session_id, event_type, event_description, created_at) VALUES (?, ?, ?, ?)',
      [sessionId, eventType, eventDescription, new Date().toISOString()]
    );
  },

  getEventLogs: (sessionId) => {
    return all('SELECT * FROM event_logs WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
  },

  // Operational metrics queries (for observability)
  getMetrics: async () => {
    const activeSessionsCount = await get("SELECT COUNT(*) as count FROM sessions WHERE status IN ('created', 'active')");
    const activeParticipantsCount = await get("SELECT COUNT(*) as count FROM participants WHERE left_at IS NULL");
    const totalSessionsCount = await get("SELECT COUNT(*) as count FROM sessions");
    const totalDuration = await get("SELECT SUM(duration) as sum FROM participants");
    const totalErrors = await get("SELECT COUNT(*) as count FROM event_logs WHERE event_type = 'error'");

    return {
      activeSessions: activeSessionsCount?.count || 0,
      activeParticipants: activeParticipantsCount?.count || 0,
      totalSessions: totalSessionsCount?.count || 0,
      averageDuration: totalSessionsCount?.count ? Math.round((totalDuration?.sum || 0) / totalSessionsCount.count) : 0,
      errorCount: totalErrors?.count || 0
    };
  },

  deleteSessionData: async (sessionId) => {
    await run('DELETE FROM event_logs WHERE session_id = ?', [sessionId]);
    await run('DELETE FROM recordings WHERE session_id = ?', [sessionId]);
    await run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
    await run('DELETE FROM participants WHERE session_id = ?', [sessionId]);
    await run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }
};

module.exports = dbOperations;
