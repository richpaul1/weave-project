import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PromptOptimizationDashboard } from '../PromptOptimizationDashboard';

// Mock fetch
global.fetch = vi.fn();

// Mock recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

describe('PromptOptimizationDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
  });

  it('renders the dashboard title', () => {
    render(<PromptOptimizationDashboard />);
    expect(screen.getByText('Prompt Optimization Dashboard')).toBeInTheDocument();
  });

  it('renders the create new job button', () => {
    render(<PromptOptimizationDashboard />);
    expect(screen.getByText('Create New Job')).toBeInTheDocument();
  });

  it('fetches jobs on mount', () => {
    render(<PromptOptimizationDashboard />);
    expect(fetch).toHaveBeenCalledWith('/api/prompt-optimization/jobs');
  });

  it('shows create job form when create button is clicked', async () => {
    render(<PromptOptimizationDashboard />);
    
    const createButton = screen.getByText('Create New Job');
    createButton.click();
    
    expect(screen.getByText('Create Optimization Job')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Job Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Starting Question')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Initial Prompt')).toBeInTheDocument();
  });
});
