// App variables and configurations
let socket;
let localStream;
let remoteStream;
const peers = {};
let sessionId;
let userId = 'user-' + Math.random().toString(36).substr(2, 9);
let userRole; // 'agent' or 'customer'
let currentRecordingId = null;
let statsInterval = null;
let selectedInspectId = null;
let isScreenSharing = false;
let screenStream = null;
let originalVideoTrack = null;
let isChatCollapsed = false;

// Reconnect/status trackers
let isPageVisible = true;
let isReconnecting = false;

// Media controls state
let isAudioMuted = false;
let isVideoStopped = false;

// Call Recording states (for canvas loop & Web Audio mixing)
let recordingTimer = null;
let recordingSeconds = 0;
let canvasAnimationId = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let audioDestNode = null;
let webrtcConfig = null;

// Helper to parse dates in UTC reliably across timezones
function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  let formatted = dateStr;
  if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.match(/-\d{2}:\d{2}$/)) {
    formatted = dateStr.replace(' ', 'T') + 'Z';
  }
  return new Date(formatted);
}

// ----------------------------------------------------
// WebRTC Configuration - FORCED TO USE RELAY ONLY
// ----------------------------------------------------
async function fetchWebRTCConfig() {
  try {
    const res = await fetch('/api/ice-config');
    if (res.ok) {
      webrtcConfig = await res.json();
      console.log("WebRTC Configuration loaded successfully:", webrtcConfig);
    }
  } catch (err) {
    console.error("Failed to fetch WebRTC ICE config from server, using local fallback:", err);
  }
}

function getPeerConnectionConfig() {
  if (webrtcConfig) {
    return webrtcConfig;
  }
  const host = window.location.hostname;
  return {
    iceServers: [
      {
        urls: `turn:${host}:3478`,
        username: 'atomquest',
        credential: 'supersecretpassword'
      }
    ],
    iceTransportPolicy: 'relay'
  };
}

// ----------------------------------------------------
// Page Initializers
// ----------------------------------------------------
window.onload = async () => {
  // Fetch dynamic WebRTC ICE configuration
  await fetchWebRTCConfig();

  // Check if we are on the customer page (join.html) or agent page (index.html)
  const isCustomerPage = window.location.pathname.includes('join.html');
  userRole = isCustomerPage ? 'customer' : 'agent';

  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (isCustomerPage) {
    if (!token) {
      showJoinError('Missing invite token. Please request a new invite link from the support agent.');
      return;
    }
    await verifyCustomerToken(token);
  } else {
    // Agent page: check local storage for login session
    const loggedInAgent = localStorage.getItem('agentId');
    if (loggedInAgent) {
      userId = loggedInAgent;
      showAgentDashboard();
    } else {
      showLoginScreen();
    }
  }

  // Handle visibility changes for drop detection
  document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
  });
};

// ----------------------------------------------------
// Agent Authentication Logic
// ----------------------------------------------------
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('agent-dashboard').style.display = 'none';
  document.getElementById('active-call-room').style.display = 'none';
}

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  // Simple static authentication for demo/hackathon purposes
  if (username === 'agent' && password === 'password') {
    localStorage.setItem('agentId', username);
    userId = username;
    document.getElementById('login-error').style.display = 'none';
    showAgentDashboard();
  } else {
    const errorDiv = document.getElementById('login-error');
    errorDiv.innerText = 'Invalid agent username or password. Use: agent / password';
    errorDiv.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('agentId');
  if (socket) socket.disconnect();
  window.location.href = '/';
}

// ----------------------------------------------------
// Agent Dashboard / Session Administration
// ----------------------------------------------------
async function showAgentDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('agent-dashboard').style.display = 'grid';
  document.getElementById('header-user-info').style.display = 'flex';
  document.getElementById('header-username').innerText = `Agent: ${userId}`;
  
  await fetchSessionHistory();
}

async function fetchSessionHistory() {
  try {
    const response = await fetch('/api/admin/sessions');
    const sessions = await response.json();
    const tbody = document.getElementById('history-list-tbody');
    tbody.innerHTML = '';

    if (sessions.length === 0) {
      document.getElementById('no-history-msg').style.display = 'block';
      document.getElementById('history-table').style.display = 'none';
      return;
    }

    document.getElementById('no-history-msg').style.display = 'none';
    document.getElementById('history-table').style.display = 'table';

    sessions.forEach(session => {
      const tr = document.createElement('tr');
      
      const createdDate = parseUTCDate(session.created_at).toLocaleString();
      let durationStr = '-';
      if (session.ended_at) {
        const start = parseUTCDate(session.created_at).getTime();
        const end = parseUTCDate(session.ended_at).getTime();
        const diffSecs = Math.round((end - start) / 1000);
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 13px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${session.id}
        </td>
        <td>
          <span class="status-badge status-${session.status}">${session.status}</span>
        </td>
        <td style="font-size: 13px; color: var(--text-secondary);">${createdDate}</td>
        <td style="font-size: 13px;">${durationStr}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button onclick="inspectSession('${session.id}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;">
              <i class="fa-solid fa-eye"></i> Inspect
            </button>
            ${session.status !== 'ended' ? `
              <button onclick="resumeSessionCall('${session.id}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;">
                <i class="fa-solid fa-phone"></i> Join
              </button>
            ` : ''}
            <button onclick="deleteSessionData('${session.id}')" class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;" title="Delete call data">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error fetching session history:', err);
  }
}

async function inspectSession(inspectId) {
  selectedInspectId = inspectId;
  try {
    const response = await fetch(`/api/admin/session/${inspectId}`);
    if (!response.ok) return;

    const data = await response.json();
    
    document.getElementById('inspector-placeholder').style.display = 'none';
    const inspector = document.getElementById('session-inspector');
    inspector.style.display = 'block';

    document.getElementById('inspect-session-id').innerText = `Session ID: ${data.session.id}`;
    document.getElementById('inspect-session-date').innerText = `Created: ${parseUTCDate(data.session.created_at).toLocaleString()}`;

    // Render participants
    const participantsList = document.getElementById('inspect-participants-list');
    participantsList.innerHTML = '';
    data.participants.forEach(p => {
      const joined = parseUTCDate(p.joined_at).toLocaleTimeString();
      const left = p.left_at ? parseUTCDate(p.left_at).toLocaleTimeString() : 'Active';
      const duration = p.duration ? `${Math.floor(p.duration / 60)}m ${p.duration % 60}s` : 'N/A';
      participantsList.innerHTML += `
        <div style="font-size: 13px; padding: 6px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid var(--border)">
          <strong>${p.role.toUpperCase()}</strong>: ${p.user_id}<br>
          <span style="color: var(--text-secondary); font-size: 11px;">Joined: ${joined} | Left: ${left} | Active: ${duration}</span>
        </div>
      `;
    });

    // Render recording
    const recContainer = document.getElementById('inspect-recording-container');
    recContainer.innerHTML = '';
    if (data.recording) {
      if (data.recording.status === 'ready') {
        recContainer.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 13px;"><i class="fa-solid fa-file-video"></i> Video Recording</span>
            <a href="${data.recording.file_path}" download class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;">
              <i class="fa-solid fa-download"></i> Download
            </a>
          </div>
        `;
      } else {
        recContainer.innerHTML = `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; padding: 10px; font-size: 13px; color: var(--warning);">
            <i class="fa-solid fa-spinner fa-spin"></i> Recording status: <strong>${data.recording.status}</strong>
          </div>
        `;
      }
    } else {
      recContainer.innerHTML = `<span style="font-size: 13px; color: var(--text-muted);">No recording available for this session</span>`;
    }

    // Render chat history
    const chatList = document.getElementById('inspect-chat-list');
    chatList.innerHTML = '';
    if (data.chatHistory.length === 0) {
      chatList.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">No messages exchanged.</span>`;
    } else {
      data.chatHistory.forEach(msg => {
        const time = parseUTCDate(msg.created_at).toLocaleTimeString();
        if (msg.message_type === 'file') {
          chatList.innerHTML += `
            <div>
              <span style="color: var(--accent-color); font-weight:600;">[${msg.sender_role.toUpperCase()}]</span> 
              shared file: <a href="${msg.file_path}" target="_blank" style="color: var(--success);">${msg.content}</a>
              <span style="color: var(--text-muted); font-size:10px; float:right;">${time}</span>
            </div>
          `;
        } else {
          chatList.innerHTML += `
            <div>
              <span style="color: var(--accent-color); font-weight:600;">[${msg.sender_role.toUpperCase()}]</span> 
              ${msg.content}
              <span style="color: var(--text-muted); font-size:10px; float:right;">${time}</span>
            </div>
          `;
        }
      });
    }
  } catch (err) {
    console.error('Error inspecting session:', err);
  }
}

async function createNewSession() {
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: userId })
    });
    
    if (!response.ok) throw new Error('Failed to create session');

    const sessionData = await response.json();
    sessionId = sessionData.sessionId;

    document.getElementById('invite-link-input').value = sessionData.inviteLink;
    document.getElementById('session-creation-card').style.display = 'block';

    const startCallBtn = document.getElementById('start-call-btn');
    startCallBtn.onclick = () => startCallRoom(sessionId);
    
    // Connect socket and listen for customer joining
    connectSocket(sessionId);
  } catch (err) {
    console.error('Error creating support session:', err);
  }
}

