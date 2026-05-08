# ☁️ AI Studio Cloud Preview System (v2.0)

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-microservices-success.svg)
![Status](https://img.shields.io/badge/status-optimized-green.svg)

AI Studio is a high-performance, distributed ecosystem designed to compile and preview AI-generated code instantly. This version is highly optimized for **Kubernetes** with pre-bundled dependencies for near-zero boot times.

---

## 🏗️ System Architecture

The system is split into three core microservices, allowing for independent scaling and failure isolation:

### 1. 🖥️ Frontend (`/frontend`)
- **Role:** User Interface & Editor.
- **Local Port:** `5173`.
- **Worker Config:** Points to `http://localhost:5000` (via Port-Forward).

### 2. 🧠 API Backend (`/backend`)
- **Role:** AI Code Generation / Mock API.
- **Port:** `3000`.

### 3. ⚙️ Worker Orchestrator (`/worker`)
- **Role:** Heavy Lifting & Compilation.
- **Internal Port:** `3001`.
- **K8s Service Port:** `80`.
- **Optimization:** Pre-bundled `node_modules` inside the Docker image (`v6+`) reduces boot time from **1 minute** to **under 2 seconds**.

---

## 🚀 Deployment & Setup (Kubernetes)

Follow these steps to get the system running in your `kind` cluster:

### 1. Load Image to Cluster
Ensure your cluster nodes have the latest optimized image:
```bash
kind load docker-image apurv023/preview-worker:v6 --name preview-cluster
```

### 2. Apply Kubernetes Manifests
Apply all configurations in the `k8s` directory:
```bash
cd worker/k8s
kubectl apply -f .
```

### 3. 🔌 Establish Port Forwarding (CRITICAL)
To allow the local frontend to communicate with the workers inside Kubernetes, you **must** run the following port-forwarding command in a separate terminal:

```bash
kubectl port-forward service/worker-service 5000:80
```
*This maps your local `http://localhost:5000` to the worker service inside the cluster.*

---

## 🛠️ Local Development (Quick Start)

1. **Backend**: `cd backend && npm install && node server.js` (Port 3000)
2. **Frontend**: `cd frontend && npm install && npm run dev` (Port 5173)
3. **Worker**: Ensure the **Port Forwarding** (Step 3 above) is active.

Open **[http://localhost:5173](http://localhost:5173)** to start generating previews.

---

## 📊 Monitoring & Stats

| Command | Description |
| :--- | :--- |
| `kubectl get pods` | Check worker pod status and scaling. |
| `kubectl get hpa` | Monitor CPU usage and auto-scaling events. |
| `curl http://localhost:5000/api/preview/stats` | View active worker pool stats through the proxy. |

---

> [!IMPORTANT]
> **Performance Note**: The Docker `v6` image contains pre-installed dependencies for the Next.js template. If you modify the template dependencies, remember to rebuild the image and update the tag in `worker-deployment.yaml`.
