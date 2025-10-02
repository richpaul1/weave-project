import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { config } from './config.js';
import { initializeWeave } from './weave/init.js';
import { StorageService } from './services/storageService.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import graphRoutes from './routes/graphRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { setupVite, serveStatic, log } from './vite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow same-origin requests and dev server
    const allowedOrigins = [
      `http://localhost:${config.port}`,
      `http://localhost:${config.clientPort}`, // Admin client frontend
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'admin-backend',
    timestamp: new Date().toISOString(),
    config: {
      port: config.port,
      neo4jUri: config.neo4jUri,
      weaveProject: config.weaveProjectName,
      contentStoragePath: config.contentStoragePath,
    },
  });
});

// API routes
app.use('/api/crawler', crawlerRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/duplicates', graphRoutes);
app.use('/api/settings', settingsRoutes);

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server
async function startServer() {
  try {
    // Create content storage directory if it doesn't exist
    const contentStoragePath = config.contentStoragePath;
    if (!fs.existsSync(contentStoragePath)) {
      console.log(`Creating content storage directory: ${contentStoragePath}`);
      fs.mkdirSync(contentStoragePath, { recursive: true });
      console.log('✅ Content storage directory created');
    } else {
      console.log(`✅ Content storage directory exists: ${contentStoragePath}`);
    }

    // Initialize Weave
    console.log('Initializing Weave...');
    await initializeWeave();

    // Initialize database schema
    console.log('Initializing database schema...');
    const storage = new StorageService();
    await storage.initializeSchema();
    await storage.close();
    console.log('Database schema initialized');

    // Setup Vite in development or serve static files in production
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
      console.log('Setting up Vite dev server...');
      await setupVite(app, server);
      console.log('✅ Vite dev server ready');
    } else {
      console.log('Serving static files from build...');
      const served = serveStatic(app);
      if (!served) {
        console.warn('⚠️  Frontend not built - API only mode');
      } else {
        console.log('✅ Serving frontend from dist/public');
      }
    }

    // Start Express server
    server.listen(config.port, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Admin Backend Server Started`);
      console.log('='.repeat(50));
      console.log(`Port: ${config.port}`);
      console.log(`Mode: ${isDevelopment ? 'Development' : 'Production'}`);
      console.log(`Health Check: http://localhost:${config.port}/health`);
      console.log(`Neo4j: ${config.neo4jUri}`);
      console.log(`Weave Project: ${config.weaveProjectName}`);
      console.log(`Content Storage: ${config.contentStoragePath}`);
      console.log('='.repeat(50));
      console.log(`API Endpoints:`);
      console.log(`  POST   /api/crawler/start`);
      console.log(`  GET    /api/crawler/status/:jobId`);
      console.log(`  GET    /api/crawler/jobs`);
      console.log(`  DELETE /api/crawler/reset`);
      console.log(`  GET    /api/content/pages`);
      console.log(`  GET    /api/content/pages/:id`);
      console.log(`  GET    /api/content/pages/:id/markdown`);
      console.log(`  DELETE /api/content/pages/:id`);
      console.log(`  GET    /api/content/stats`);
      console.log(`  GET    /api/graph/nodes`);
      console.log(`  GET    /api/graph/edges`);
      console.log(`  GET    /api/graph/search`);
      console.log(`  GET    /api/graph/node-types`);
      console.log(`  DELETE /api/graph/nodes/:id`);
      console.log(`  GET    /api/duplicates`);
      console.log(`  GET    /api/settings/health`);
      console.log(`  GET    /api/settings/chat`);
      console.log(`  PUT    /api/settings/chat`);
      console.log(`  POST   /api/settings/chat/reset`);
      console.log('='.repeat(50));
      console.log(`Admin Panel URL: http://localhost:${config.port}/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