function cancelCreatedSession() {
  document.getElementById('session-creation-card').style.display = 'none';
  if (socket) socket.disconnect();
  document.getElementById('notification-banner').classList.remove('active');
  fetchSessionHistory();
}

function copyInviteLink() {
  const inviteInput = document.getElementById('invite-link-input');
  if (!inviteInput) return;

  inviteInput.select();
  inviteInput.setSelectionRange(0, 99999); // For mobile devices

  navigator.clipboard.writeText(inviteInput.value)
    .then(() => {
      const copyIcon = document.getElementById('copy-icon');
      if (copyIcon) {
        copyIcon.className = 'fa-solid fa-check';
        setTimeout(() => {
          copyIcon.className = 'fa-regular fa-copy';
        }, 2000);
      }
    })
    .catch(err => {
      console.error('Failed to copy link: ', err);
      try {
        document.execCommand('copy');
        const copyIcon = document.getElementById('copy-icon');
        if (copyIcon) {
          copyIcon.className = 'fa-solid fa-check';
          setTimeout(() => {
            copyIcon.className = 'fa-regular fa-copy';
          }, 2000);
        }
      } catch (e) {
        console.error('Fallback copy failed: ', e);
      }
    });
}

function resumeSessionCall(resSessionId) {
  sessionId = resSessionId;
  startCallRoom(sessionId);
}

// ----------------------------------------------------
// Customer Verification
// ----------------------------------------------------
async function verifyCustomerToken(token) {
  const prompt = document.getElementById('join-prompt');
  const errorDiv = document.getElementById('join-error');
  const preview = document.getElementById('join-preview-box');

  try {
    const response = await fetch(`/api/verify-token/${token}`);
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Invalid token');
    }

    const data = await response.json();
    sessionId = data.sessionId;

    prompt.innerText = 'Invite token verified. Set up your camera and microphone to start the call.';
    preview.style.display = 'block';

    // Start local preview
    await setupLocalStream(true);
  } catch (err) {
    prompt.style.display = 'none';
    errorDiv.innerText = err.message || 'Verification failed';
    errorDiv.style.display = 'block';
  }
}

async function setupLocalStream(isPreview = false) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    
    localStream = stream;
    const videoElem = document.getElementById(isPreview ? 'preview-video' : 'local-video');
    if (videoElem) {
      videoElem.srcObject = stream;
      videoElem.play().catch(e => console.error("Error playing local video:", e));
    }
    
    const placeholder = document.getElementById(isPreview ? 'preview-placeholder' : 'local-video-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    // If PeerConnections are already active (e.g. race condition), add tracks dynamically
    if (Object.keys(peers).length > 0 && !isPreview) {
      console.log("Adding tracks to already active PeerConnections...");
      Object.keys(peers).forEach(async (socketId) => {
        const pc = peers[socketId];
        const senders = pc.getSenders();
        stream.getTracks().forEach(async (track) => {
          const alreadyAdded = senders.some(s => s.track === track);
          if (!alreadyAdded) {
            pc.addTrack(track, stream);
          }
        });
        
        // Trigger WebRTC renegotiation offer
        if (socket && socket.connected) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', {
            targetId: socketId,
            signalData: { type: 'offer', offer }
          });
        }
      });
    }
  } catch (err) {
    console.error('Error accessing camera/microphone:', err);
    const placeholder = document.getElementById(isPreview ? 'preview-placeholder' : 'local-video-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
      const span = placeholder.querySelector('span');
      if (span) {
        span.innerText = 'Camera Blocked / Unavailable. Click the camera icon in your browser URL bar to allow permissions.';
      }
    }
    alert('Could not access your camera or microphone. Please check system permissions. You can allow permissions by clicking the camera icon in your browser address bar and reloading.');
  }
}

async function joinCallRoom() {
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('active-call-room').style.display = 'grid';
  
  // Assign the local stream to the active room's local video element!
  const localVideo = document.getElementById('local-video');
  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(e => console.error("Error playing local video:", e));
  }
  
  // Hide the local video placeholder since the camera stream is loaded
  const placeholder = document.getElementById('local-video-placeholder');
  if (placeholder) {
    placeholder.style.display = 'none';
  }
  
  // Connect WebSocket & WebRTC
  connectSocket(sessionId);

  // Initialize draggable local video preview and chat state
  makeElementDraggable(document.getElementById('local-video-card'), document.querySelector('.video-grid'));
  isChatCollapsed = false;
  const room = document.getElementById('active-call-room');
  if (room) room.classList.remove('chat-collapsed');
  const chatBtn = document.getElementById('btn-chat');
  if (chatBtn) chatBtn.classList.add('active');
}

