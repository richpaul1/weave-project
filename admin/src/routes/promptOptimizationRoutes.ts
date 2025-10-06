import express from 'express';
import { PromptOptimizationJobService } from '../services/promptOptimizationJobService.js';
import { WeaveService } from '../weave/weaveService.js';
import { StorageService } from '../services/storageService.js';
import type {
  PromptOptimizationJob,
  TrainingExample
} from '../models/promptOptimizationEnhanced.js';

const router = express.Router();

// Initialize services
const weaveService = new WeaveService();
let jobService: PromptOptimizationJobService;

// Initialize the job service
const initializeServices = async () => {
  try {
    await weaveService.initialize();
  } catch (error) {
    console.warn('⚠️ Weave initialization failed in routes, continuing with local logging:', error.message);
  }
  const storageService = StorageService.getInstance();
  jobService = new PromptOptimizationJobService(weaveService, storageService);
};

// Route handlers for prompt optimization
class PromptOptimizationRoutes {
  private jobService: PromptOptimizationJobService;

  constructor(jobService: PromptOptimizationJobService) {
    this.jobService = jobService;
  }

  // Route handler methods
  createJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._createJobImpl(req, res);
  };

  getJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._getJobImpl(req, res);
  };

  listJobs = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._listJobsImpl(req, res);
  };

  deleteJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._deleteJobImpl(req, res);
  };

  updateJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._updateJobImpl(req, res);
  };

  startOptimization = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._startOptimizationImpl(req, res);
  };

  pauseJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._pauseJobImpl(req, res);
  };

  resumeJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._resumeJobImpl(req, res);
  };

  cancelJob = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._cancelJobImpl(req, res);
  };

  getJobProgress = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._getJobProgressImpl(req, res);
  };

  getRealtimeProgress = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._getRealtimeProgressImpl(req, res);
  };

  getJobAnalytics = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._getJobAnalyticsImpl(req, res);
  };

  setMonitoringLevel = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._setMonitoringLevelImpl(req, res);
  };

  getMonitoringStats = async (req: express.Request, res: express.Response): Promise<void> => {
    await this._getMonitoringStatsImpl(req, res);
  };

  // Implementation methods (private)
  async _createJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const jobData = req.body;

      // Validate required fields
      if (!jobData.name || !jobData.startingQuestion || !jobData.initialPrompt) {
        res.status(400).json({
          error: 'Missing required fields: name, startingQuestion, initialPrompt'
        });
        return;
      }

      const job = await this.jobService.createJob(jobData);
      res.status(201).json(job);
    } catch (error) {
      console.error('Error creating optimization job:', error);
      res.status(500).json({ error: 'Failed to create optimization job' });
    }
  }

  async _getJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = this.jobService.getJob(jobId);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(job);
    } catch (error) {
      console.error('Error getting optimization job:', error);
      res.status(500).json({ error: 'Failed to get optimization job' });
    }
  }

  async _listJobsImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const useDatabase = req.query.useDatabase === 'true';

      if (useDatabase) {
        // Fetch from Neo4j database with pagination
        const result = await this.jobService.listJobsFromDatabase(page, pageSize);
        res.json(result);
      } else {
        // Fetch from memory store (real-time data)
        const jobs = this.jobService.listJobs();
        res.json({ jobs, total: jobs.length });
      }
    } catch (error) {
      console.error('Error listing optimization jobs:', error);
      res.status(500).json({ error: 'Failed to list optimization jobs' });
    }
  }

  async _deleteJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await this.jobService.deleteJob(jobId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting optimization job:', error);
      if (error instanceof Error && error.message.includes('Cannot delete job')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete optimization job' });
      }
    }
  }

  async _updateJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const jobData = req.body;
      const updatedJob = await this.jobService.updateJob(jobId, jobData);
      res.json(updatedJob);
    } catch (error) {
      console.error('Error updating optimization job:', error);
      if (error instanceof Error && error.message.includes('Cannot update job')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update optimization job' });
      }
    }
  }

  async _startOptimizationImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const options = req.body || {};
      await this.jobService.startJob(jobId, options);
      res.json({ message: 'Optimization started successfully' });
    } catch (error) {
      console.error('Error starting optimization:', error);
      res.status(500).json({ error: 'Failed to start optimization' });
    }
  }

  async _pauseJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await this.jobService.pauseJob(jobId);
      res.json({ message: 'Job paused successfully' });
    } catch (error) {
      console.error('Error pausing job:', error);
      res.status(500).json({ error: 'Failed to pause job' });
    }
  }

  async _resumeJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await this.jobService.resumeJob(jobId);
      res.json({ message: 'Job resumed successfully' });
    } catch (error) {
      console.error('Error resuming job:', error);
      res.status(500).json({ error: 'Failed to resume job' });
    }
  }

  async _cancelJobImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await this.jobService.cancelJob(jobId);
      res.json({ message: 'Job cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  }

  async _getJobProgressImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const progress = this.jobService.getJobProgress(jobId);

      if (!progress) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(progress);
    } catch (error) {
      console.error('Error getting job progress:', error);
      res.status(500).json({ error: 'Failed to get job progress' });
    }
  }

  async _getRealtimeProgressImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const progressData = this.jobService.getRealtimeProgressData(jobId);

      if (!progressData) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(progressData);
    } catch (error) {
      console.error('Error getting realtime progress:', error);
      res.status(500).json({ error: 'Failed to get realtime progress' });
    }
  }

  async _getJobAnalyticsImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = this.jobService.getJob(jobId);
      const progress = this.jobService.getJobProgress(jobId);

      if (!job || !progress) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      // Create analytics from job data
      const analytics = {
        totalIterations: progress.iterations?.current || 0,
        bestScore: progress.bestScore || 0,
        averageScore: progress.averageScore || 0,
        scoreProgression: progress.scoreHistory || [],
        improvementRate: progress.improvementRate || 0,
        convergenceProgress: progress.convergenceProgress || 0
      };

      res.json(analytics);
    } catch (error) {
      console.error('Error getting job analytics:', error);
      res.status(500).json({ error: 'Failed to get job analytics' });
    }
  }

  async _setMonitoringLevelImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { level } = req.body;

      if (!['minimal', 'essential', 'detailed', 'verbose'].includes(level)) {
        res.status(400).json({ error: 'Invalid monitoring level. Must be: minimal, essential, detailed, or verbose' });
        return;
      }

      // Get WeaveService instance and set monitoring level
      const { WeaveService } = await import('../weave/weaveService.js');
      const weaveInstance = WeaveService.getInstance();
      weaveInstance.setMonitoringLevel(level);

      res.json({
        message: `Monitoring level set to ${level}`,
        stats: weaveInstance.getStats()
      });
    } catch (error) {
      console.error('Error setting monitoring level:', error);
      res.status(500).json({ error: 'Failed to set monitoring level' });
    }
  }

  async _getMonitoringStatsImpl(req: express.Request, res: express.Response): Promise<void> {
    try {
      // Get WeaveService instance and return stats
      const { WeaveService } = await import('../weave/weaveService.js');
      const weaveInstance = WeaveService.getInstance();

      res.json({
        weaveStats: weaveInstance.getStats(),
        monitoringLevel: weaveInstance.getMonitoringLevel()
      });
    } catch (error) {
      console.error('Error getting monitoring stats:', error);
      res.status(500).json({ error: 'Failed to get monitoring stats' });
    }
  }
}

