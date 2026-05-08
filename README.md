# ☁️ AI Studio Cloud Preview System

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-microservices-success.svg)
![Status](https://img.shields.io/badge/status-ready-green.svg)

AI Studio is a high-performance, distributed ecosystem designed to compile and preview AI-generated code instantly. It uses a **pre-warmed worker pool architecture** to deliver near-instant Next.js previews directly in the browser.

---

## 🏗️ System Architecture

The system is split into three core microservices, allowing for independent scaling and failure isolation:

### 1. 🖥️ Frontend (`/frontend`)
- **Role:** User Interface & Editor.
- **Port:** `5173` (Vite default).
- **Function:** Fetches code from the Backend and coordinates with the Worker Orchestrator to boot previews.

### 2. 🧠 API Backend (`/backend`)
- **Role:** AI Code Generation / Mock API.
- **Port:** `3000`.
- **Function:** Serves the actual React/Next.js code structures that need to be previewed.

### 3. ⚙️ Worker Orchestrator (`/worker`)
- **Role:** Heavy Lifting & Compilation.
- **Port:** `3001` (Orchestrator), `4000+` (Dynamic Worker Ports).
- **Function:** Manages a pool of Next.js child processes. It injects code, handles dynamic routing via proxy, and monitors worker health.

---

## 🚀 Quick Start (Local Setup)

To get the entire system running on your local machine:

### 1. Configure Environment
Ensure your `frontend/.env` (or `App.jsx` defaults) point to the correct services:
```env
VITE_API_URL=http://localhost:3000
VITE_WORKER_URL=http://localhost:3001
```

### 2. Launch Services (3 Terminals)

**Terminal 1: Backend**
```bash
cd backend && npm install && node server.js
```

**Terminal 2: Worker Orchestrator**
```bash
cd worker && npm install && npm run dev
```

**Terminal 3: Frontend**
```bash
cd frontend && npm install && npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## ☸️ Kubernetes Deployment

The worker component is pre-configured for Kubernetes deployment.

### Deploying the Worker:
1. **Build & Push Image:**
   ```bash
   docker build -t your-registry/preview-worker:latest ./worker
   docker push your-registry/preview-worker:latest
   ```
2. **Apply Manifests:**
   ```bash
   kubectl apply -f worker/k8s/worker-deployment.yaml
   kubectl apply -f worker/k8s/worker-service.yaml
   kubectl apply -f worker/k8s/worker-hpa.yaml
   ```

### Deployment Features:
- **Auto-Scaling:** HPA is configured to scale workers based on CPU (Target: 65%).
- **Health Checks:** Liveness and Readiness probes verify the orchestrator status on port `3001`.
- **Resource Management:** Requests 1 CPU / 1GB RAM; Limits 4 CPU / 4GB RAM.

---

## 🛠️ Configuration Options

| Variable | Service | Description | Default |
| :--- | :--- | :--- | :--- |
| `WORKER_PORT` | Worker | Port the orchestrator listens on | `3001` |
| `POOL_MAX` | Worker | Max concurrent Next.js workers | `8` |
| `WORKER_TTL` | Worker | Idle timeout for workers (ms) | `300000` (5m) |
| `PORT_BASE` | Worker | Starting port for workers | `4000` |
| `VITE_API_URL` | Frontend | URL of the API Backend | `http://localhost:3000` |
| `VITE_WORKER_URL`| Frontend | URL of the Worker Orchestrator | `http://localhost:3001` |

---

## 🏁 What to do right after? (Next Steps)

Now that the core system is optimized and ready, here is your checklist to move forward:

### 1. ✅ Verify K8s Connectivity
Run the following to ensure your worker is healthy in the cluster:
```bash
kubectl get pods -l app=worker
kubectl logs -f deployment/worker
```

### 2. 🔌 Test Port-Forwarding (Local Testing of K8s)
If you are testing the K8s deployment locally, forward the service:
```bash
kubectl port-forward service/worker-service 3001:80
```
Then try generating a preview from your frontend.

### 3. 📦 Pre-bundle Template Dependencies
The current worker runs `npm install` on every spawn. For production:
- Update the `Dockerfile` to `npm install` inside the `template` directory.
- This will reduce worker boot time from ~15s to **under 2s**.

### 4. 🛡️ Security Hardening
If exposing to the internet:
- Implement the `iptables` rules documented in [README-Deployment.md](./README-Deployment.md).
- Ensure the worker runs as a non-root user (already configured in `worker-deployment.yaml`).

### 5. 🌐 Configure Ingress
Set up an Ingress controller to expose the `worker-service` on a public domain (e.g., `preview.yourdomain.com`).

---

> [!TIP]
> **Need to see stats?**
> You can check the current worker pool status by hitting `GET http://localhost:3001/api/preview/stats`.