// ----------------------------------------------------
// Active Support Room Core Logic
// ----------------------------------------------------
async function startCallRoom(sId) {
  sessionId = sId;
  document.getElementById('agent-dashboard').style.display = 'none';
  document.getElementById('active-call-room').style.display = 'grid';

  // Load mic & webcam
  await setupLocalStream(false);
  
  // If socket wasn't connected yet (resuming), connect it now
  if (!socket || !socket.connected) {
    connectSocket(sessionId);
  }

  // Initialize draggable local video preview and chat state
  makeElementDraggable(document.getElementById('local-video-card'), document.querySelector('.video-grid'));
  isChatCollapsed = false;
  const room = document.getElementById('active-call-room');
  if (room) room.classList.remove('chat-collapsed');
  const chatBtn = document.getElementById('btn-chat');
  if (chatBtn) chatBtn.classList.add('active');
}

function connectSocket(sId) {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to signaling gateway:', socket.id);
    socket.emit('join_session', { sessionId: sId, userId, role: userRole });
    
    if (isReconnecting) {
      isReconnecting = false;
      document.getElementById('notification-banner').classList.remove('active');
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') {
      // Manual clean disconnect, do not show banner
      return;
    }
    console.warn('Disconnected from signaling server:', reason);
    isReconnecting = true;
    document.getElementById('notification-banner').classList.add('active');
  });

  // Keep track of room users list
  socket.on('room_users', (data) => {
    console.log("Existing room users list received:", data.users);
  });

  // Peer joined - initiate WebRTC connection (existing peer creates offer)
  socket.on('peer_joined', async (data) => {
    const { socketId, userId: peerUserId, role: peerRole } = data;
    console.log('Peer joined support call:', data);
    
    await initializePeerConnection(socketId, peerRole, peerUserId);
    
    const pc = peers[socketId];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('signal', {
      targetId: socketId,
      signalData: { type: 'offer', offer }
    });

    // Notify newly joined peer about our active screenshare track ID if we are sharing
    if (isScreenSharing && screenStream) {
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        socket.emit('screen_share_change', {
          sessionId,
          isSharing: true,
          role: userRole,
          screenTrackId: screenTrack.id
        });
      }
    }
  });

  socket.on('peer_reconnected', async (data) => {
    const { socketId, userId: peerUserId, role: peerRole } = data;
    console.log('Peer reconnected successfully:', data);
    document.getElementById('notification-banner').classList.remove('active');
    
    // Clean up old socket connection under the same userId
    Object.keys(peers).forEach(id => {
      if (peers[id].userId === peerUserId && id !== socketId) {
        peers[id].close();
        delete peers[id];
        const card = document.getElementById(`remote-card-${id}`);
        if (card) card.remove();
        const screenCard = document.getElementById(`remote-card-screen-${id}`);
        if (screenCard) screenCard.remove();
      }
    });

    await initializePeerConnection(socketId, peerRole, peerUserId);
    const pc = peers[socketId];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('signal', {
      targetId: socketId,
      signalData: { type: 'offer', offer }
    });

    // Notify newly reconnected peer about our active screenshare track ID if we are sharing
    if (isScreenSharing && screenStream) {
      const screenTrack = screenStream.getVideoTracks()[0];
      if (screenTrack) {
        socket.emit('screen_share_change', {
          sessionId,
          isSharing: true,
          role: userRole,
          screenTrackId: screenTrack.id
        });
      }
    }
  });

  // Receive signaling messages from a specific peer
  socket.on('signal', async (data) => {
    const { senderId, signalData } = data;
    
    let pc = peers[senderId];
    if (!pc) {
      // Create connection upon receiving offer/candidate
      await initializePeerConnection(senderId, 'unknown', 'peer');
      pc = peers[senderId];
    }

    if (signalData.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('signal', {
        targetId: senderId,
        signalData: { type: 'answer', answer }
      });
    } else if (signalData.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
    } else if (signalData.type === 'candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      } catch (e) {
        console.error('Error adding ice candidate:', e);
      }
    }
  });

  // Chat actions
  socket.on('chat_history', (history) => {
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '';
    history.forEach(appendMessageToChat);
  });

  socket.on('chat_message', (msg) => {
    appendMessageToChat(msg);
  });

  // Screen share actions
  socket.on('screen_share_change', (data) => {
    const { senderId, isSharing, role, screenTrackId } = data;
    const pc = peers[senderId];
    if (!pc) return;
    
    if (isSharing) {
      pc.screenTrackId = screenTrackId;
      addScreenShareBadge(`${role.toUpperCase()} is presenting`);
      routeVideoTracks(senderId);
    } else {
      delete pc.screenTrackId;
      const screenCard = document.getElementById(`remote-card-screen-${senderId}`);
      if (screenCard) screenCard.remove();
      routeVideoTracks(senderId);
      removeScreenShareBadge();
    }
  });

  // Call Recording actions
  socket.on('recording_status', (data) => {
    const recordBanner = document.getElementById('recording-banner');
    const recordBannerText = document.getElementById('recording-banner-text');
    const recordBtn = document.getElementById('btn-record');
    
    if (data.status === 'in_progress') {
      currentRecordingId = data.recordingId;
      recordBanner.classList.add('active');
      if (recordBtn) recordBtn.classList.add('active');
      
      if (userRole === 'agent') {
        recordBannerText.innerText = 'RECORDING (00:00)';
        startLocalRecorder();
      } else {
        recordBannerText.innerText = 'RECORDING IN PROGRESS';
      }
    } else if (data.status === 'stopping') {
      recordBanner.classList.remove('active');
      if (recordBtn) recordBtn.classList.remove('active');
      
      if (userRole === 'agent') {
        stopLocalRecorder();
      }
    } else if (data.status === 'processing') {
      showRecordingStatusCard('processing');
    } else if (data.status === 'ready') {
      showRecordingStatusCard('ready', data.filePath);
    }
  });

  // Drop detections
  socket.on('peer_disconnected_temp', (data) => {
    const { socketId, userId: peerUserId, role: peerRole } = data;
    console.warn(`Peer (${peerRole}) connection dropped temporarily: ${socketId}`);
    
    const placeholder = document.getElementById(`remote-video-placeholder-${socketId}`) || document.getElementById('remote-video-placeholder');
    const statusText = document.getElementById(`remote-status-text-${socketId}`) || document.getElementById('remote-status-text');
    if (statusText) statusText.innerText = `${peerRole.toUpperCase()} disconnected. Waiting to reconnect...`;
    if (placeholder) placeholder.style.display = 'flex';
  });

  socket.on('peer_left', (data) => {
    const { socketId, userId: peerUserId, role: peerRole } = data;
    console.warn(`Peer left permanently: ${socketId}`);
    
    if (peers[socketId]) {
      peers[socketId].close();
      delete peers[socketId];
    }
    
    const card = document.getElementById(`remote-card-${socketId}`);
    if (card) card.remove();
    const screenCard = document.getElementById(`remote-card-screen-${socketId}`);
    if (screenCard) screenCard.remove();
    
    updateGridLayoutClass();
    
    // Restore default card view if no peers left
    if (Object.keys(peers).length === 0) {
      const defaultCard = document.getElementById('remote-video-card');
      if (defaultCard) {
        defaultCard.style.display = 'flex';
        const defaultPlaceholder = document.getElementById('remote-video-placeholder');
        if (defaultPlaceholder) defaultPlaceholder.style.display = 'flex';
        const defaultStatusText = document.getElementById('remote-status-text');
        if (defaultStatusText) defaultStatusText.innerText = 'Waiting for customer to join...';
      }
    }
  });

  socket.on('session_ended', (data) => {
    alert(`The call session has been ended cleanly by the ${data.endedBy}.`);
    cleanupCallRoom();
  });

  socket.on('customer_exited', () => {
    console.log("Customer successfully left the call room");
    cleanupCallRoom();
  });
}