// Initialize services and routes handler
let routesHandler: PromptOptimizationRoutes;

const initializeRoutes = async () => {
  await initializeServices();
  routesHandler = new PromptOptimizationRoutes(jobService);
};

// Initialize routes (call this before setting up the router)
initializeRoutes().catch(console.error);

// Define the routes
router.post('/jobs', (req, res) => routesHandler?.createJob(req, res));
router.get('/jobs', (req, res) => routesHandler?.listJobs(req, res));
router.get('/jobs/:jobId', (req, res) => routesHandler?.getJob(req, res));
router.put('/jobs/:jobId', (req, res) => routesHandler?.updateJob(req, res));
router.delete('/jobs/:jobId', (req, res) => routesHandler?.deleteJob(req, res));
router.post('/jobs/:jobId/start', (req, res) => routesHandler?.startOptimization(req, res));
router.post('/jobs/:jobId/pause', (req, res) => routesHandler?.pauseJob(req, res));
router.post('/jobs/:jobId/resume', (req, res) => routesHandler?.resumeJob(req, res));
router.post('/jobs/:jobId/cancel', (req, res) => routesHandler?.cancelJob(req, res));
router.get('/jobs/:jobId/progress', (req, res) => routesHandler?.getJobProgress(req, res));
router.get('/jobs/:jobId/realtime-progress', (req, res) => routesHandler?.getRealtimeProgress(req, res));
router.get('/jobs/:jobId/analytics', (req, res) => routesHandler?.getJobAnalytics(req, res));

// Monitoring control routes
router.post('/monitoring/level', (req, res) => routesHandler?.setMonitoringLevel(req, res));
router.get('/monitoring/stats', (req, res) => routesHandler?.getMonitoringStats(req, res));

// WebSocket endpoint for real-time progress updates
export const setupWebSocketHandlers = (io: any) => {
  io.on('connection', (socket: any) => {
    console.log('Client connected for prompt optimization updates');

    socket.on('subscribe-job-progress', (jobId: string) => {
      console.log(`Client subscribed to job progress: ${jobId}`);

      // Set up real-time progress updates using EventEmitter
      const progressHandler = (progress: any) => {
        socket.emit('job-progress-update', { jobId, progress });
      };

      // Subscribe to job progress events
      if (jobService) {
        jobService.on(`job-progress-${jobId}`, progressHandler);

        // Send initial progress data
        const initialProgress = jobService.getRealtimeProgressData(jobId);
        if (initialProgress) {
          socket.emit('job-progress-update', { jobId, progress: initialProgress });
        }
      }

      // Clean up subscription when client disconnects
      socket.on('disconnect', () => {
        console.log('Client disconnected from prompt optimization updates');
        if (jobService) {
          jobService.off(`job-progress-${jobId}`, progressHandler);
        }
      });

      socket.on('unsubscribe-job-progress', () => {
        console.log(`Client unsubscribed from job progress: ${jobId}`);
        if (jobService) {
          jobService.off(`job-progress-${jobId}`, progressHandler);
        }
      });
    });
  });
};

export default router;
