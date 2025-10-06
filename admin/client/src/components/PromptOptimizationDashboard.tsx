import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Pause, Square, RotateCcw, Trash2, Edit } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useTheme } from '../contexts/ThemeContext';

interface TrainingExample {
  id: string;
  response: string;
  evaluation: {
    overallScore: number;
    criteria: {
      relevance: number;
      clarity: number;
      completeness: number;
      accuracy: number;
      helpfulness: number;
      engagement: number;
    };
    reason: string;
  };
}

interface OptimizationJob {
  id: string;
  name: string;
  startingQuestion: string;
  initialPrompt: string;
  trainingExamples: TrainingExample[];
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: {
    currentIteration: number;
    totalIterations: number;
    bestScore: number;
    averageScore: number;
  };
}

interface RealtimeProgress {
  jobId: string;
  status: string;
  overallProgress: {
    percentage: number;
    currentPhase: string;
    estimatedTimeRemaining: number;
  };
  currentRound: {
    roundNumber: number;
    phase: string;
    progress: number;
    bestScore: number;
  };
  scores: {
    baseline: number;
    current: number;
    best: number;
    improvement: number;
    improvementPercentage: number;
  };
  timing: {
    startTime: string;
    elapsedTime: number;
    estimatedCompletion: string | null;
    totalPausedDuration: number;
  };
  iterations: {
    current: number;
    total: number;
    expected: number;
    completionRate: number;
  };
  convergence: {
    progress: number;
    threshold: number;
    isConverging: boolean;
  };
  lastUpdate: string;
}

interface JobAnalytics {
  totalIterations: number;
  bestScore: number;
  averageScore: number;
  scoreProgression: Array<{
    iteration: number;
    score: number;
    round: number;
    timestamp: string;
  }>;
  improvementRate: number;
}

