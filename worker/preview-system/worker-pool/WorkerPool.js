const { spawn } = require('child_process');
const path = require('path');
const Redis = require('ioredis');

class WorkerPool {
  constructor() {
    this.minWorkers = 0;
    this.maxWorkers = parseInt(process.env.POOL_MAX || '8', 10);
    this.portBase = parseInt(process.env.PORT_BASE || '4000', 10);
    this.ttlMs = parseInt(process.env.WORKER_TTL || '300000', 10);
    
    this.workers = new Map();
    this.projectMap = new Map();
    this.availablePorts = [];

    // Pod Info for Global Routing
    this.podIp = process.env.POD_IP || 'localhost';

    // Redis Setup
    if (process.env.REDIS_URL) {
      console.log(`[WorkerPool] Connecting to Redis: ${process.env.REDIS_URL}`);
      this.redis = new Redis(process.env.REDIS_URL);
    }

    for (let i = 0; i < 500; i++) {
      this.availablePorts.push(this.portBase + i);
    }
  }

  async init() {
    console.log(`[WorkerPool] Initialized on Pod IP: ${this.podIp}`);
  }

  getAvailablePort() {
    if (this.availablePorts.length === 0) throw new Error('No available ports');
    return this.availablePorts.shift();
  }

  releasePort(port) {
    if (!this.availablePorts.includes(port)) this.availablePorts.push(port);
  }

  async spawnWorker(projectId) {
    // 1. Check Global Redis for old worker
    if (this.redis && projectId) {
      const oldWorkerId = await this.redis.get(`project:${projectId}`);
      if (oldWorkerId) {
        console.log(`[WorkerPool] Global cleanup: Killing old worker ${oldWorkerId}`);
        // We don't kill it directly if it's on another pod, 
        // but we overwrite it in Redis. The old worker will timeout naturally or be killed if it's local.
        await this.releaseWorker(oldWorkerId);
      }
    }

    const workerId = `w-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const port = this.getAvailablePort();

    const worker = {
      id: workerId,
      projectId,
      port,
      podIp: this.podIp,
      status: 'booting',
      process: null,
      lastActive: Date.now()
    };

    this.workers.set(workerId, worker);
    if (projectId) this.projectMap.set(projectId, workerId);

    // Register in Redis
    if (this.redis) {
      await this.redis.set(`worker:${workerId}`, JSON.stringify({ port, podIp: this.podIp, projectId }), 'PX', this.ttlMs);
      if (projectId) await this.redis.set(`project:${projectId}`, workerId, 'PX', this.ttlMs);
    }

    const workerScript = path.join(__dirname, '../preview-worker/worker.js');
    const child = spawn('node', [workerScript, workerId, port], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
    });

    worker.process = child;

    return new Promise((resolve, reject) => {
      let resolved = false;
      child.stdout.on('data', (data) => {
        const out = data.toString();
        if (out.includes('READY_SIGNAL') && !resolved) {
          resolved = true;
          worker.status = 'busy';
          resolve(worker);
        }
      });
      child.on('exit', async () => {
        this.workers.delete(workerId);
        if (this.redis) {
          await this.redis.del(`worker:${workerId}`);
          if (projectId) await this.redis.del(`project:${projectId}`);
        }
        this.releasePort(port);
      });
      setTimeout(() => { if (!resolved) reject(new Error('Worker boot timeout')); }, 60000);
    });
  }

  async acquireWorker(projectId) {
    return await this.spawnWorker(projectId);
  }

  getWorker(workerId) {
    return this.workers.get(workerId);
  }

  async releaseWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (worker && worker.process) {
      worker.process.kill('SIGKILL');
    }
    this.workers.delete(workerId);
    if (this.redis) await this.redis.del(`worker:${workerId}`);
  }

  // GLOBAL GET: Checks local then Redis
  async getWorkerMetadata(workerId) {
    // 1. Check local memory
    const local = this.workers.get(workerId);
    if (local) return { id: workerId, port: local.port, podIp: local.podIp, isLocal: true };

    // 2. Check Redis
    if (this.redis) {
      const data = await this.redis.get(`worker:${workerId}`);
      if (data) {
        const meta = JSON.parse(data);
        return { id: workerId, ...meta, isLocal: meta.podIp === this.podIp };
      }
    }
    return null;
  }

  async touchWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastActive = Date.now();
      if (this.redis) await this.redis.pexpire(`worker:${workerId}`, this.ttlMs);
    }
  }

  getStats() {
    return {
      activeWorkers: this.workers.size,
      availablePorts: this.availablePorts.length,
      podIp: this.podIp
    };
  }
}

const pool = new WorkerPool();
module.exports = pool;