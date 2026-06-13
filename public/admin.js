let socket;
let selectedSessionId = null;
let auditLogsTimer = null;

// Helper to parse dates in UTC reliably across timezones
function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  let formatted = dateStr;
  if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.match(/-\d{2}:\d{2}$/)) {
    formatted = dateStr.replace(' ', 'T') + 'Z';
  }
  return new Date(formatted);
}

window.onload = () => {
  // Setup Socket.io connection for real-time admin updates
  socket = io();

  socket.on('connect', () => {
    console.log('Admin Socket Connected');
  });

  socket.on('admin_update', () => {
    console.log('Received admin update trigger from server');
    refreshDashboardData();
  });

  // Initial load
  refreshDashboardData();

  // Periodically refresh data (every 5 seconds) in case of non-socket events
  setInterval(refreshDashboardData, 5000);
};

async function refreshDashboardData() {
  try {
    // 1. Fetch metrics & sessions
    const response = await fetch('/api/admin/sessions');
    if (!response.ok) throw new Error('Failed to fetch sessions');
    const sessions = await response.json();

    // 2. Fetch Prometheus metrics metadata to update summary telemetry cards
    // Instead of parsing Prometheus format raw text, we can compute it on the fly from sessions,
    // or call the metrics API and parse it, or fetch a JSON endpoint.
    // Let's compute it client-side or parse the /metrics response (very simple)
    const metricsRes = await fetch('/metrics');
    const metricsText = await metricsRes.text();
    updateTelemetryCards(metricsText);

    // 3. Populate Live Sessions
    populateLiveSessions(sessions);

    // 4. Populate Historical Sessions
    populateHistoricalSessions(sessions);

    // 5. If a session is currently being audited, refresh its details
    if (selectedSessionId) {
      refreshAuditDetails(selectedSessionId);
    }
  } catch (err) {
    console.error('Error refreshing admin dashboard:', err);
  }
}

function updateTelemetryCards(metricsText) {
  // Simple regex to parse Prometheus text format
  const activeSessions = metricsText.match(/active_sessions\s+(\d+)/)?.[1] || 0;
  const connectedParticipants = metricsText.match(/connected_participants\s+(\d+)/)?.[1] || 0;
  const totalSessions = metricsText.match(/total_sessions_created\s+(\d+)/)?.[1] || 0;
  const avgDurationVal = metricsText.match(/average_session_duration_seconds\s+(\d+)/)?.[1] || 0;

  document.getElementById('metric-active-sessions').innerText = activeSessions;
  document.getElementById('metric-active-participants').innerText = connectedParticipants;
  document.getElementById('metric-total-sessions').innerText = totalSessions;
  
  const mins = Math.floor(avgDurationVal / 60);
  const secs = avgDurationVal % 60;
  document.getElementById('metric-avg-duration').innerText = `${mins}m ${secs}s`;
}

