import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

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
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<OptimizationJob | null>(null);
  const [analytics, setAnalytics] = useState<JobAnalytics | null>(null);
  const [realtimeProgress, setRealtimeProgress] = useState<RealtimeProgress | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newJob, setNewJob] = useState({
    name: '',
    startingQuestion: '',
    initialPrompt: '',
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
      const response = await fetch('/api/prompt-optimization/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob)
      });
      
      if (response.ok) {
        const job = await response.json();
        setJobs([...jobs, job]);
        setNewJob({ name: '', startingQuestion: '', initialPrompt: '', trainingExamples: [] });
        setIsCreating(false);
      }
    } catch (error) {
      console.error('Failed to create job:', error);
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created': return 'bg-gray-500';
      case 'running': return 'bg-blue-500';
      case 'paused': return 'bg-yellow-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'cancelled': return 'bg-orange-500';
      default: return 'bg-gray-500';
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
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              startOptimization(job.id);
            }}
            className="w-full mt-2"
          >
            <Play className="w-4 h-4 mr-1" />
            Start Optimization
          </Button>
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
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          Create New Job
        </Button>
      </div>

      {/* Create Job Modal */}
      {isCreating && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <CardTitle>Create Optimization Job</CardTitle>
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
                      <div key={example.id} className="p-2 bg-gray-50 rounded text-sm">
                        <div className="font-medium">Score: {example.evaluation.overallScore}/10</div>
                        <div className="text-gray-600 truncate">{example.response}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={createJob} disabled={!newJob.name || !newJob.startingQuestion || !newJob.initialPrompt}>
                Create Job
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
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
                <div><strong>Best Score:</strong> {job.progress.bestScore.toFixed(1)}/10</div>

                {(job.status === 'running' || job.status === 'paused') && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Progress</span>
                      <span>{job.progress.currentIteration}/{job.progress.totalIterations || 20}</span>
                    </div>
                    <Progress value={(job.progress.currentIteration / (job.progress.totalIterations || 20)) * 100} />

                    {/* Show real-time progress for selected job */}
                    {selectedJob?.id === job.id && realtimeProgress && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
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
                          <span className="text-green-600">
                            +{realtimeProgress.scores.improvementPercentage.toFixed(1)}%
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
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${selectedJob.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                  Real-time Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {realtimeProgress.overallProgress.percentage.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Complete</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {realtimeProgress.scores.best.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-600">Best Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {realtimeProgress.currentRound.roundNumber}
                    </div>
                    <div className="text-sm text-gray-600">Round</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {formatTime(realtimeProgress.timing.elapsedTime)}
                    </div>
                    <div className="text-sm text-gray-600">Elapsed</div>
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
                      <div className="text-green-600">
                        +{realtimeProgress.scores.improvement.toFixed(2)}
                        ({realtimeProgress.scores.improvementPercentage.toFixed(1)}%)
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Convergence</div>
                      <div className={realtimeProgress.convergence.isConverging ? 'text-green-600' : 'text-gray-600'}>
                        {realtimeProgress.convergence.progress.toFixed(1)}%
                        {realtimeProgress.convergence.isConverging ? ' (Converging)' : ' (Exploring)'}
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
                <div className="mt-1 p-2 bg-gray-50 rounded text-sm">
                  {selectedJob.initialPrompt}
                </div>
              </div>
              <div>
                <strong>Training Examples:</strong>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {selectedJob.trainingExamples.map((example, index) => (
                    <div key={example.id} className="p-2 bg-gray-50 rounded text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">Score: {example.evaluation.overallScore}/10</span>
                      </div>
                      <div className="text-gray-600 mt-1">{example.response}</div>
                      <div className="text-gray-500 text-xs mt-1">{example.evaluation.reason}</div>
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
                        <div className="text-2xl font-bold text-blue-600">{analytics.totalIterations}</div>
                        <div className="text-sm text-gray-600">Total Iterations</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{analytics.bestScore.toFixed(1)}</div>
                        <div className="text-sm text-gray-600">Best Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">{analytics.averageScore.toFixed(1)}</div>
                        <div className="text-sm text-gray-600">Average Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{(analytics.improvementRate * 100).toFixed(0)}%</div>
                        <div className="text-sm text-gray-600">Improvement Rate</div>
                      </div>
                    </div>

                    {analytics.scoreProgression.length > 0 && (
                      <div className="h-64">
                        <h4 className="font-medium mb-2">Score Progression</h4>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analytics.scoreProgression}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="iteration" />
                            <YAxis domain={[0, 10]} />
                            <Tooltip
                              formatter={(value, name) => [value, 'Score']}
                              labelFormatter={(label) => `Iteration ${label}`}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#2563eb"
                              strokeWidth={2}
                              dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                              activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2 }}
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
                          <div className="text-center p-2 bg-gray-50 rounded">
                            <div className="font-bold">{realtimeProgress.scores.baseline.toFixed(1)}</div>
                            <div className="text-gray-600">Baseline</div>
                          </div>
                          <div className="text-center p-2 bg-blue-50 rounded">
                            <div className="font-bold text-blue-600">{realtimeProgress.scores.current.toFixed(1)}</div>
                            <div className="text-gray-600">Current</div>
                          </div>
                          <div className="text-center p-2 bg-green-50 rounded">
                            <div className="font-bold text-green-600">{realtimeProgress.scores.best.toFixed(1)}</div>
                            <div className="text-gray-600">Best</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
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
