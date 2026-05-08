const { spawn } = require('child_process');
const path = require('path');

class WorkerPool {
  constructor() {
    // IMPORTANT
    // keep minimum workers 0
    this.minWorkers = 0;

    this.maxWorkers = parseInt(process.env.POOL_MAX || '8', 10);

    this.portBase = parseInt(process.env.PORT_BASE || '4000', 10);

    // 5 minutes idle timeout
    this.ttlMs = parseInt(process.env.WORKER_TTL || '300000', 10);

    this.workers = new Map();

    this.availablePorts = [];

    for (let i = 0; i < 500; i++) {
      this.availablePorts.push(this.portBase + i);
    }
  }

  async init() {
    console.log('[WorkerPool] Initialized');
  }

  getAvailablePort() {
    if (this.availablePorts.length === 0) {
      throw new Error('No available ports');
    }

    return this.availablePorts.shift();
  }

  releasePort(port) {
    if (!this.availablePorts.includes(port)) {
      this.availablePorts.push(port);
    }
  }

  async spawnWorker() {
    if (this.workers.size >= this.maxWorkers) {
      throw new Error('Worker pool at capacity');
    }

    const workerId = `w-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 4)}`;

    const port = this.getAvailablePort();

    console.log(`[${workerId}] Starting worker on port ${port}`);

    const worker = {
      id: workerId,
      port,
      status: 'booting',
      process: null,
      lastActive: Date.now()
    };

    this.workers.set(workerId, worker);

    const workerScript = path.join(
      __dirname,
      '../preview-worker/worker.js'
    );

    const child = spawn('node', [workerScript, workerId, port], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    worker.process = child;

    return new Promise((resolve, reject) => {
      let resolved = false;

      child.stdout.on('data', (data) => {
        const out = data.toString();

        console.log(`[${workerId}] ${out.trim()}`);

        if (
          out.includes('READY_SIGNAL') &&
          !resolved
        ) {
          resolved = true;

          worker.status = 'busy';

          console.log(
            `[${workerId}] Ready on port ${port}`
          );

          resolve(worker);
        }
      });

      child.stderr.on('data', (data) => {
        console.error(
          `[${workerId} stderr]`,
          data.toString()
        );
      });

      child.on('exit', (code) => {
        console.log(
          `[${workerId}] Exited with code ${code}`
        );

        this.workers.delete(workerId);

        this.releasePort(port);
      });

      setTimeout(() => {
        if (!resolved) {
          reject(new Error('Worker boot timeout'));
        }
      }, 60000);
    });
  }

  async acquireWorker() {
    return await this.spawnWorker();
  }

  async releaseWorker(workerId) {
    const worker = this.workers.get(workerId);

    if (!worker) return;

    console.log(`[${workerId}] Releasing worker`);

    try {
      worker.process.kill('SIGKILL');
    } catch (e) {
      console.error(e);
    }

    this.workers.delete(workerId);

    this.releasePort(worker.port);
  }

  getWorker(workerId) {
    return this.workers.get(workerId);
  }

  touchWorker(workerId) {
    const worker = this.workers.get(workerId);

    if (worker) {
      worker.lastActive = Date.now();
    }
  }

  getStats() {
    return {
      total: this.workers.size
    };
  }

  shutdown() {
    console.log(
      '[WorkerPool] Shutting down workers'
    );

    for (const [id, worker] of this.workers) {
      try {
        worker.process.kill('SIGKILL');
      } catch (e) {}
    }
  }
}

const pool = new WorkerPool();

setInterval(() => {
  const now = Date.now();

  for (const [id, worker] of pool.workers) {
    const idleTime = now - worker.lastActive;

    if (idleTime > pool.ttlMs) {
      console.log(
        `[${id}] Idle timeout reached. Destroying worker`
      );

      pool.releaseWorker(id);
    }
  }
}, 5000);

process.on('SIGINT', () => {
  pool.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  pool.shutdown();
  process.exit(0);
});

module.exports = pool;