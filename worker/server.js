require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const pool = require('./preview-system/worker-pool/WorkerPool');
const previewRouter = require('./preview-system/orchestrator/index');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper to check if a path should be proxied to a worker
const isAssetPath = (path) => {
  return path.startsWith('/_next') || 
         path.startsWith('/static') || 
         path.startsWith('/public') || 
         /\.(js|css|png|jpg|json|map|ico|svg)$/.test(path);
};

// 1. Next.js Asset & Static File Routing
app.use((req, res, next) => {
  if (!isAssetPath(req.path)) {
    return next();
  }

  const referer = req.get('referer');
  if (referer) {
    const match = referer.match(/\/preview-proxy\/(w-[^\/]+)/);
    if (match && match[1]) {
      const workerId = match[1];
      try {
        const worker = pool.getWorker(workerId);
        if (worker) {
          return createProxyMiddleware({
            target: `http://localhost:${worker.port}`,
            changeOrigin: true,
            ws: true,
            logLevel: 'silent'
          })(req, res, next);
        }
      } catch (err) {}
    }
  }
  next();
});

// 2. Application API Routes (Proxied to worker)
// Use a generic middleware to avoid Express stripping the '/api' prefix
app.use((req, res, next) => {
  // Only handle /api calls that are NOT system preview calls
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/preview')) {
    return next();
  }

  const referer = req.get('referer');
  if (referer) {
    const match = referer.match(/\/preview-proxy\/(w-[^\/]+)/);
    if (match && match[1]) {
      const workerId = match[1];
      try {
        const worker = pool.getWorker(workerId);
        if (worker) {
          return createProxyMiddleware({
            target: `http://localhost:${worker.port}`,
            changeOrigin: true,
            logLevel: 'silent'
          })(req, res, next);
        }
      } catch (err) {}
    }
  }
  next();
});

// 3. Main Preview Proxy Endpoint
app.use('/preview-proxy/:workerId', (req, res, next) => {
  const { workerId } = req.params;
  try {
    const worker = pool.getWorker(workerId);
    if (worker) {
      return createProxyMiddleware({
        target: `http://localhost:${worker.port}`,
        changeOrigin: true,
        pathRewrite: {
          [`^/preview-proxy/${workerId}`]: '',
        },
        ws: true,
        logLevel: 'silent'
      })(req, res, next);
    }
  } catch (err) {
    res.status(404).send(`Worker ${workerId} not found or expired`);
  }
});

// 4. Preview System Management API
app.use('/api/preview', previewRouter);

// 5. Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'active' });
});

const PORT = process.env.WORKER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Worker Orchestrator] Running on port ${PORT}`);
});
