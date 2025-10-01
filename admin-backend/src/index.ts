import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initializeWeave } from './weave/init.js';
import { StorageService } from './services/storageService.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import contentRoutes from './routes/contentRoutes.js';

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5174', // Frontend URL
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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

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
    // Initialize Weave
    console.log('Initializing Weave...');
    await initializeWeave();

    // Initialize database schema
    console.log('Initializing database schema...');
    const storage = new StorageService();
    await storage.initializeSchema();
    await storage.close();
    console.log('Database schema initialized');

    // Start Express server
    app.listen(config.port, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Admin Backend Server Started`);
      console.log('='.repeat(50));
      console.log(`Port: ${config.port}`);
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
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

