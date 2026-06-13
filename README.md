# 📞 AtomQuest Real-Time Video Support Platform

Welcome to the **AtomQuest Real-Time Video Support Platform**. This enterprise-grade solution provides a self-hosted, secure, and highly performant video-calling workspace for customer support and troubleshooting teams. It has been built from scratch to support high-fidelity media relays, dynamic call recording, in-call chat, and live administrative telemetry.

![System Architecture](architecture.png)

---

## 🌟 Key Features

### 1. Secure Session Management
- **Agent Initialization**: Support agents can create call sessions and generate unique shareable tokens from their dashboard.
- **Dynamic Join Links**: Customers can join the support room from a standard web browser with one click (no app installs, no registrations).
- **Presence Tracking**: Real-time logging of user logins, drops, and reconnects.
- **Graceful Cleanup**: All WebRTC endpoints, socket handlers, and recording streams are torn down cleanly when a session is terminated.

### 2. Audio & Video Calling (Forced TURN Relay)
- **RTC Stream Relays**: Integrates an active **STUN/TURN server** to relay all traffic.
- **Forced Media Routing**: WebRTC configurations are locked to `iceTransportPolicy: 'relay'`, blocking direct P2P connections and routing all calls through the server for strict network security.
- **Media Controls**: Real-time microphone mute and camera toggle controls for both participants.

### 3. In-Call Chat & Document Sharing
- **Real-Time Messaging**: Instant text chat powered by Socket.io.
- **Chat Persistence**: Full history of sent messages is written to the SQLite database and loaded instantly if a participant reconnects.
- **File Sharing**: Securely share documents, screenshots, or spreadsheets directly in the chat panel with inline downloads.

### 4. Advanced Observability & Diagnostics
- **Agent Call Recording**: Agent can record calls. Video feeds (webcam, screen shares) are dynamically mixed on a Canvas, combined with mixed audio, and uploaded to the server for download.
- **HUD Telemetry Dashboard**: Displays connection parameters, average RTT latency, packet loss metrics, and live log updates.
- **Prometheus Observability**: Exposes server state (`active_sessions`, `connected_users`, `call_duration_seconds`) at the `/metrics` endpoint.
- **15-Second Reconnect Grace Window**: Automatically holds sessions and initiates a silent WebRTC renegotiation if a client drops network connectivity temporarily.

---

## 🛠️ Technology Stack

1. **Frontend**: Pure HTML5, Vanilla JavaScript (WebRTC APIs, Web Audio API, Canvas, Socket.io client). Styled with premium dark-themed CSS (glassmorphism, micro-animations, interactive dock tooltips).
2. **Backend**: Node.js, Express.js.
3. **Database**: SQLite3.
4. **WebRTC Signaling**: Socket.io.
5. **Media Relay**: `node-turn` (integrated STUN/TURN server running on port 3478).
6. **Multipart Uploader**: `multer` (for shared files and call recordings).

---

## 🚀 Getting Started

### 📋 Prerequisites
- Node.js (v18+)
- NPM (v9+)

### ⚙️ Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/KolliparaVMKMithra/atomberg-atomquest.git
   cd atomberg-atomquest
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```

### ⚡ Running the App Locally
Start the server:
```bash
npm start
```

Outputs in terminal:
* `STUN/TURN Server listening on UDP/TCP port 3478`
* `Connected to the SQLite database.`
* `Web server running on https://[LAN_IP]:3000` (HTTPS is required locally for camera/mic access)

---

## 🔑 Directory & Routing Reference

| Portal / Page | Endpoint | Description |
| :--- | :--- | :--- |
| **Agent Login & Portal** | `https://localhost:3000/` | Authentication and support session creator dashboard. |
| **Operations Dashboard** | `https://localhost:3000/admin.html` | Live metrics, active sessions list, force termination, and event history. |
| **Observability Telemetry** | `https://localhost:3000/metrics` | Prometheus-compatible metrics stream. |
| **Customer Portal** | `https://localhost:3000/join.html?token=<token>` | Secure join interface (created dynamically by the Agent). |

> [!IMPORTANT]
> **Static Agent Credentials**:
> - **Username**: `agent`
> - **Password**: `password`

---

## 🔬 How to Verify Requirements

1. **Forced Media Routing Verification**:
   * Open Chrome and navigate to `chrome://webrtc-internals/` during an active call.
   * Inspect the ICE Candidate pair: only candidates of type `relay` (routing through port `3478`) will be active. No P2P candidate pairs are utilized.
2. **Chromium Recording Audio Priming**:
   * Chromium engines block remote WebRTC audio recording unless the streams are played. The application uses a custom track priming wrapper (attaching remote tracks to hidden `Audio` elements and running `.play()` on user interactions).
   * Verify by downloading and playing back the `.webm` recording. Both agent and customer audio streams are clearly audible.
3. **Call Reconnection Test**:
   * Close a customer call tab and observe the Agent room: the participant state switches to disconnected but stays holding.
   * Re-open the customer link within 15 seconds. The connection resumes smoothly without terminating the call.

---

## ☁️ Production Cloud Deployment (On Render)

The application includes an environment-aware Web server check:
* **Local Development**: Runs as an HTTPS server (using self-signed certificates) so browser media permissions work over LAN/Localhost.
* **Production (Render)**: Automatically runs as an HTTP server to correctly receive forwarded traffic from Render's SSL-terminating load balancer.

### Setup Web Service on Render:
1. Create a **New Web Service** and connect this repository.
2. Set the configuration options:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
3. Add Environment Variables:
   - `NODE_ENV` ➡️ `production`
   - `PORT` ➡️ `3000`
4. *(Optional: Lock WebRTC to forced media relay in the cloud)*:
   Since Render blocks custom UDP ports (preventing the built-in TURN on 3478 from receiving external traffic), you can hook up an external TURN server (e.g. Metered.ca) by adding:
   - `TURN_URIS` ➡️ `turn:global.metered.ca:80,turn:global.metered.ca:443?transport=tcp`
   - `TURN_USERNAME` ➡️ `your-username`
   - `TURN_PASSWORD` ➡️ `your-password`
   *Note: If no TURN environmental variables are set, the app will automatically fall back to Google's public STUN server and set `iceTransportPolicy: 'all'` to ensure WebRTC connection still succeeds on Render.*
5. Deploy the Web Service. Access the application using the Render subdomain (e.g. `https://your-app.onrender.com`).