// ----------------------------------------------------
// WebRTC Signaling Engine (Mesh Architecture)
// ----------------------------------------------------
async function initializePeerConnection(socketId, role = 'unknown', uId = 'peer') {
  // Clear existing connection if duplicates exist
  if (peers[socketId]) {
    peers[socketId].close();
  }

  const config = getPeerConnectionConfig();
  const pc = new RTCPeerConnection(config);
  pc.socketId = socketId;
  pc.role = role;
  pc.userId = uId;
  
  peers[socketId] = pc;

  // Add local media tracks (webcam first, screenshare if active)
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  if (isScreenSharing && screenStream) {
    const screenTrack = screenStream.getVideoTracks()[0];
    if (screenTrack) {
      pc.screenSender = pc.addTrack(screenTrack, screenStream);
    }
  }

  // Handle Remote Track arrival
  pc.ontrack = (event) => {
    const track = event.track;
    remoteStream = event.streams[0]; // Assign to global remoteStream
    console.log('Received remote track from peer:', socketId, track.kind, track.id);
    
    if (track.kind === 'audio') {
      let remoteVideo = document.getElementById(`video-${socketId}`);
      if (remoteVideo) {
        const stream = remoteVideo.srcObject || new MediaStream();
        if (!stream.getAudioTracks().includes(track)) {
          stream.addTrack(track);
          remoteVideo.srcObject = stream;
        }
      }
      return;
    }
    
    if (track.kind === 'video') {
      if (!pc.receivedVideoTracks) pc.receivedVideoTracks = {};
      pc.receivedVideoTracks[track.id] = { track, stream: remoteStream };
      
      routeVideoTracks(socketId);
    }
  };

  // Handle ICE Candidates routing
  pc.onicecandidate = (event) => {
    if (event.candidate && socket && socket.connected) {
      socket.emit('signal', {
        targetId: socketId,
        signalData: { type: 'candidate', candidate: event.candidate }
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE Connection state for peer ${socketId}:`, pc.iceConnectionState);
    const placeholder = document.getElementById(`remote-video-placeholder-${socketId}`);
    const statusText = document.getElementById(`remote-status-text-${socketId}`);
    
    if (pc.iceConnectionState === 'disconnected') {
      if (statusText) statusText.innerText = 'Connection lost. Reconnecting...';
      if (placeholder) placeholder.style.display = 'flex';
    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      if (placeholder) placeholder.style.display = 'none';
    }
  };

  // Start real-time WebRTC stats latency calculation loop
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(updateWebRTCStats, 2000);
}

// Read RTT stats dynamically from RTCPeerConnection to show real latency!
async function updateWebRTCStats() {
  if (Object.keys(peers).length === 0) return;
  try {
    Object.keys(peers).forEach(async (socketId) => {
      const pc = peers[socketId];
      if (!pc) return;
      const stats = await pc.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && (report.nominated || report.state === 'succeeded' || report.selected)) {
          const rtt = report.currentRoundTripTime;
          if (rtt !== undefined) {
            const rttMs = Math.round(rtt * 1000);
            const telemetryBox = document.getElementById(`remote-video-telemetry-${socketId}`);
            if (telemetryBox) {
              telemetryBox.innerHTML = `
                <span><i class="fa-solid fa-link" style="color: var(--success);"></i> Live Relay: TURN</span>
                <span><i class="fa-solid fa-clock" style="color: var(--success);"></i> Latency: ${rttMs}ms</span>
              `;
            }
          }
        }
      });
    });
  } catch (err) {
    console.error("Error reading WebRTC stats:", err);
  }
}

function routeVideoTracks(socketId) {
  const pc = peers[socketId];
  if (!pc || !pc.receivedVideoTracks) return;
  
  const screenTrackId = pc.screenTrackId;
  const grid = document.querySelector('.video-grid');
  if (!grid) return;
  
  Object.keys(pc.receivedVideoTracks).forEach(trackId => {
    const { track, stream } = pc.receivedVideoTracks[trackId];
    
    if (screenTrackId && trackId === screenTrackId) {
      // Screen presentation track
      let screenVideo = document.getElementById(`screen-video-${socketId}`);
      let screenCard = document.getElementById(`remote-card-screen-${socketId}`);
      
      if (!screenCard) {
        // Create presentation container
        screenCard = document.createElement('div');
        screenCard.id = `remote-card-screen-${socketId}`;
        screenCard.className = 'video-container presentation-active';
        screenCard.innerHTML = `
          <video id="screen-video-${socketId}" autoplay playsinline></video>
          <div class="video-label" id="screen-video-label-${socketId}">
            <i class="fa-solid fa-desktop"></i> <span class="label-text">${pc.role.toUpperCase()}'s Presentation</span>
          </div>
          <div class="video-telemetry" id="screen-video-telemetry-${socketId}">
            <span><i class="fa-solid fa-link" style="color: var(--success);"></i> Live Relay: TURN</span>
          </div>
        `;
        grid.insertBefore(screenCard, grid.firstChild);
        
        // Hide default static card if it has no stream
        const defaultCard = document.getElementById('remote-video-card');
        if (defaultCard && !defaultCard.querySelector('video').srcObject) {
          defaultCard.style.display = 'none';
        }
      }
      
      screenVideo = document.getElementById(`screen-video-${socketId}`);
      if (screenVideo && screenVideo.srcObject !== stream) {
        const screenStream = new MediaStream([track]);
        screenVideo.srcObject = screenStream;
        screenVideo.play().catch(e => console.warn(e));
      }
    } else {
      // Normal webcam track
      let remoteVideo = document.getElementById(`video-${socketId}`);
      let remoteCard = document.getElementById(`remote-card-${socketId}`);
      
      if (!remoteCard) {
        // Hide default static card
        const defaultCard = document.getElementById('remote-video-card');
        if (defaultCard && !defaultCard.querySelector('video').srcObject) {
          defaultCard.style.display = 'none';
        }

        remoteCard = document.createElement('div');
        remoteCard.id = `remote-card-${socketId}`;
        remoteCard.className = 'video-container';
        remoteCard.innerHTML = `
          <video id="video-${socketId}" autoplay playsinline></video>
          <div class="video-label" id="remote-video-label-${socketId}">
            <i class="fa-solid fa-user"></i> <span class="label-text">${pc.role.toUpperCase()} (Live)</span>
          </div>
          <div class="video-telemetry" id="remote-video-telemetry-${socketId}">
            <span><i class="fa-solid fa-link" style="color: var(--success);"></i> Live Relay: TURN</span>
            <span><i class="fa-solid fa-clock"></i> Connecting...</span>
          </div>
          <div id="remote-video-placeholder-${socketId}" class="video-placeholder" style="display: none;">
            <div class="video-placeholder-icon"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <span id="remote-status-text-${socketId}">Connecting...</span>
          </div>
        `;
        grid.appendChild(remoteCard);
        
        // Ensure local preview floats on top (if not in presentation mode)
        const localCard = document.getElementById('local-video-card');
        if (localCard && !grid.classList.contains('has-presentation')) {
          localCard.parentNode.appendChild(localCard);
        }
      }
      
      remoteVideo = document.getElementById(`video-${socketId}`);
      if (remoteVideo && remoteVideo.srcObject !== stream) {
        const webcamStream = new MediaStream([track]);
        const audioTrack = pc.getReceivers().find(r => r.track && r.track.kind === 'audio')?.track;
        if (audioTrack) {
          webcamStream.addTrack(audioTrack);
        }
        remoteVideo.srcObject = webcamStream;
        remoteVideo.play().catch(e => console.warn(e));
      }
    }
  });

  updateGridLayoutClass();
}

function updateGridLayoutClass() {
  const grid = document.querySelector('.video-grid');
  if (!grid) return;
  
  const hasPresentation = !!document.getElementById('local-screen-card') || 
                           !!document.querySelector('[id^="remote-card-screen-"]');
  
  if (hasPresentation) {
    grid.classList.add('has-presentation');
  } else {
    grid.classList.remove('has-presentation');
  }
}

// ----------------------------------------------------
// Media Controls (Mute / Stop Camera)
// ----------------------------------------------------
function toggleAudio() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  isAudioMuted = !isAudioMuted;
  audioTrack.enabled = !isAudioMuted;

  const btn = document.getElementById('btn-audio');
  if (isAudioMuted) {
    btn.classList.remove('active');
    btn.classList.add('muted');
    btn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
  } else {
    btn.classList.remove('muted');
    btn.classList.add('active');
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  }
}

function toggleVideo() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  isVideoStopped = !isVideoStopped;
  videoTrack.enabled = !isVideoStopped;

  const btn = document.getElementById('btn-video');
  const placeholder = document.getElementById('local-video-placeholder');
  const localCard = document.getElementById('local-video-card');
  
  if (isVideoStopped) {
    btn.classList.remove('active');
    btn.classList.add('muted');
    btn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
    if (placeholder) placeholder.style.display = 'flex';
    if (localCard) localCard.classList.remove('active-call');
  } else {
    btn.classList.remove('muted');
    btn.classList.add('active');
    btn.innerHTML = '<i class="fa-solid fa-video"></i>';
    if (placeholder) placeholder.style.display = 'none';
    if (localCard) localCard.classList.add('active-call');
  }
}

// ----------------------------------------------------
// Client Preview Media Controls (Customer Join Page)
// ----------------------------------------------------
let isPreviewAudioMuted = false;
let isPreviewVideoStopped = false;

function togglePreviewAudio() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  isPreviewAudioMuted = !isPreviewAudioMuted;
  track.enabled = !isPreviewAudioMuted;

  const btn = document.getElementById('btn-preview-audio');
  btn.innerHTML = isPreviewAudioMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
  btn.style.background = isPreviewAudioMuted ? 'var(--error)' : 'rgba(255,255,255,0.08)';
}

function togglePreviewVideo() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  isPreviewVideoStopped = !isPreviewVideoStopped;
  track.enabled = !isPreviewVideoStopped;

  const btn = document.getElementById('btn-preview-video');
  const placeholder = document.getElementById('preview-placeholder');
  
  btn.innerHTML = isPreviewVideoStopped ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
  btn.style.background = isPreviewVideoStopped ? 'var(--error)' : 'rgba(255,255,255,0.08)';
  if (placeholder) placeholder.style.display = isPreviewVideoStopped ? 'flex' : 'none';
}

// ----------------------------------------------------
// Chat & File Upload Functions
// ----------------------------------------------------
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  socket.emit('send_chat_message', {
    sessionId,
    role: userRole,
    userId: userId,
    content: text
  });

  input.value = '';
}

function appendMessageToChat(msg) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `message message-${msg.sender_role}`;
  
  const isMe = msg.sender_id ? (msg.sender_id === userId) : (msg.sender_role === userRole);
  const displayName = msg.sender_id ? `${msg.sender_role.toUpperCase()} (${msg.sender_id})` : msg.sender_role.toUpperCase();
  const senderText = isMe ? 'You' : displayName;
  const time = parseUTCDate(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (msg.message_type === 'file') {
    div.innerHTML = `
      <span class="message-sender">${senderText}</span>
      <div class="file-attachment">
        <i class="fa-solid fa-file" style="font-size: 20px; color: var(--accent-color);"></i>
        <div class="file-info">
          <div class="file-name" title="${msg.content}">${msg.content}</div>
          <a href="${msg.file_path}" target="_blank" class="file-download-link"><i class="fa-solid fa-arrow-down-to-bracket"></i> Download</a>
        </div>
      </div>
      <span class="message-time">${time}</span>
    `;
  } else {
    div.innerHTML = `
      <span class="message-sender">${senderText}</span>
      <div>${msg.content}</div>
      <span class="message-time">${time}</span>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function handleFileShare(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', sessionId);
  formData.append('role', userRole);
  formData.append('userId', userId);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');
    
    // Clear input
    document.getElementById('file-input').value = '';
  } catch (err) {
    console.error('Error uploading shared file:', err);
    alert('File upload failed. Please try again.');
  }
}

// ----------------------------------------------------
// Call Recording - CANVAS LOOP & AUDIO MIXING (Agent Only)
// ----------------------------------------------------
function toggleRecording() {
  const btn = document.getElementById('btn-record');
  if (btn.classList.contains('active')) {
    // Stop recording
    socket.emit('stop_recording', { sessionId, recordingId: currentRecordingId });
  } else {
    // Start recording
    // Initialize or resume the global AudioContext on user gesture to bypass Chrome's autoplay rules
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          console.log("AudioContext successfully resumed on user click gesture.");
        }).catch(err => {
          console.warn("Failed to resume AudioContext on gesture:", err);
        });
      }
    } catch (e) {
      console.warn("Failed to create AudioContext on user gesture:", e);
    }
    socket.emit('start_recording', { sessionId });
  }
}

