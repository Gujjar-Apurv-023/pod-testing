# AI Studio Cloud Preview System (Kubernetes Optimized)

A high-performance, glitch-free preview environment for AI-generated code. This system uses Kubernetes to isolate Next.js processes while maintaining ultra-low latency (<2s boot) and consistent asset routing.

## 🚀 Quick Start (Local Development)

### 1. Build the Worker Image
```bash
# Clean existing images first (optional)
docker build -t apurv023/preview-worker:v18 ./worker
```

### 2. Load into Kind Cluster
```bash
kind load docker-image apurv023/preview-worker:v18 --name preview-cluster
```

### 3. Deploy to Kubernetes
```bash
kubectl apply -f worker/k8s/worker-deployment.yaml
kubectl apply -f worker/k8s/worker-service.yaml
kubectl rollout restart deployment worker
```

### 4. Start the Tunnel
To access the system on `localhost:30001`, keep this running in a separate terminal:
```bash
kubectl port-forward service/worker-service 30001:80
```

---

## 🏗️ Internal Architecture & Flow

The system is split into three main components that work together to provide a seamless "WebContainer-like" experience:

### 1. The Orchestrator (Express)
The Orchestrator is the "brain" running on port `3001` inside the pod. 
- **Worker Management**: It maintains a `WorkerPool` (Singleton) that spawns and kills workers.
- **Isolation**: Each user session gets a dedicated `worker.js` process on a unique internal port.
- **Smart Routing**:
    - **Initial Load**: Iframe points to `/preview-proxy/:workerId/`.
    - **Asset Routing**: When the browser requests `/static/chunks/main.js`, the orchestrator checks the `Referer` header to identify which worker owns that iframe and proxies the request accordingly.
    - **API Preservation**: Unlike standard proxies, the orchestrator is configured **not** to strip the `/api` prefix, ensuring Next.js API routes work out-of-the-box.

### 2. The Worker Process
Each worker is a lightweight Node.js process that:
- Creates a temporary workspace.
- Symlinks `node_modules` from a global template to achieve **<1s installation times**.
- Injects the AI-generated code.
- Runs `next dev` on an internal offset port (e.g., `14000`).

### 3. The Frontend (React)
- Uses the `usePreview` hook to communicate with the Orchestrator.
- Communicates with the Backend API (Port `3000`) for code generation.
- Displays the preview via a secure iframe pointing to Port `30001`.

---

## 🛠️ Important Configuration Notes

### Sticky Sessions
The `worker-service.yaml` uses `sessionAffinity: ClientIP`. This is critical for Kubernetes environments with multiple pods. It ensures that once a user is connected to a pod, all their subsequent asset requests (JS/CSS) go to the same pod where their worker is running.

### Port Management
- **External NodePort**: `30001`
- **Internal Service Port**: `80`
- **Pod Orchestrator**: `3001`
- **Worker Processes**: `4000+`
- **Next.js Instances**: `14000+`

---

## 🧹 Maintenance & Troubleshooting

**Clear all local images:**
```bash
docker rmi $(docker images 'apurv023/preview-worker' -a -q) --force
```

**Check Worker Logs:**
```bash
kubectl logs -f deployment/worker
```

**Common Error: "Preview not found or expired"**
This happens if the `Referer` header is stripped by the browser or if the worker process has timed out (TTL is 5 minutes by default). The system will automatically attempt to reboot the worker on the next "Generate" click.

---

## 📊 Resource & Memory Management (v20 "Extreme Strength")

The system is tuned to handle heavy compilation load while preventing Out-Of-Memory (OOM) crashes.

### 📈 Resource Allocation Table

| Component | RAM (Usage) | CPU (Usage) | Disk (Cache) | Max Instances |
| :--- | :--- | :--- | :--- | :--- |
| **Orchestrator** | ~100 MB | ~0.1 Core | N/A | 1 (Primary) |
| **Next.js Worker** | 300MB - 1GB | 0.2 - 0.5 Core | <10 MB (Symlinked) | Up to 8 per Pod |
| **Total Pod Limit** | **4.0 GB** | **2.0 Cores** | **Shared** | **Pool Max: 8** |

### 🛠️ Strategic Optimizations:
1. **Dynamic Garbage Collection**: Each Next.js worker is launched with `--max-old-space-size=1024`, allowing it to handle large projects without crashing.
2. **Zero-Duplicate Modules**: Because `node_modules` are symlinked to a central template, we don't waste RAM or Disk space caching the same dependencies multiple times.
3. **Auto-Pruning**: The `WorkerPool` automatically evicts the oldest worker if the pod reaches the 8-worker limit, ensuring new "Generate" requests always succeed.
4. **Instant Cleanup**: Clicking "Generate" immediately kills your previous worker, freeing up ~500MB of RAM instantly for the new version.
