import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { WeaveService } from './weave/weaveService.js';
import { StorageService } from './services/storageService.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import graphRoutes from './routes/graphRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import promptOptimizationRoutes, { setupWebSocketHandlers } from './routes/promptOptimizationRoutes.js';
import { setupVite, serveStatic } from './vite.js';

const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      `http://localhost:${config.port}`,
      'http://localhost:3003', // Admin client frontend
    ],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow same-origin requests and dev server
    const allowedOrigins = [
      `http://localhost:${config.port}`,
      'http://localhost:3003', // Admin client frontend
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

// Request logging middleware (filter out Vite internal requests)
app.use((req, _res, next) => {
  // Skip logging for Vite internal requests and static assets
  const skipPaths = [
    '/@fs/',           // Vite file system access
    '/@vite/',         // Vite internal modules
    '/@id/',           // Vite module IDs
    '/node_modules/',  // Node modules
    '/__vite_ping',    // Vite ping
    '/favicon.ico',    // Favicon requests
  ];

  const shouldSkip = skipPaths.some(path => req.path.startsWith(path)) ||
                     req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);

  if (!shouldSkip) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
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

// API health check endpoint (to handle /api/health requests)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'admin-backend',
    timestamp: new Date().toISOString(),
    message: 'Admin backend is healthy'
  });
});

// API routes
app.use('/api/crawler', crawlerRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/duplicates', graphRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/prompt-optimization', promptOptimizationRoutes);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: any) => {
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

    // Initialize WeaveService singleton and Weave
    console.log('Initializing WeaveService...');
    const weaveService = new WeaveService();
    try {
        await weaveService.initialize();
        console.log('WeaveService initialized');
    } catch (error) {
        console.warn('⚠️ Weave initialization failed, continuing with local logging:', error instanceof Error ? error.message : String(error));
    }

    // Initialize database schema
    console.log('Initializing database schema...');
    const storage = StorageService.getInstance();

    // Initialize database schema
    try {
      await storage.initializeSchema();
      console.log('Database schema initialized');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    }
    // Note: Don't close the storage connection as it's a singleton used by all routes

    // Setup WebSocket handlers for real-time updates
    console.log('Setting up WebSocket handlers...');
    setupWebSocketHandlers(io);
    console.log('✅ WebSocket handlers ready');

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
      console.log(`  GET    /api/courses`);
      console.log(`  GET    /api/courses/stats`);
      console.log(`  GET    /api/courses/search`);
      console.log(`  GET    /api/courses/:id`);
      console.log(`  GET    /api/courses/:id/markdown`);
      console.log(`  POST   /api/courses/crawl`);
      console.log(`  DELETE /api/courses/:id`);
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