async function startLocalRecorder() {
  recordedChunks = [];
  recordingSeconds = 0;
  
  // Set up Audio Mixing using Web Audio API
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log("AudioMixer: AudioContext successfully resumed.");
      } catch (resumeErr) {
        console.warn("AudioMixer: Failed to resume AudioContext:", resumeErr);
      }
    }

    audioDestNode = audioContext.createMediaStreamAudioDestination();
    const connectedTrackIds = new Set();

    // Connect Local Mic Track
    if (localStream && localStream.getAudioTracks().length > 0) {
      const localAudioSource = audioContext.createMediaStreamSource(localStream);
      localAudioSource.connect(audioDestNode);
      localStream.getAudioTracks().forEach(t => connectedTrackIds.add(t.id));
      console.log("AudioMixer: Connected local microphone track to mixer.");
    }
    
    // Connect Remote Peer Audio Track from Peer Connection Receivers
    Object.keys(peers).forEach(socketId => {
      const pc = peers[socketId];
      const audioReceivers = pc.getReceivers().filter(r => r.track && r.track.kind === 'audio');
      
      audioReceivers.forEach(receiver => {
        const remoteAudioTrack = receiver.track;
        if (remoteAudioTrack && !connectedTrackIds.has(remoteAudioTrack.id)) {
          // Check if remoteVideo srcObject is already playing and contains this track (primed by browser)
          const remoteVideo = document.getElementById(`video-${socketId}`);
          if (remoteVideo && remoteVideo.srcObject && remoteVideo.srcObject.getAudioTracks().includes(remoteAudioTrack)) {
            const remoteAudioSource = audioContext.createMediaStreamSource(remoteVideo.srcObject);
            remoteAudioSource.connect(audioDestNode);
            connectedTrackIds.add(remoteAudioTrack.id);
            console.log(`AudioMixer: Connected remote video srcObject for socket ${socketId} (track ${remoteAudioTrack.id}) to mixer.`);
          } else {
            // Otherwise, we must "prime" the remote track with a hidden HTMLAudioElement
            const singleTrackStream = new MediaStream([remoteAudioTrack]);
            const primingAudio = new Audio();
            primingAudio.srcObject = singleTrackStream;
            primingAudio.muted = true;
            primingAudio.play().catch(e => console.warn("AudioMixer: Priming audio play failed:", e));
            
            if (!window.primedAudioElements) window.primedAudioElements = [];
            window.primedAudioElements.push(primingAudio);

            const remoteAudioSource = audioContext.createMediaStreamSource(singleTrackStream);
            remoteAudioSource.connect(audioDestNode);
            connectedTrackIds.add(remoteAudioTrack.id);
            console.log(`AudioMixer: Primed and connected remote audio track ${remoteAudioTrack.id} for socket ${socketId} to mixer.`);
          }
        }
      });
    });

    // Fallback: Connect global remoteStream tracks if not already connected
    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      remoteStream.getAudioTracks().forEach(track => {
        if (!connectedTrackIds.has(track.id)) {
          try {
            const singleTrackStream = new MediaStream([track]);
            const primingAudio = new Audio();
            primingAudio.srcObject = singleTrackStream;
            primingAudio.muted = true;
            primingAudio.play().catch(e => console.warn("AudioMixer: Priming fallback audio play failed:", e));
            
            if (!window.primedAudioElements) window.primedAudioElements = [];
            window.primedAudioElements.push(primingAudio);

            const remoteAudioSource = audioContext.createMediaStreamSource(singleTrackStream);
            remoteAudioSource.connect(audioDestNode);
            connectedTrackIds.add(track.id);
            console.log(`AudioMixer: Connected and primed global remoteStream fallback track ${track.id} to mixer.`);
          } catch (e) {
            console.warn("AudioMixer: Failed to connect fallback track:", e);
          }
        }
      });
    }
  } catch (err) {
    console.error('Error initializing Web Audio API mixer:', err);
  }

  // Set up Video Canvas Mixing
  const canvas = document.getElementById('recording-canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = 1280;
  canvas.height = 720;

  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');

  function drawCanvasLoop() {
    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw header text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Outfit';
    ctx.fillText('ATOMQUEST VIDEO CALL RECORDING', 40, 50);

    // Format timer
    const minStr = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
    const secStr = (recordingSeconds % 60).toString().padStart(2, '0');
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`REC ${minStr}:${secStr}`, canvas.width - 160, 50);

    // Draw side-by-side videos:
    // Left: Agent video (local)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 100, 580, 435);
    if (!isVideoStopped && localStream && localStream.getVideoTracks().length > 0 && localStream.getVideoTracks()[0].enabled) {
      ctx.drawImage(localVideo, 40, 100, 580, 435);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(40, 100, 580, 435);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Camera Off', 330, 320);
      ctx.textAlign = 'left'; // reset
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(50, 110, 100, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText('Support Agent', 60, 130);

    // Right: Customer video (remote)
    ctx.strokeRect(660, 100, 580, 435);
    
    // Find active customer video element dynamically
    let activeCustomerVideo = remoteVideo;
    const peerSocketId = Object.keys(peers)[0];
    if (peerSocketId) {
      const dynamicScreenVideo = document.getElementById(`screen-video-${peerSocketId}`);
      if (dynamicScreenVideo && dynamicScreenVideo.srcObject) {
        activeCustomerVideo = dynamicScreenVideo;
      } else {
        const dynamicVideo = document.getElementById(`video-${peerSocketId}`);
        if (dynamicVideo && dynamicVideo.srcObject) {
          activeCustomerVideo = dynamicVideo;
        }
      }
    }

    if (remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled) {
      ctx.drawImage(activeCustomerVideo, 660, 100, 580, 435);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(660, 100, 580, 435);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Customer Video Offline', 950, 320);
      ctx.textAlign = 'left'; // reset
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(670, 110, 80, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText('Customer', 680, 130);

    // Draw footer overlay
    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.fillText(`Session ID: ${sessionId}`, 40, 680);
    ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, canvas.width - 350, 680);

    canvasAnimationId = requestAnimationFrame(drawCanvasLoop);
  }

  // Start Canvas animation
  drawCanvasLoop();

  // Create combined stream
  const canvasStream = canvas.captureStream(30);
  const recordingTracks = [];
  
  // Add video track
  if (canvasStream && canvasStream.getVideoTracks().length > 0) {
    recordingTracks.push(canvasStream.getVideoTracks()[0]);
  }
  
  // Add audio track
  if (audioDestNode && audioDestNode.stream && audioDestNode.stream.getAudioTracks().length > 0) {
    recordingTracks.push(audioDestNode.stream.getAudioTracks()[0]);
    console.log("AudioMixer: Successfully added audio track to mixed recording stream.");
  } else {
    console.warn("AudioMixer: No audio track could be added to the mixed recording stream.");
  }
  
  // Construct the MediaStream with all tracks in one go to ensure compatibility
  const mixedStream = new MediaStream(recordingTracks);
  console.log("AudioMixer: Combined recording stream tracks:", mixedStream.getTracks());

  // Setup MediaRecorder
  try {
    // Check if browser supports the mimeType before constructing
    const mimeType = 'video/webm;codecs=vp8,opus';
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mimeType)) {
      mediaRecorder = new MediaRecorder(mixedStream, { mimeType });
    } else {
      mediaRecorder = new MediaRecorder(mixedStream);
    }
  } catch (err) {
    console.error('Failed to create MediaRecorder with standard options, falling back...', err);
    try {
      mediaRecorder = new MediaRecorder(mixedStream);
    } catch (e) {
      console.error('Failed to create MediaRecorder fallback:', e);
    }
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    console.log('MediaRecorder stopped. Compiling blob...');
    const recordingBlob = new Blob(recordedChunks, { type: 'video/webm' });
    
    // Upload recording file to backend
    const formData = new FormData();
    formData.append('recording', recordingBlob);
    formData.append('sessionId', sessionId);
    formData.append('recordingId', currentRecordingId);

    try {
      const response = await fetch('/api/recordings/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Recording upload failed');
      console.log('Recording uploaded successfully. Status: Processing.');
    } catch (err) {
      console.error('Error uploading call recording:', err);
    }
  };

  // Start recording
  mediaRecorder.start(1000); // chunk every 1 second

  // Setup UI Timer updates
  recordingTimer = setInterval(() => {
    recordingSeconds++;
    const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
    const secs = (recordingSeconds % 60).toString().padStart(2, '0');
    const bannerText = document.getElementById('recording-banner-text');
    if (bannerText) {
      bannerText.innerText = `RECORDING (${mins}:${secs})`;
    }
  }, 1000);
}