export const PromptOptimizationDashboard: React.FC = () => {
  const { theme } = useTheme();
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<OptimizationJob | null>(null);
  const [analytics, setAnalytics] = useState<JobAnalytics | null>(null);
  const [realtimeProgress, setRealtimeProgress] = useState<RealtimeProgress | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [newJob, setNewJob] = useState({
    name: '',
    startingQuestion: '',
    initialPrompt: '',
    maxIterations: 50,
    algorithmType: 'simple_llm' as 'simple_llm' | 'multi_round' | 'ensemble',
    trainingExamples: [] as TrainingExample[]
  });
  const [newExample, setNewExample] = useState({
    response: '',
    score: 8,
    reason: ''
  });

  // WebSocket connection
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize WebSocket connection
  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    });

    socketRef.current.on('job-progress-update', (data: { jobId: string; progress: RealtimeProgress }) => {
      console.log('Received progress update:', data);

      // Update realtime progress if this is the selected job
      if (selectedJob && data.jobId === selectedJob.id) {
        setRealtimeProgress(data.progress);
      }

      // Update job status in the jobs list
      setJobs(prevJobs =>
        prevJobs.map(job =>
          job.id === data.jobId
            ? {
                ...job,
                status: data.progress.status as any,
                progress: {
                  ...job.progress,
                  currentIteration: data.progress.iterations.current,
                  totalIterations: data.progress.iterations.total,
                  bestScore: data.progress.scores.best,
                  averageScore: data.progress.scores.current
                }
              }
            : job
        )
      );
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Fetch jobs on component mount
  useEffect(() => {
    fetchJobs();
  }, []);

  // Subscribe to job progress when a job is selected
  useEffect(() => {
    if (selectedJob && socketRef.current) {
      // Subscribe to progress updates for this job
      socketRef.current.emit('subscribe-job-progress', selectedJob.id);

      // Fetch initial analytics and progress
      fetchJobAnalytics(selectedJob.id);
      fetchRealtimeProgress(selectedJob.id);

      return () => {
        if (socketRef.current) {
          socketRef.current.emit('unsubscribe-job-progress');
        }
      };
    }
  }, [selectedJob]);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/prompt-optimization/jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  const fetchJobAnalytics = async (jobId: string) => {
    try {
      const response = await fetch(`/api/prompt-optimization/jobs/${jobId}/analytics`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const fetchRealtimeProgress = async (jobId: string) => {
    try {
      const response = await fetch(`/api/prompt-optimization/jobs/${jobId}/realtime-progress`);
      const data = await response.json();
      setRealtimeProgress(data);
    } catch (error) {
      console.error('Failed to fetch realtime progress:', error);
    }
  };

  const createJob = async () => {
    try {
      if (isEditing && editingJobId) {
        // Update existing job
        const jobData = {
          name: newJob.name,
          startingQuestion: newJob.startingQuestion,
          initialPrompt: newJob.initialPrompt,
          trainingExamples: newJob.trainingExamples,
          algorithmType: newJob.algorithmType,
          maxIterations: newJob.maxIterations
        };

        const response = await fetch(`/api/prompt-optimization/jobs/${editingJobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData)
        });

        if (response.ok) {
          const updatedJob = await response.json();
          setJobs(jobs.map(job => job.id === editingJobId ? updatedJob : job));
          resetForm();
        } else {
          const errorData = await response.json().catch(() => ({}));
          alert(`Failed to update job: ${errorData.error || 'Unknown error'}`);
        }
      } else {
        // Create new job
        const jobData = {
          name: newJob.name,
          startingQuestion: newJob.startingQuestion,
          initialPrompt: newJob.initialPrompt,
          trainingExamples: newJob.trainingExamples,
          config: {
            algorithmType: newJob.algorithmType,
            maxIterations: newJob.maxIterations
          }
        };

        const response = await fetch('/api/prompt-optimization/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData)
        });

        if (response.ok) {
          const job = await response.json();
          setJobs([...jobs, job]);
          resetForm();
        } else {
          const errorData = await response.json().catch(() => ({}));
          alert(`Failed to create job: ${errorData.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Failed to save job:', error);
      alert(`Failed to save job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setNewJob({ name: '', startingQuestion: '', initialPrompt: '', maxIterations: 50, algorithmType: 'simple_llm', trainingExamples: [] });
    setIsCreating(false);
    setIsEditing(false);
    setEditingJobId(null);
  };

  const addTrainingExample = () => {
    const example: TrainingExample = {
      id: `example-${Date.now()}`,
      response: newExample.response,
      evaluation: {
        overallScore: newExample.score,
        criteria: {
          relevance: newExample.score,
          clarity: newExample.score,
          completeness: newExample.score,
          accuracy: newExample.score,
          helpfulness: newExample.score,
          engagement: newExample.score
        },
        reason: newExample.reason
      }
    };

    setNewJob({
      ...newJob,
      trainingExamples: [...newJob.trainingExamples, example]
    });

    setNewExample({ response: '', score: 8, reason: '' });
  };

  const startOptimization = async (jobId: string) => {
    try {
      await fetch(`/api/prompt-optimization/jobs/${jobId}/start`, {
        method: 'POST'
      });

      // Update job status locally
      setJobs(jobs.map(job =>
        job.id === jobId ? { ...job, status: 'running' as const } : job
      ));
    } catch (error) {
      console.error('Failed to start optimization:', error);
    }
  };

  const pauseJob = async (jobId: string) => {
    try {
      await fetch(`/api/prompt-optimization/jobs/${jobId}/pause`, {
        method: 'POST'
      });

      setJobs(jobs.map(job =>
        job.id === jobId ? { ...job, status: 'paused' as const } : job
      ));
    } catch (error) {
      console.error('Failed to pause job:', error);
    }
  };

  const resumeJob = async (jobId: string) => {
    try {
      await fetch(`/api/prompt-optimization/jobs/${jobId}/resume`, {
        method: 'POST'
      });

      setJobs(jobs.map(job =>
        job.id === jobId ? { ...job, status: 'running' as const } : job
      ));
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await fetch(`/api/prompt-optimization/jobs/${jobId}/cancel`, {
        method: 'POST'
      });

      setJobs(jobs.map(job =>
        job.id === jobId ? { ...job, status: 'cancelled' as const } : job
      ));
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const deleteJob = async (jobId: string) => {
    // Show confirmation dialog
    if (!window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/prompt-optimization/jobs/${jobId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete job: ${response.status} ${response.statusText}`);
      }

      // Remove job from the list
      setJobs(jobs.filter(job => job.id !== jobId));

      // Clear selected job if it was the deleted one
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const editJob = (job: OptimizationJob) => {
    // Populate form with existing job data
    // Transform server training examples to UI format
    const transformedExamples = (job.trainingExamples || []).map((example: any, index: number) => ({
      id: example.id || `example-${Date.now()}-${index}`,
      response: example.response || example.expectedResponse || '',
      evaluation: example.evaluation || {
        overallScore: 8,
        criteria: {
          relevance: 8,
          clarity: 8,
          completeness: 8,
          accuracy: 8,
          helpfulness: 8,
          engagement: 8
        },
        reason: 'Default evaluation for existing example'
      }
    }));

    setNewJob({
      name: job.name,
      startingQuestion: job.startingQuestion,
      initialPrompt: job.initialPrompt,
      maxIterations: job.config?.maxIterations || 50,
      algorithmType: job.config?.algorithmType || 'simple_llm',
      trainingExamples: transformedExamples
    });

    setEditingJobId(job.id);
    setIsEditing(true);
    setIsCreating(true); // Reuse the same modal
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created': return 'bg-muted-foreground';
      case 'running': return 'bg-primary';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-accent';
      case 'failed': return 'bg-destructive';
      case 'cancelled': return 'bg-orange-500';
      default: return 'bg-muted-foreground';
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const renderJobControls = (job: OptimizationJob) => {
    switch (job.status) {
      case 'created':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                startOptimization(job.id);
              }}
              className="flex-1"
            >
              <Play className="w-4 h-4 mr-1" />
              Start
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                editJob(job);
              }}
              className="px-2"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                deleteJob(job.id);
              }}
              className="px-2"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );

      case 'running':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                pauseJob(job.id);
              }}
              className="flex-1"
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                cancelJob(job.id);
              }}
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
          </div>
        );

      case 'paused':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                resumeJob(job.id);
              }}
              className="flex-1"
            >
              <Play className="w-4 h-4 mr-1" />
              Resume
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                cancelJob(job.id);
              }}
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                deleteJob(job.id);
              }}
              className="px-2"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );

      case 'completed':
      case 'failed':
      case 'cancelled':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                editJob(job);
              }}
              className="flex-1"
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit & Rerun
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                deleteJob(job.id);
              }}
              className="px-2"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Prompt Optimization Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent' : 'bg-destructive'}`}></div>
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          Create New Job
        </Button>
      </div>

      {/* Create/Edit Job Modal */}
      {isCreating && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <CardTitle>{isEditing ? 'Edit Optimization Job' : 'Create Optimization Job'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Job Name"
              value={newJob.name}
              onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
            />
            <Input
              placeholder="Starting Question"
              value={newJob.startingQuestion}
              onChange={(e) => setNewJob({ ...newJob, startingQuestion: e.target.value })}
            />
            <Textarea
              placeholder="Initial Prompt"
              value={newJob.initialPrompt}
              onChange={(e) => setNewJob({ ...newJob, initialPrompt: e.target.value })}
              rows={4}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Optimization Algorithm
              </label>
              <select
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={newJob.algorithmType}
                onChange={(e) => setNewJob({ ...newJob, algorithmType: e.target.value as 'simple_llm' | 'multi_round' | 'ensemble' })}
              >
                <option value="simple_llm">Simple LLM (Recommended)</option>
                <option value="multi_round">Multi-Round RL</option>
                <option value="ensemble">Ensemble RL</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {newJob.algorithmType === 'simple_llm' && 'Uses LLM to iteratively improve prompts based on feedback. Fast and effective.'}
                {newJob.algorithmType === 'multi_round' && 'Advanced reinforcement learning with multiple optimization rounds.'}
                {newJob.algorithmType === 'ensemble' && 'Coordinates multiple specialized RL agents for complex optimization.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Maximum Iterations
              </label>
              <Input
                type="number"
                min="1"
                max="200"
                placeholder="Number of optimization attempts"
                value={newJob.maxIterations}
                onChange={(e) => setNewJob({ ...newJob, maxIterations: parseInt(e.target.value) || 50 })}
              />
              <p className="text-xs text-muted-foreground">
                How many times the agent should attempt to improve the prompt (default: 50)
              </p>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Training Examples</h3>
              <div className="space-y-2">
                <Textarea
                  placeholder="Example Response"
                  value={newExample.response}
                  onChange={(e) => setNewExample({ ...newExample, response: e.target.value })}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    placeholder="Score (1-10)"
                    value={newExample.score}
                    onChange={(e) => setNewExample({ ...newExample, score: parseInt(e.target.value) || 8 })}
                  />
                  <Input
                    placeholder="Reason for score"
                    value={newExample.reason}
                    onChange={(e) => setNewExample({ ...newExample, reason: e.target.value })}
                  />
                  <Button onClick={addTrainingExample} disabled={!newExample.response}>
                    Add Example
                  </Button>
                </div>
              </div>
              
              {newJob.trainingExamples.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Added Examples ({newJob.trainingExamples.length})</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {newJob.trainingExamples.map((example, index) => (
                      <div key={example.id} className="p-2 bg-muted rounded text-sm">
                        <div className="font-medium">Score: {example.evaluation?.overallScore || 0}/10</div>
                        <div className="text-muted-foreground truncate">{example.response}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={createJob} disabled={!newJob.name || !newJob.startingQuestion || !newJob.initialPrompt}>
                {isEditing ? 'Update Job' : 'Create Job'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <Card 
            key={job.id} 
            className={`cursor-pointer transition-all ${selectedJob?.id === job.id ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setSelectedJob(job)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{job.name}</CardTitle>
                <Badge className={getStatusColor(job.status)}>
                  {job.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div><strong>Question:</strong> {job.startingQuestion}</div>
                <div><strong>Examples:</strong> {job.trainingExamples.length}</div>
                <div><strong>Best Score:</strong> {(job.progress.bestScore || 0).toFixed(1)}/10</div>

                {(job.status === 'running' || job.status === 'paused') && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Progress</span>
                      <span>{job.progress.currentIteration}/{job.progress.totalIterations || 20}</span>
                    </div>
                    <Progress value={((job.progress.currentIteration || 0) / (job.progress.totalIterations || 20)) * 100} />

                    {/* Show real-time progress for selected job */}
                    {selectedJob?.id === job.id && realtimeProgress && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs">
                        <div className="flex justify-between">
                          <span>Phase:</span>
                          <span className="font-medium">{realtimeProgress.overallProgress.currentPhase}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Round:</span>
                          <span>{realtimeProgress.currentRound.roundNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Improvement:</span>
                          <span className="text-accent">
                            +{(realtimeProgress.scores.improvementPercentage || 0).toFixed(1)}%
                          </span>
                        </div>
                        {realtimeProgress.timing.estimatedCompletion && (
                          <div className="flex justify-between">
                            <span>ETA:</span>
                            <span>{new Date(realtimeProgress.timing.estimatedCompletion).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {renderJobControls(job)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Job Details and Analytics */}
      {selectedJob && (
        <div className="space-y-6">
          {/* Real-time Progress Panel */}
          {realtimeProgress && (selectedJob.status === 'running' || selectedJob.status === 'paused') && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${selectedJob.status === 'running' ? 'bg-primary animate-pulse' : 'bg-yellow-500'}`}></div>
                  Real-time Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {(realtimeProgress.overallProgress.percentage || 0).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-accent">
                      {(realtimeProgress.scores.best || 0).toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Best Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-500">
                      {realtimeProgress.currentRound.roundNumber}
                    </div>
                    <div className="text-sm text-muted-foreground">Round</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-500">
                      {formatTime(realtimeProgress.timing.elapsedTime)}
                    </div>
                    <div className="text-sm text-muted-foreground">Elapsed</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Overall Progress</span>
                    <span>{realtimeProgress.overallProgress.currentPhase}</span>
                  </div>
                  <Progress value={realtimeProgress.overallProgress.percentage} className="h-2" />

                  <div className="flex justify-between text-sm">
                    <span>Current Round</span>
                    <span>{realtimeProgress.currentRound.phase}</span>
                  </div>
                  <Progress value={realtimeProgress.currentRound.progress} className="h-2" />

                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div>
                      <div className="font-medium">Score Improvement</div>
                      <div className="text-accent">
                        +{(realtimeProgress.scores.improvement || 0).toFixed(2)}
                        ({(realtimeProgress.scores.improvementPercentage || 0).toFixed(1)}%)
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Convergence</div>
                      <div className={realtimeProgress.convergence?.isConverging ? 'text-accent' : 'text-muted-foreground'}>
                        {(realtimeProgress.convergence?.progress || 0).toFixed(1)}%
                        {realtimeProgress.convergence?.isConverging ? ' (Converging)' : ' (Exploring)'}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
              <div>
                <strong>Name:</strong> {selectedJob.name}
              </div>
              <div>
                <strong>Question:</strong> {selectedJob.startingQuestion}
              </div>
              <div>
                <strong>Initial Prompt:</strong>
                <div className="mt-1 p-2 bg-muted rounded text-sm">
                  {selectedJob.initialPrompt}
                </div>
              </div>
              <div>
                <strong>Training Examples:</strong>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {selectedJob.trainingExamples.map((example, index) => (
                    <div key={example.id} className="p-2 bg-muted rounded text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">Score: {example.evaluation?.overallScore || 0}/10</span>
                      </div>
                      <div className="text-muted-foreground mt-1">{example.response}</div>
                      <div className="text-muted-foreground text-xs mt-1">{example.evaluation?.reason || 'No evaluation reason provided'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

            <Card>
              <CardHeader>
                <CardTitle>Analytics & Score Progression</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{analytics.totalIterations}</div>
                        <div className="text-sm text-muted-foreground">Total Iterations</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-accent">{(analytics.bestScore || 0).toFixed(1)}</div>
                        <div className="text-sm text-muted-foreground">Best Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-500">{(analytics.averageScore || 0).toFixed(1)}</div>
                        <div className="text-sm text-muted-foreground">Average Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-500">{((analytics.improvementRate || 0) * 100).toFixed(0)}%</div>
                        <div className="text-sm text-muted-foreground">Improvement Rate</div>
                      </div>
                    </div>

                    {analytics.scoreProgression.length > 0 && (
                      <div className="h-64">
                        <h4 className="font-medium mb-2">Score Progression</h4>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analytics.scoreProgression}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={theme === 'dark' ? 'hsl(217, 32%, 17%)' : 'hsl(214, 32%, 91%)'}
                            />
                            <XAxis
                              dataKey="iteration"
                              stroke={theme === 'dark' ? 'hsl(215, 20%, 75%)' : 'hsl(215, 16%, 47%)'}
                            />
                            <YAxis
                              domain={[0, 10]}
                              stroke={theme === 'dark' ? 'hsl(215, 20%, 75%)' : 'hsl(215, 16%, 47%)'}
                            />
                            <Tooltip
                              formatter={(value, name) => [value, 'Score']}
                              labelFormatter={(label) => `Iteration ${label}`}
                              contentStyle={{
                                backgroundColor: theme === 'dark' ? 'hsl(222, 84%, 4.9%)' : 'hsl(0, 0%, 100%)',
                                border: `1px solid ${theme === 'dark' ? 'hsl(217, 32%, 17%)' : 'hsl(214, 32%, 91%)'}`,
                                borderRadius: '6px',
                                color: theme === 'dark' ? 'hsl(210, 40%, 98%)' : 'hsl(222, 47%, 11%)'
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="hsl(217, 91%, 60%)"
                              strokeWidth={2}
                              dot={{ fill: 'hsl(217, 91%, 60%)', strokeWidth: 2, r: 4 }}
                              activeDot={{ r: 6, stroke: 'hsl(217, 91%, 60%)', strokeWidth: 2 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Real-time score updates */}
                    {realtimeProgress && realtimeProgress.scores && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2">Current Session Scores</h4>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="text-center p-2 bg-muted rounded">
                            <div className="font-bold">{(realtimeProgress.scores.baseline || 0).toFixed(1)}</div>
                            <div className="text-muted-foreground">Baseline</div>
                          </div>
                          <div className="text-center p-2 bg-primary/10 rounded">
                            <div className="font-bold text-primary">{(realtimeProgress.scores.current || 0).toFixed(1)}</div>
                            <div className="text-muted-foreground">Current</div>
                          </div>
                          <div className="text-center p-2 bg-accent/10 rounded">
                            <div className="font-bold text-accent">{(realtimeProgress.scores.best || 0).toFixed(1)}</div>
                            <div className="text-muted-foreground">Best</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    No analytics available yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
