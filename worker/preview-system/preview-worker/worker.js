const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { createProxyMiddleware } = require('http-proxy-middleware');

const workerId = process.argv[2];
const port = parseInt(process.argv[3], 10);

if (!workerId || !port) {
  console.error('Usage: node worker.js <workerId> <port>');
  process.exit(1);
}

// Next.js will run on this internal port
const nextPort = port + 10000;

function execCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(stderr);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function copyRecursive(src, dest) {
  try {
    const stats = await fs.stat(src);
    if (stats.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src);
      for (const entry of entries) {
        if (entry === 'node_modules') continue;
        await copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else {
      await fs.copyFile(src, dest);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function prepareWorkspace() {
  const workDir = path.join(os.tmpdir(), `ai-studio-${workerId}`);
  await fs.mkdir(workDir, { recursive: true });
  const templateDir = path.join(__dirname, 'template');

  console.log(`[${workerId}] Copying template files...`);
  await copyRecursive(templateDir, workDir);

  const templateNM = path.join(templateDir, 'node_modules');
  const targetNM = path.join(workDir, 'node_modules');

  try {
    await fs.symlink(templateNM, targetNM, 'dir');
    console.log(`[${workerId}] Symlinked node_modules`);
  } catch (e) {
    console.log(`[${workerId}] Symlink failed, falling back to npm install...`);
    await execCommand('npm install', workDir);
  }

  return workDir;
}

async function main() {
  const workDir = await prepareWorkspace();
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  // Endpoint to inject new code into the running worker
  app.post('/__inject', async (req, res) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'No files provided' });

    try {
      const flatFiles = {};
      const flatten = (obj, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = prefix ? path.join(prefix, key) : key;
          if (value && typeof value === 'object') {
            if (value.file && value.file.contents !== undefined) {
              flatFiles[currentPath] = value.file.contents;
            } else if (value.directory) {
              flatten(value.directory, currentPath);
            } else if (value.contents !== undefined) {
              flatFiles[currentPath] = value.contents;
            } else {
              flatFiles[currentPath] = JSON.stringify(value);
            }
          } else if (typeof value === 'string') {
            flatFiles[currentPath] = value;
          }
        }
      };

      flatten(files);
      for (const [filePath, content] of Object.entries(flatFiles)) {
        const fullPath = path.join(workDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      console.log(`[${workerId}] Files injected`);
      res.json({ ok: true });
    } catch (e) {
      console.error('Injection error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy all other requests to the internal Next.js server
  app.use('/', createProxyMiddleware({
    target: `http://localhost:${nextPort}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    pathRewrite: (path) => {
      if (path.startsWith('/static')) {
        return path.replace('/static', '/_next/static');
      }
      return path;
    },
    onError: (err, req, res) => {
      res.status(503).send('Next.js is still starting up...');
    }
  }));

  const server = app.listen(port, () => {
    console.log(`[${workerId}] Worker Orchestrator listening on ${port}`);
    console.log(`[${workerId}] Starting Next.js on internal port ${nextPort}`);

    const nextProcess = spawn('npm', ['run', 'dev', '--', '-p', nextPort], {
      cwd: workDir,
      env: { ...process.env, NODE_ENV: 'development' },
      shell: true
    });

    nextProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[${workerId}] ${output}`);
      if (output.includes('Ready in') || output.includes('ready on')) {
        console.log(`[${workerId}] READY_SIGNAL`);
      }
    });

    nextProcess.stderr.on('data', (data) => {
      process.stderr.write(`[${workerId} stderr] ${data}`);
    });

    nextProcess.on('exit', (code) => {
      console.log(`[${workerId}] Next.js exited with code ${code}`);
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});