# ⚡ Atomberg AtomQuest — Unified Performance & Customer Video Support Suite

Welcome to the **Atomberg AtomQuest Unified Suite**, a production-grade dual-platform developed for the **Atomberg Hackathon**. This repository contains two major enterprise systems structured in a single monorepo:

1. **Goal Setting & Tracking Portal** (`/frontend` and `/backend`): A secure performance tracker for employee cycles, manager appraisals, analytics charts, and quarterly check-ins.
2. **Real-Time Video Support Platform** (`/video calling`): A fully self-hosted, WebRTC-based customer service workspace featuring canvas video mixing, primed remote audio recording, in-call chat with file sharing, connection grace periods, and an administrative telemetry command center.

---

## 📂 Repository Architecture

```directory
├── backend/                  # FastAPI Python Backend (Goal Portal)
├── frontend/                 # Next.js 14 React Frontend (Goal Portal)
├── video calling/            # Node.js, Socket.io, SQLite (Video Calling Engine)
│   ├── public/               # Client-side static assets (HTML/CSS/JS)
│   │   ├── admin.html        # Operations Admin Telemetry Control
│   │   ├── index.html        # Support Agent Dashboard
│   │   ├── join.html         # Customer Lobby & Pre-call Setup
│   │   └── style.css         # Premium Glassmorphic Theme & Hover Dock Tooltips
│   ├── database.js           # SQLite DB layer & chat/recording persistence
│   ├── server.js             # Express Web & STUN/TURN Signaling Gateways
│   └── package.json          # Node dependencies
├── infrastructure/           # Deployment schemas & architectural docs
└── .gitignore                # Root exclusions (databases, uploads, node_modules)
```

---

## 1. 🎯 Goal Setting & Tracking Portal

A robust OKR and goal-tracking solution utilizing **FastAPI**, **Next.js 14 (App Router)**, **Tailwind CSS**, and **Azure SQL / SQLite**.

### 📋 Prerequisites
- Python 3.11+
- Node.js 20+

### ⚙️ Local Setup

#### A. Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment template and seed database:
   ```bash
   copy .env.example .env     # Windows
   # cp .env.example .env     # macOS/Linux
   python seed.py
   ```
5. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   * Access API documentation at: `http://localhost:8000/docs`

#### B. Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
3. Initialize the local environment configuration:
   ```bash
   copy .env.local.example .env.local    # Windows
   # cp .env.local.example .env.local    # macOS/Linux
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
   * Open the Goal Setting UI at: `http://localhost:3000`

---

## 2. 📞 Real-Time Video Support Platform

A complete, self-contained support workspace. It forces ** TURN relay-only media routing**, provides dynamic client-side recording (with mixed camera layers, screenshares, and local/remote audio), and runs on **Node.js** with **Socket.io** and **node-turn** (STUN/TURN).

### 📋 Prerequisites
- Node.js 18+
- NPM 9+
- Secure Context (HTTPS) — *Automatic SSL cert generation is built-in.*

### ⚙️ Local Setup
1. Navigate to the video calling folder:
   ```bash
   cd "video calling"
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Launch the unified Web, Signaling, and STUN/TURN server:
   ```bash
   npm start
   ```
4. Review the startup console output:
   * `STUN/TURN Server listening on UDP/TCP port 3478` (Relays video/audio)
   * `Connected to the SQLite database.` (Initializes `database.sqlite`)
   * `Web server running on https://[LAN_IP]:3000` (HTTPS is required for camera/microphone permissions)

---

## 🔑 Demo Access Credentials

### Goal Setting Portal
* **Employee**: `employee@demo.com` | `Atom@Quest2025`
* **Manager**: `manager@demo.com` | `Atom@Quest2025`
* **Admin**: `admin@demo.com` | `Atom@Quest2025`

### Video Support Platform
* **Agent Dashboard**: `https://localhost:3000/` (Sign in using `agent` / `password`)
* **Operations Command Dashboard**: `https://localhost:3000/admin.html`
* **Prometheus Metrics**: `https://localhost:3000/metrics`

> [!WARNING]
> **SSL Self-Signed Warning**: 
> When loading the Video Call pages for the first time, your browser will show a warning ("Your connection is not private"). Click **Advanced** ➡️ **Proceed to [IP] (unsafe)**. This is normal for self-signed certificates and is required to authorize camera and microphone usage on local secure origins.

---

## 🔬 Core Requirement Verification Checklist

To prove compliance with the hackathon rules, you can verify the following configurations:

1. **Forced Media Routing (TURN Only)**
   * Enter an active support call and open a new tab to `chrome://webrtc-internals/`.
   * Expand the active connections: only candidates of type `relay` routing through the built-in TURN port (`3478`) will be active. Peer-to-peer connection paths are strictly blocked.
2. **Call Recording & Audio Priming**
   * Start call recording via the Agent Dock. Video layouts (Agent webcam, Customer camera/screenshares) are drawn dynamically on a Canvas layout.
   * **Audio Priming**: In Chromium-based browsers, remote WebRTC audio streams remain silent when passed to `AudioContext` nodes unless they are playing in the DOM. The platform uses a customized workaround—dynamically wrapping tracks inside hidden, muted `<audio>` elements, calling `.play()`, and holding global variables (`window.primedAudioElements`) to avoid garbage collection. Verify by playing back the downloaded `.webm` recording; both voices are clearly mixed.
3. **15-Second Grace Reconnection**
   * During a live call, close the Customer tab or simulate a network disconnect.
   * Look at the Agent room and Admin screen: the status will change to disconnected. Re-opening the link within 15 seconds will trigger a silent WebRTC renegotiation, resuming the call seamlessly.
4. **Observability Endpoint**
   * Query the `/metrics` endpoint to view Prometheus measurements (`active_sessions`, `connected_users`, `call_duration_seconds`) updating in real-time.

---

## 🚀 Deployment Instructions

### Goal Setting Portal (Azure Deployment)
1. **Azure SQL Database**: Set up an Azure SQL Server and configure the connection string inside `DATABASE_URL` environment variables on the backend App Service. Run `alembic upgrade head` to apply schemas.
2. **FastAPI Backend (Azure App Service)**: Deploy the `/backend` folder. Set the startup command to: `uvicorn main:app --host 0.0.0.0 --port 8000`.
3. **Next.js Frontend (Azure Static Web Apps)**: Deploy the `/frontend` folder. Point the API environment variable `NEXT_PUBLIC_API_URL` to your App Service endpoint.

### Video Support Platform (VPS/Cloud Deployment)
1. Provision a VPS (Ubuntu/Debian) and install Node.js.
2. Allow incoming ports: `3000` (HTTPS) and `3478` (STUN/TURN UDP/TCP).
3. Bind production SSL certificates inside `server.js` or run behind an Nginx Reverse Proxy configured to handle WebSocket traffic.
4. Run using a process manager like **PM2** to maintain uptime:
   ```bash
   pm2 start server.js --name "atomquest-video-calling"
   ```

---
Built with ❤️ for the **Atomberg AtomQuest Hackathon** 🚀
