import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import promptOptimizationRoutes from '../../src/routes/promptOptimizationRoutes.js';

// Mock Weave
vi.mock('weave', () => ({
  op: (fn: Function, name: string) => fn
}));

describe('Prompt Optimization API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/prompt-optimization', promptOptimizationRoutes);
  });

  describe('POST /api/prompt-optimization/jobs', () => {
    it('should create a new optimization job', async () => {
      const jobData = {
        name: 'Test Job',
        startingQuestion: 'How do I write better prompts?',
        initialPrompt: 'You are a helpful AI assistant.',
        trainingExamples: [
          {
            response: 'Good response example',
            evaluation: {
              overallScore: 8.5,
              criteria: {
                relevance: 8,
                clarity: 9,
                completeness: 8,
                accuracy: 9,
                helpfulness: 8,
                engagement: 8
              },
              reason: 'Well structured and helpful',
              weight: 1.0,
              isGoldenExample: true,
              evaluatorType: 'human',
              timestamp: new Date().toISOString(),
              metadata: {}
            }
          }
        ]
      };

      const response = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Test Job',
        startingQuestion: 'How do I write better prompts?',
        initialPrompt: 'You are a helpful AI assistant.',
        status: 'created'
      });
      expect(response.body.id).toBeTruthy();
      expect(response.body.trainingExamples).toHaveLength(1);
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteJobData = {
        name: 'Incomplete Job'
        // Missing startingQuestion and initialPrompt
      };

      await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(incompleteJobData)
        .expect(400);
    });
  });

  describe('GET /api/prompt-optimization/jobs', () => {
    it('should list all optimization jobs', async () => {
      // First create a job
      const jobData = {
        name: 'List Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      // Then list jobs
      const response = await request(app)
        .get('/api/prompt-optimization/jobs')
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.jobs)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });
  });

  describe('GET /api/prompt-optimization/jobs/:jobId', () => {
    it('should get a specific optimization job', async () => {
      // Create a job first
      const jobData = {
        name: 'Get Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Get the job
      const response = await request(app)
        .get(`/api/prompt-optimization/jobs/${jobId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: jobId,
        name: 'Get Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      });
    });

    it('should return 404 for non-existent job', async () => {
      await request(app)
        .get('/api/prompt-optimization/jobs/non-existent-id')
        .expect(404);
    });
  });

  describe('POST /api/prompt-optimization/jobs/:jobId/start', () => {
    it('should start optimization for a job', async () => {
      // Create a job first
      const jobData = {
        name: 'Start Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Start optimization
      const response = await request(app)
        .post(`/api/prompt-optimization/jobs/${jobId}/start`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('started successfully');
    });
  });

  describe('GET /api/prompt-optimization/jobs/:jobId/progress', () => {
    it('should get job progress', async () => {
      // Create a job first
      const jobData = {
        name: 'Progress Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Get progress
      const response = await request(app)
        .get(`/api/prompt-optimization/jobs/${jobId}/progress`)
        .expect(200);

      expect(response.body).toHaveProperty('currentIteration');
      expect(response.body).toHaveProperty('totalIterations');
      expect(response.body).toHaveProperty('bestScore');
    });
  });

  describe('GET /api/prompt-optimization/jobs/:jobId/analytics', () => {
    it('should get job analytics', async () => {
      // Create a job first
      const jobData = {
        name: 'Analytics Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Get analytics
      const response = await request(app)
        .get(`/api/prompt-optimization/jobs/${jobId}/analytics`)
        .expect(200);

      expect(response.body).toHaveProperty('totalIterations');
      expect(response.body).toHaveProperty('bestScore');
      expect(response.body).toHaveProperty('averageScore');
      expect(response.body).toHaveProperty('scoreProgression');
      expect(response.body).toHaveProperty('improvementRate');
    });
  });

  describe('POST /api/prompt-optimization/jobs/:jobId/training-examples', () => {
    it('should add training example to job', async () => {
      // Create a job first
      const jobData = {
        name: 'Training Example Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Add training example
      const exampleData = {
        response: 'New training example response',
        evaluation: {
          overallScore: 7.5,
          criteria: {
            relevance: 7,
            clarity: 8,
            completeness: 7,
            accuracy: 8,
            helpfulness: 7,
            engagement: 8
          },
          reason: 'Good example for training',
          weight: 1.0,
          isGoldenExample: false,
          evaluatorType: 'human',
          timestamp: new Date().toISOString(),
          metadata: {}
        }
      };

      const response = await request(app)
        .post(`/api/prompt-optimization/jobs/${jobId}/training-examples`)
        .send(exampleData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.response).toBe('New training example response');
      expect(response.body.evaluation.overallScore).toBe(7.5);
    });

    it('should return 400 for missing required fields', async () => {
      // Create a job first
      const jobData = {
        name: 'Training Example Error Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Try to add incomplete training example
      const incompleteExampleData = {
        response: 'Missing evaluation'
        // Missing evaluation field
      };

      await request(app)
        .post(`/api/prompt-optimization/jobs/${jobId}/training-examples`)
        .send(incompleteExampleData)
        .expect(400);
    });
  });

  describe('POST /api/prompt-optimization/evaluate', () => {
    it('should evaluate a prompt', async () => {
      const evaluationData = {
        prompt: 'You are a helpful AI assistant that provides clear answers.',
        question: 'How do I reset my password?',
        trainingExamples: []
      };

      const response = await request(app)
        .post('/api/prompt-optimization/evaluate')
        .send(evaluationData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('overallScore');
      expect(response.body).toHaveProperty('criteria');
      expect(response.body).toHaveProperty('reason');
      expect(response.body.overallScore).toBeGreaterThan(0);
      expect(response.body.overallScore).toBeLessThanOrEqual(10);
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        prompt: 'Missing question field'
        // Missing question field
      };

      await request(app)
        .post('/api/prompt-optimization/evaluate')
        .send(incompleteData)
        .expect(400);
    });
  });

  describe('DELETE /api/prompt-optimization/jobs/:jobId', () => {
    it('should delete a job', async () => {
      // Create a job first
      const jobData = {
        name: 'Delete Test Job',
        startingQuestion: 'Test question?',
        initialPrompt: 'Test prompt'
      };

      const createResponse = await request(app)
        .post('/api/prompt-optimization/jobs')
        .send(jobData);

      const jobId = createResponse.body.id;

      // Delete the job
      await request(app)
        .delete(`/api/prompt-optimization/jobs/${jobId}`)
        .expect(204);

      // Verify it's deleted
      await request(app)
        .get(`/api/prompt-optimization/jobs/${jobId}`)
        .expect(404);
    });
  });
});
