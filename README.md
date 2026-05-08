# 🚀 AI Studio Cloud Preview System (v22 "Distributed Strength")

A high-performance, enterprise-grade preview environment for AI-generated code. This system leverages Kubernetes for process isolation, Redis for distributed state management, and an optimized symlinking strategy to achieve **ultra-low latency (<2s boot times)**.

---

## 🛠️ System Architecture

The architecture is designed to handle high-concurrency AI generation tasks across a distributed cluster while maintaining a seamless "local-like" development experience.

### 1. The Distributed Orchestrator (Node.js/Express)
The Orchestrator acts as the primary gateway and controller.
- **Worker Isolation**: Every user project is isolated in its own Node.js process with a unique internal port (4000-4500).
- **Redis-Backed State**: All worker metadata (Pod IP, internal port, project ID) is stored in Redis with a configurable TTL (default 5 minutes). This allows any pod in the cluster to identify and route requests to a worker living on *any* other pod.
- **Robust Proxying**: Features a dual-fallback proxying engine that uses both `Referer` headers and path-matching (`req.originalUrl`) to resolve 404s and asset routing issues commonly found in nested iframe environments.

### 2. Fast-Boot Worker Process
To avoid the overhead of `npm install`, the system uses a **Snapshotted Symlink Strategy**:
- **Global Dependency Cache**: The base image contains a pre-installed `node_modules` snapshot (~65MB compressed).
- **Instant Workspace**: When a new project is generated, the worker creates a temporary directory and symlinks the global `node_modules`. This reduces "installation" time to near-zero.
- **Next.js Integration**: Automatically starts `next dev` on an internal port and proxies traffic through the orchestrator.

## 🚀 Running Locally & Port-Forwarding

To access the Kubernetes orchestrator and preview workers from your local development machine, you must bridge the internal cluster service to your localhost.

### Port-Forwarding Command
Execute this in your terminal to map the **Worker Service** to port `30001`:
```bash
kubectl port-forward service/worker-service 30001:80
```

- **Local Port**: `30001` (Used by the frontend to communicate with the orchestrator)
- **Cluster Port**: `80` (Internal port of the LoadBalancer service)

### Typical Development Workflow
1. **Start Redis**: `kubectl apply -f worker/k8s/redis.yaml`
2. **Deploy Workers**: `kubectl apply -f worker/k8s/worker-deployment.yaml`
3. **Run Port-Forward**: Use the command above.
4. **Launch Frontend**: `npm run dev` (Ensure `VITE_WORKER_URL` is set to `http://localhost:30001`)

---

## 📊 Infrastructure & Resource Management

This system is tuned for heavy compilation workloads (Next.js/React) while maintaining cluster stability.

### 📈 Resource Allocation (Per Pod)

| Metric | Setting | Rationale |
| :--- | :--- | :--- |
| **CPU Request** | `1000m` (1 Core) | Guarantees enough power for the initial Next.js compilation phase. |
| **CPU Limit** | `2000m` (2 Cores) | Allows bursting during heavy HMR (Hot Module Replacement) updates. |
| **Memory Request** | `2Gi` | Ensures enough baseline RAM for 3-4 concurrent workers. |
| **Memory Limit** | `4Gi` | Protects the node from OOM if workers exceed their `max-old-space-size`. |
| **Node Size (Rec.)** | `8Gi+ RAM` | Recommended node size to comfortably host 2-3 worker pods plus system overhead. |

### ⚖️ Auto-Scaling (HPA)
The system uses a highly aggressive **Horizontal Pod Autoscaler (HPA)** configuration:
- **Min Replicas**: 1
- **Max Replicas**: 20
- **Scale-Up Target**: `65% CPU Utilization`
- **Scale-Down Window**: `30 seconds` (Fast pruning to save cloud costs).
- **Scale-Up Window**: `0 seconds` (Instant reaction to traffic spikes).

---

## 🏗️ Internal Routing & Proxy Logic

### Cross-Pod Request Flow:
1. **Request Hits Service**: Traffic arrives at `worker-service` (Port 80).
2. **Pod Selection**: K8s routes to any available worker pod.
3. **Identity Check**: The orchestrator checks if the requested `workerId` is local to its memory.
4. **Global Lookup**: If not local, it queries Redis to find which Pod IP currently hosts that specific worker.
5. **Cross-Pod Proxy**: The orchestrator proxies the request over the internal network to the target pod's orchestrator.
6. **Delivery**: The target orchestrator delivers the request to the local worker process.

---

## 🚀 Deployment & Operations

### 1. Build & Versioning
```bash
# Version 22 contains the latest routing and Redis-sync fixes
docker build -t apurv023/preview-worker:v22 ./worker
```

### 2. Cluster Loading (Kind)
```bash
kind load docker-image apurv023/preview-worker:v22 --name preview-cluster
```

### 3. Applying Infrastructure
```bash
# Order matters: Redis first, then workers
kubectl apply -f worker/k8s/redis.yaml
kubectl apply -f worker/k8s/worker-deployment.yaml
kubectl apply -f worker/k8s/worker-service.yaml
kubectl apply -f worker/k8s/worker-hpa.yaml
```

---

## ✨ Key Features
- ✅ **<2s First Contentful Paint**: Achieved via pre-cached dependencies and symlinking.
- ✅ **Distributed Consistency**: Redis ensures user sessions stay alive even if they jump between pods.

## 💰 Cost Analysis & Scalability

The architecture is designed to minimize "Idle Cost" while providing "Infinite Burst" capability. Below are the estimated costs based on standard Google Cloud (GKE) or AWS (EKS) pricing.

| Scenario | Active Users (Simultaneous) | Daily Users (Est.) | Monthly Cost | Cost Per User |
| :--- | :--- | :--- | :--- | :--- |
| **Baseline (Idle)** | 0 - 12 | 100 - 500 | ~$185 | ~$0.012 |
| **Standard (1k/day)** | ~10 average | 1,000 | ~$220 | ~$0.007 |
| **Hard Max (Full Load)** | 80 | 7,500+ | ~$620 | ~$0.002 |

### 💡 Cost Optimization Strategy
To reduce the **Monthly Cost** by up to **60% ($75 - $100 range)**, it is recommended to use **Spot/Preemptible Instances** for the worker nodes. Since the orchestrator is distributed and state is saved in Redis, a node being reclaimed by the cloud provider will not cause data loss; the HPA will simply spin up a new worker on a different node.

---

## 📈 Future Roadmap
- [ ] **Custom Domains**: Automated SSL/TLS provisioning for each preview worker.
- [ ] **Hibernation**: Automatically "sleep" pods when 0 workers are active to save baseline costs.
- [ ] **WebContainer Fallback**: Client-side rendering for very small projects to reduce cloud CPU usage.
- ✅ **Auto-Healing**: Dead worker processes are automatically detected and replaced on the next request.
- ✅ **Asset Persistence**: Fixed the "Webpack 404" bug by utilizing `originalUrl` tracking.
- ✅ **Zero-Config API**: Next.js `/api` routes work automatically through the transparent proxy layer.
