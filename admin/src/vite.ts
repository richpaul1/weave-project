import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, createLogger } from 'vite';
import { type Server } from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteLogger = createLogger();

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const viteConfigPath = path.resolve(__dirname, '..', 'client', 'vite.config.ts');
  
  const vite = await createViteServer({
    configFile: viteConfigPath,
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: 'custom',
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
  });

  app.use(vite.middlewares);
  
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(__dirname, '..', 'client', 'index.html');

      // Always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, '..', 'dist', 'public');

  if (!fs.existsSync(distPath)) {
    log(`Frontend build not found at: ${distPath}`, 'vite');
    log(`Run 'npm run build' to build the frontend`, 'vite');
    return false;
  }

  app.use(express.static(distPath));

  // Fall through to index.html if the file doesn't exist (SPA routing)
  app.use('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });

  return true;
}