function populateLiveSessions(sessions) {
  const tbody = document.getElementById('live-sessions-tbody');
  const noLiveMsg = document.getElementById('no-live-sessions');
  tbody.innerHTML = '';

  const activeSessions = sessions.filter(s => s.status === 'created' || s.status === 'active');

  if (activeSessions.length === 0) {
    noLiveMsg.style.display = 'block';
    return;
  }

  noLiveMsg.style.display = 'none';

  activeSessions.forEach(session => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 13px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${session.id}
      </td>
      <td style="font-size: 13px;">${session.agent_id}</td>
      <td>
        <span class="status-badge status-${session.status}">${session.status}</span>
      </td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button onclick="inspectActiveSession('${session.id}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;">
            <i class="fa-solid fa-gauge-high"></i> Audit
          </button>
          <button onclick="forceEndSession('${session.id}')" class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;">
            <i class="fa-solid fa-ban"></i> Terminate
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateHistoricalSessions(sessions) {
  const tbody = document.getElementById('historical-sessions-tbody');
  tbody.innerHTML = '';

  const historicalSessions = sessions.filter(s => s.status === 'ended');

  if (historicalSessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
          No historical data in database yet.
        </td>
      </tr>
    `;
    return;
  }

  historicalSessions.forEach(session => {
    const tr = document.createElement('tr');
    const created = parseUTCDate(session.created_at).toLocaleString();
    const ended = session.ended_at ? parseUTCDate(session.ended_at).toLocaleString() : 'N/A';
    
    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 12px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${session.id}
      </td>
      <td style="font-size: 13px;">${session.agent_id}</td>
      <td style="font-family: monospace; font-size: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${session.customer_token}
      </td>
      <td style="font-size: 12px; color: var(--text-secondary);">${created}</td>
      <td style="font-size: 12px; color: var(--text-secondary);">${ended}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button onclick="inspectHistoricalSession('${session.id}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" title="Inspect Logs">
            <i class="fa-solid fa-eye"></i> Inspect
          </button>
          <button onclick="downloadSessionData('${session.id}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" title="Download Call Data">
            <i class="fa-solid fa-download"></i>
          </button>
          <button onclick="deleteSessionData('${session.id}')" class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;" title="Delete Session Data">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function inspectActiveSession(sessionId) {
  selectedSessionId = sessionId;
  document.getElementById('audit-placeholder').style.display = 'none';
  document.getElementById('audit-details').style.display = 'block';
  
  refreshAuditDetails(sessionId);
}

function inspectHistoricalSession(sessionId) {
  // Let the user inspect logs from historical sessions too in the audit card
  selectedSessionId = sessionId;
  document.getElementById('audit-placeholder').style.display = 'none';
  document.getElementById('audit-details').style.display = 'block';
  
  refreshAuditDetails(sessionId);
}

async function refreshAuditDetails(sessionId) {
  try {
    const response = await fetch(`/api/admin/session/${sessionId}`);
    if (!response.ok) return;

    const data = await response.json();

    document.getElementById('audit-session-id').innerText = `Session ID: ${data.session.id} (${data.session.status.toUpperCase()})`;

    // Populate active participants
    const participantsList = document.getElementById('audit-participants-list');
    participantsList.innerHTML = '';

    const currentParticipants = data.participants.filter(p => !p.left_at);
    if (currentParticipants.length === 0) {
      participantsList.innerHTML = `<span style="font-size: 12px; color: var(--text-muted); font-style: italic;">No participants currently connected.</span>`;
    } else {
      currentParticipants.forEach(p => {
        const timeJoined = parseUTCDate(p.joined_at).toLocaleTimeString();
        participantsList.innerHTML += `
          <div style="font-size: 13px; padding: 8px; background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${p.role.toUpperCase()}</strong>: ${p.user_id}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
              Joined: ${timeJoined}
            </div>
          </div>
        `;
      });
    }

    // Populate event logs
    const logsList = document.getElementById('audit-logs-list');
    logsList.innerHTML = '';

    if (data.logs.length === 0) {
      logsList.innerHTML = `<span style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 10px;">No events logged yet.</span>`;
    } else {
      data.logs.forEach(log => {
        const time = parseUTCDate(log.created_at).toLocaleTimeString();
        const typeClass = log.event_type === 'error' ? 'error' : 'info';
        
        logsList.innerHTML += `
          <div class="log-item ${typeClass}">
            [${time}] [${log.event_type.toUpperCase()}] ${log.event_description}
          </div>
        `;
      });
      // Scroll to bottom of logs
      logsList.scrollTop = logsList.scrollHeight;
    }
  } catch (err) {
    console.error('Error fetching audit details:', err);
  }
}

function forceEndSession(sessionId) {
  if (confirm(`CRITICAL WARNING: Are you sure you want to FORCE TERMINATE session ${sessionId}? All active participants will be kicked immediately.`)) {
    // Connect to room temporarily or let socket emit end call
    socket.emit('end_session', { sessionId, userId: 'operations-admin', role: 'agent' });
  }
}

async function downloadSessionData(sessId) {
  if (!sessId) {
    alert("Please select a session to download first.");
    return;
  }
  try {
    const response = await fetch(`/api/admin/session/${sessId}`);
    if (!response.ok) throw new Error("Failed to fetch session details.");
    
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-data-${sessId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error downloading data:", err);
    alert("Download failed: " + err.message);
  }
}

async function deleteSessionData(sessId) {
  if (!sessId) {
    alert("Please select a session to delete first.");
    return;
  }
  const confirmed = confirm(`Are you sure you want to permanently delete session ${sessId}?\nThis will erase the session record, all participants, logs, messages, and unlink file uploads and video recording from the server.`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/admin/session/${sessId}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error("Delete request failed.");
    const res = await response.json();

    alert("Session data successfully deleted.");

    // Clean up inspector view if we just deleted the session currently being inspected
    if (selectedSessionId === sessId) {
      selectedSessionId = null;
      document.getElementById('audit-details').style.display = 'none';
      document.getElementById('audit-placeholder').style.display = 'flex';
    }

    // Refresh dashboard data
    await refreshDashboardData();
  } catch (err) {
    console.error("Error deleting session data:", err);
    alert("Deletion failed: " + err.message);
  }
}
