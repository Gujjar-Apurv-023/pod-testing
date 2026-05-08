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

// 1. GLOBAL ASSET PROXY
const assetProxy = createProxyMiddleware({
  target: 'http://localhost:3999',
  router: async (req) => {
    // Try referer first (for absolute path requests)
    const referer = req.get('referer');
    if (referer) {
      const match = referer.match(/\/preview-proxy\/(w-[^\/]+)/);
      if (match && match[1]) {
        const meta = await pool.getWorkerMetadata(match[1]);
        if (meta) {
          return meta.isLocal ? `http://localhost:${meta.port}` : `http://${meta.podIp}:3001`;
        }
      }
    }
    // Then try the URL itself (for relative path requests that weren't caught by mainProxy)
    const match = req.originalUrl.match(/\/preview-proxy\/(w-[^\/]+)/);
    if (match && match[1]) {
      const meta = await pool.getWorkerMetadata(match[1]);
      if (meta) {
        return meta.isLocal ? `http://localhost:${meta.port}` : `http://${meta.podIp}:3001`;
      }
    }
    return null;
  },
  changeOrigin: true,
  ws: true,
  logLevel: 'silent'
});

// 2. MAIN PREVIEW PROXY (Iframe Entry)
const mainProxy = createProxyMiddleware({
  target: 'http://localhost:3999',
  router: async (req) => {
    const match = req.originalUrl.match(/\/preview-proxy\/(w-[^\/]+)/);
    if (match && match[1]) {
      const meta = await pool.getWorkerMetadata(match[1]);
      if (meta) {
        return meta.isLocal ? `http://localhost:${meta.port}` : `http://${meta.podIp}:3001`;
      }
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

// ROUTING
app.use('/preview-proxy/:workerId', mainProxy);
app.use('/api/preview', previewRouter);

// Global Fallback for Assets and API
app.use(async (req, res, next) => {
  if (isAssetPath(req.path) || (req.path.startsWith('/api') && !req.path.startsWith('/api/preview'))) {
    return assetProxy(req, res, next);
  }
  next();
});

app.get('/health', (req, res) => res.json({ status: 'active', podIp: pool.podIp }));

const PORT = process.env.WORKER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Worker Orchestrator] Running on port ${PORT} (Global Mode)`);
});
