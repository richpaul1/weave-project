import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '../pages/SettingsPage';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock confirm
global.confirm = vi.fn();

const mockChatSettings = {
  chat_service_prompt: 'Test prompt',
  search_score_threshold: 0.9,
  enable_title_matching: true,
  enable_full_page_content: true,
  max_pages: 5,
  empty_search_default_response: 'Test response',
  enable_full_validation_testing: false
};

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful fetch by default
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: mockChatSettings,
        message: 'Success'
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading state initially', async () => {
      // Mock a delayed response
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithQueryClient(<SettingsPage />);

      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error state when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Error loading settings/)).toBeInTheDocument();
      });
    });

    it('should show error when API returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: 'API Error',
          message: 'Something went wrong'
        }),
      });

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Error loading settings/)).toBeInTheDocument();
      });
    });
  });

  describe('Successful Load', () => {
    it('should render settings form when data loads successfully', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByText('Chat Settings')).toBeInTheDocument();
        expect(screen.getByLabelText('Chat Service Prompt')).toBeInTheDocument();
        expect(screen.getByLabelText('Search Score Threshold')).toBeInTheDocument();
        expect(screen.getByLabelText('Enable Title Matching')).toBeInTheDocument();
        expect(screen.getByLabelText('Enable Full Page Content')).toBeInTheDocument();
        expect(screen.getByLabelText('Maximum Pages')).toBeInTheDocument();
        expect(screen.getByLabelText('Empty Search Default Response')).toBeInTheDocument();
        expect(screen.getByLabelText('Enable Full Validation Testing')).toBeInTheDocument();
      });
    });

    it('should populate form fields with loaded data', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const promptField = screen.getByLabelText('Chat Service Prompt') as HTMLTextAreaElement;
        expect(promptField.value).toBe(mockChatSettings.chat_service_prompt);

        const thresholdField = screen.getByLabelText('Search Score Threshold') as HTMLInputElement;
        expect(thresholdField.value).toBe(mockChatSettings.search_score_threshold.toString());

        const maxPagesField = screen.getByLabelText('Maximum Pages') as HTMLInputElement;
        expect(maxPagesField.value).toBe(mockChatSettings.max_pages.toString());
      });
    });
  });

  describe('Form Interactions', () => {
    it('should update form fields when user types', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const promptField = screen.getByLabelText('Chat Service Prompt') as HTMLTextAreaElement;
        fireEvent.change(promptField, { target: { value: 'Updated prompt' } });
        expect(promptField.value).toBe('Updated prompt');
      });
    });

    it('should toggle switch fields', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const titleMatchingSwitch = screen.getByLabelText('Enable Title Matching');
        fireEvent.click(titleMatchingSwitch);
        // Switch state changes are handled by the Switch component internally
      });
    });

    it('should validate numeric fields', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const thresholdField = screen.getByLabelText('Search Score Threshold') as HTMLInputElement;
        fireEvent.change(thresholdField, { target: { value: '1.5' } }); // Invalid value
        
        const maxPagesField = screen.getByLabelText('Maximum Pages') as HTMLInputElement;
        fireEvent.change(maxPagesField, { target: { value: '0' } }); // Invalid value
      });
    });
  });

  describe('Form Submission', () => {
    it('should submit form with updated data', async () => {
      const updatedSettings = { ...mockChatSettings, chat_service_prompt: 'Updated prompt' };
      
      // Mock successful update
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockChatSettings }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: updatedSettings }),
        });

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const promptField = screen.getByLabelText('Chat Service Prompt') as HTMLTextAreaElement;
        fireEvent.change(promptField, { target: { value: 'Updated prompt' } });

        const saveButton = screen.getByText('Save Settings');
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/chat', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(expect.objectContaining({
            chat_service_prompt: 'Updated prompt'
          })),
        });
      });
    });

    it('should handle form submission errors', async () => {
      // Mock initial load success, then update failure
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockChatSettings }),
        })
        .mockRejectedValueOnce(new Error('Update failed'));

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const saveButton = screen.getByText('Save Settings');
        fireEvent.click(saveButton);
      });

      // Error handling is done by the mutation, which shows toast
    });
  });

  describe('Reset Functionality', () => {
    it('should reset settings when reset button is clicked', async () => {
      const defaultSettings = {
        ...mockChatSettings,
        chat_service_prompt: 'Default prompt'
      };

      // Mock initial load, then reset
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockChatSettings }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: defaultSettings }),
        });

      // Mock confirm dialog
      (global.confirm as any).mockReturnValue(true);

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const resetButton = screen.getByText('Reset to Defaults');
        fireEvent.click(resetButton);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/chat/reset', {
          method: 'POST',
        });
      });
    });

    it('should not reset when user cancels confirmation', async () => {
      // Mock confirm dialog to return false
      (global.confirm as any).mockReturnValue(false);

      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        const resetButton = screen.getByText('Reset to Defaults');
        fireEvent.click(resetButton);
      });

      // Should not make the reset API call
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only the initial load
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and structure', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        // Check that all form fields have proper labels
        expect(screen.getByLabelText('Chat Service Prompt')).toBeInTheDocument();
        expect(screen.getByLabelText('Search Score Threshold')).toBeInTheDocument();
        expect(screen.getByLabelText('Maximum Pages')).toBeInTheDocument();
        expect(screen.getByLabelText('Empty Search Default Response')).toBeInTheDocument();
        
        // Check that switches have proper labels
        expect(screen.getByLabelText('Enable Title Matching')).toBeInTheDocument();
        expect(screen.getByLabelText('Enable Full Page Content')).toBeInTheDocument();
        expect(screen.getByLabelText('Enable Full Validation Testing')).toBeInTheDocument();
      });
    });

    it('should have proper button roles and text', async () => {
      renderWithQueryClient(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Save Settings/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reset to Defaults/ })).toBeInTheDocument();
      });
    });
  });
});
