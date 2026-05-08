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

// 1. Singleton Asset Proxy
// We initialize this ONCE to avoid memory leaks
const assetProxy = createProxyMiddleware({
  target: 'http://localhost:4000', // Default, will be overridden by router
  router: (req) => {
    const referer = req.get('referer');
    if (referer) {
      const match = referer.match(/\/preview-proxy\/(w-[^\/]+)/);
      if (match && match[1]) {
        const worker = pool.getWorker(match[1]);
        if (worker) return `http://localhost:${worker.port}`;
      }
    }
    return null;
  },
  changeOrigin: true,
  ws: true,
  logLevel: 'silent',
  onProxyReq: (proxyReq, req) => {
    // Ensure the connection is kept alive for performance
    proxyReq.setHeader('Connection', 'keep-alive');
  }
});

// 2. Main Preview Proxy (The Iframe Target)
const mainProxy = createProxyMiddleware({
  target: 'http://localhost:4000',
  router: (req) => {
    // Extract workerId from the URL /preview-proxy/:workerId
    const match = req.path.match(/\/preview-proxy\/(w-[^\/]+)/);
    if (match && match[1]) {
      const worker = pool.getWorker(match[1]);
      if (worker) return `http://localhost:${worker.port}`;
    }
    return null;
  },
  pathRewrite: (path) => {
    return path.replace(/\/preview-proxy\/w-[^\/]+\/?/, '/');
  },
  changeOrigin: true,
  ws: true,
  logLevel: 'silent'
});

// ROUTING LOGIC
// Order matters here!

// Route 1: Direct Iframe Entry
app.use('/preview-proxy/:workerId', mainProxy);

// Route 2: System API
app.use('/api/preview', previewRouter);

// Route 3: Application Assets & Next.js API
app.use((req, res, next) => {
  // If it's an asset or an application /api call, use the assetProxy
  if (isAssetPath(req.path) || (req.path.startsWith('/api') && !req.path.startsWith('/api/preview'))) {
    return assetProxy(req, res, next);
  }
  next();
});

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'active' });
});

const PORT = process.env.WORKER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Worker Orchestrator] Running on port ${PORT}`);
});