function stopLocalRecorder() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // Stop Canvas loops
  if (canvasAnimationId) {
    cancelAnimationFrame(canvasAnimationId);
    canvasAnimationId = null;
  }

  // Stop Web Audio Context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    audioDestNode = null;
  }

  // Cleanup primed audio elements to avoid leaks
  if (window.primedAudioElements) {
    window.primedAudioElements.forEach(audio => {
      try {
        audio.pause();
        audio.srcObject = null;
      } catch (e) {}
    });
    window.primedAudioElements = [];
  }

  // Clear timer
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

// Show recording state widget inside Room chat panel
function showRecordingStatusCard(status, downloadUrl = null) {
  const card = document.getElementById('recording-status-card');
  if (!card) return; // Customer doesn't have this card

  card.style.display = 'block';
  const badge = document.getElementById('recording-card-status');
  const downloadBox = document.getElementById('recording-download-box');
  const downloadLink = document.getElementById('recording-download-link');

  badge.className = `status-badge status-${status}`;
  badge.innerText = status;

  if (status === 'ready' && downloadUrl) {
    downloadBox.style.display = 'flex';
    downloadLink.href = downloadUrl;
  } else {
    downloadBox.style.display = 'none';
  }
}

// ----------------------------------------------------
// Cleanup & Hangup Handlers
// ----------------------------------------------------
function endSession() {
  let message = '';
  if (userRole === 'customer') {
    message = 'Are you sure you want to leave this support call?';
  } else {
    message = 'Are you sure you want to end this support session? This will terminate the call for all participants.';
  }
  
  const confirmed = confirm(message);
  if (confirmed) {
    socket.emit('end_session', { sessionId, userId, role: userRole });
  }
}

function handlePeerHangup() {
  cleanupWebRTC();
  
  // Show placeholder video state
  const remoteVideoPlaceholder = document.getElementById('remote-video-placeholder');
  if (remoteVideoPlaceholder) {
    remoteVideoPlaceholder.style.display = 'flex';
    document.getElementById('remote-status-text').innerText = 'Participant has disconnected.';
  }

  const remoteCard = document.getElementById('remote-video-card');
  if (remoteCard) remoteCard.classList.remove('active-call');

  const remoteLabel = document.getElementById('remote-video-label');
  if (remoteLabel) {
    remoteLabel.innerHTML = userRole === 'agent' 
      ? '<i class="fa-solid fa-user"></i> Customer (Offline)' 
      : '<i class="fa-solid fa-user-tie"></i> Agent (Offline)';
  }

  const remoteTelemetry = document.getElementById('remote-video-telemetry');
  if (remoteTelemetry) remoteTelemetry.style.display = 'none';
}

function cleanupWebRTC() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }

  Object.keys(peers).forEach(socketId => {
    if (peers[socketId]) {
      peers[socketId].close();
    }
    delete peers[socketId];
    
    const card = document.getElementById(`remote-card-${socketId}`);
    if (card) card.remove();
    const screenCard = document.getElementById(`remote-card-screen-${socketId}`);
    if (screenCard) screenCard.remove();
  });

  const defaultCard = document.getElementById('remote-video-card');
  if (defaultCard) {
    defaultCard.style.display = 'flex';
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) remoteVideo.srcObject = null;
  }
  
  // Remove local screen card if any
  const localScreenCard = document.getElementById('local-screen-card');
  if (localScreenCard) localScreenCard.remove();
  
  updateGridLayoutClass();
}

function cleanupCallRoom() {
  // Stop screen sharing if active
  if (isScreenSharing) {
    stopScreenShare();
  }

  // Stop local webcam
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  cleanupWebRTC();
  
  if (socket) {
    socket.disconnect();
  }
  document.getElementById('notification-banner').classList.remove('active');

  // Stop recording if active
  if (userRole === 'agent') {
    stopLocalRecorder();
  }

  // Reset page UI
  if (userRole === 'agent') {
    document.getElementById('active-call-room').style.display = 'none';
    document.getElementById('session-creation-card').style.display = 'none';
    showAgentDashboard();
  } else {
    // Customers can close tab or see clean finish page
    document.getElementById('active-call-room').style.display = 'none';
    document.getElementById('join-screen').style.display = 'grid';
    document.getElementById('join-prompt').innerText = 'This support session has ended. Thank you!';
    document.getElementById('join-preview-box').style.display = 'none';
  }
}

function showJoinError(message) {
  const prompt = document.getElementById('join-prompt');
  const errorDiv = document.getElementById('join-error');
  
  prompt.style.display = 'none';
  errorDiv.innerText = message;
  errorDiv.style.display = 'block';
}

// ----------------------------------------------------
// Google Meet Custom Interaction Controls
// ----------------------------------------------------

// Draggable local video preview box
function makeElementDraggable(elm, container) {
  if (!elm || !container) return;
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  elm.onmousedown = dragMouseDown;
  elm.ontouchstart = dragTouchStart;

  function dragMouseDown(e) {
    e = e || window.event;
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('i')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function dragTouchStart(e) {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('i')) return;
    const touch = e.touches[0];
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    document.ontouchend = closeDragElement;
    document.ontouchmove = elementTouchDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    updatePosition(elm.offsetLeft - pos1, elm.offsetTop - pos2);
  }

  function elementTouchDrag(e) {
    const touch = e.touches[0];
    pos1 = pos3 - touch.clientX;
    pos2 = pos4 - touch.clientY;
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    
    updatePosition(elm.offsetLeft - pos1, elm.offsetTop - pos2);
  }

  function updatePosition(newLeft, newTop) {
    const containerRect = container.getBoundingClientRect();
    const elmRect = elm.getBoundingClientRect();
    
    let maxLeft = containerRect.width - elmRect.width;
    let maxTop = containerRect.height - elmRect.height;
    
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    elm.style.left = newLeft + "px";
    elm.style.top = newTop + "px";
    elm.style.right = "auto";
    elm.style.bottom = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    document.ontouchend = null;
    document.ontouchmove = null;
  }
}

// Collapsible Chat Toggle
function toggleChat() {
  isChatCollapsed = !isChatCollapsed;
  const room = document.getElementById('active-call-room');
  const btn = document.getElementById('btn-chat');
  
  if (room) {
    if (isChatCollapsed) {
      room.classList.add('chat-collapsed');
      if (btn) btn.classList.remove('active');
    } else {
      room.classList.remove('chat-collapsed');
      if (btn) btn.classList.add('active');
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
}

// Screen Sharing Functionality
async function toggleScreenShare() {
  if (isScreenSharing) {
    await stopScreenShare();
  } else {
    await startScreenShare();
  }
}

async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always"
      },
      audio: false
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    
    // Replace track on all active peer connections
    if (Object.keys(peers).length > 0) {
      for (const socketId of Object.keys(peers)) {
        const pc = peers[socketId];
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          originalVideoTrack = videoSender.track; // save original
          await videoSender.replaceTrack(screenTrack);
        }
      }
      console.log("Replaced local video track with screen track on all connections");
    }

    isScreenSharing = true;

    const btn = document.getElementById('btn-screenshare');
    if (btn) {
      btn.classList.add('active');
      btn.title = "Switch back to Video";
    }

    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = screenStream;
      localVideo.play().catch(e => console.error(e));
    }

    const localCard = document.getElementById('local-video-card');
    if (localCard) {
      localCard.classList.add('presentation-active');
      
      // Add overlay switch to video button
      const existingOverlay = localCard.querySelector('.switch-to-video-overlay');
      if (existingOverlay) existingOverlay.remove();
      
      const overlay = document.createElement('div');
      overlay.className = 'switch-to-video-overlay';
      overlay.innerHTML = `
        <div class="switch-to-video-text">Screensharing Active</div>
        <button class="switch-to-video-btn" onclick="stopScreenShare()">
          <i class="fa-solid fa-video"></i> Switch back to Video
        </button>
      `;
      localCard.appendChild(overlay);
    }

    const grid = document.querySelector('.video-grid');
    if (grid) grid.classList.add('local-sharing-active');

    addScreenShareBadge('You are presenting');

    screenTrack.onended = async () => {
      console.log("Screen share stream track stopped natively");
      await stopScreenShare();
    };

    if (socket && socket.connected) {
      socket.emit('screen_share_change', { sessionId, isSharing: true, role: userRole });
    }
  } catch (err) {
    console.error("Failed to share screen:", err);
    alert("Could not start screen sharing: " + err.message);
  }
}

async function stopScreenShare() {
  if (!isScreenSharing) return;

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // Restore camera track on all active connections
  if (Object.keys(peers).length > 0 && originalVideoTrack) {
    for (const socketId of Object.keys(peers)) {
      const pc = peers[socketId];
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(originalVideoTrack);
      }
    }
    console.log("Restored camera feed on all connections");
  }

  const localCard = document.getElementById('local-video-card');
  if (localCard) {
    localCard.classList.remove('presentation-active');
    const overlay = localCard.querySelector('.switch-to-video-overlay');
    if (overlay) overlay.remove();
  }

  originalVideoTrack = null;
  isScreenSharing = false;

  const btn = document.getElementById('btn-screenshare');
  if (btn) {
    btn.classList.remove('active');
    btn.title = "Present Screen";
  }

  const localVideo = document.getElementById('local-video');
  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(e => console.error(e));
  }

  const grid = document.querySelector('.video-grid');
  if (grid) grid.classList.remove('local-sharing-active');

  removeScreenShareBadge();

  if (socket && socket.connected) {
    socket.emit('screen_share_change', { sessionId, isSharing: false, role: userRole });
  }
}

function addScreenShareBadge(text) {
  removeScreenShareBadge();
  const grid = document.querySelector('.video-grid');
  if (grid) {
    const badge = document.createElement('div');
    badge.id = 'screen-share-status-badge';
    badge.className = 'screen-share-badge';
    if (text === 'You are presenting') {
      badge.innerHTML = `<i class="fa-solid fa-desktop"></i> <span style="margin-right: 10px;">${text}</span> <button onclick="stopScreenShare()" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; margin: 0; line-height: 1; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #fff;">Switch back to Video</button>`;
    } else {
      badge.innerHTML = `<i class="fa-solid fa-desktop"></i> <span>${text}</span>`;
    }
    grid.appendChild(badge);
  }
}

function removeScreenShareBadge() {
  const badge = document.getElementById('screen-share-status-badge');
  if (badge) badge.remove();
}

// ----------------------------------------------------
// Download / Delete Call Data Controls
// ----------------------------------------------------

async function downloadSessionData(sessId) {
  if (!sessId) {
    alert("Please select a session from history first.");
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
    alert("Please select a session from history first.");
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
    if (selectedInspectId === sessId) {
      selectedInspectId = null;
      document.getElementById('session-inspector').style.display = 'none';
      document.getElementById('inspector-placeholder').style.display = 'flex';
    }

    // Refresh history
    await fetchSessionHistory();
  } catch (err) {
    console.error("Error deleting session data:", err);
    alert("Deletion failed: " + err.message);
  }
}
