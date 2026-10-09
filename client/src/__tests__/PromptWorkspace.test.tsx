import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptWorkspace } from '../components/PromptWorkspace';
import * as agentApi from '../services/agentApi';
import { ProjectState } from '../types/fs';
import { useAuth } from '../auth/AuthProvider';

vi.mock('../services/agentApi', () => ({
  streamChat: vi.fn(),
  AGENT_BASE_URL: 'http://127.0.0.1:41420',
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockProject: ProjectState = {
  rootPath: '/projects/my_project',
  projectId: 'proj-1',
  projectName: 'my_project',
  files: [],
  selectedFile: { id: 'file-1', name: 'beam.rvt', path: '/projects/my_project/beam.rvt', isDirectory: false },
  isLoading: false,
};

describe('PromptWorkspace component', () => {
  const mockLoginWithPopup = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      loginWithPopup: mockLoginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('token-123'),
      user: { name: 'Charlie', email: 'charlie@example.com' },
    });
  });

  it('renders initial welcome state and selected file target pill', () => {
    render(<PromptWorkspace project={mockProject} />);

    expect(screen.getByText(/What are we designing today, Charlie\?/i)).toBeInTheDocument();
    expect(screen.getByText('beam.rvt')).toBeInTheDocument();
  });

  it('shows sign-in message and button when unauthenticated user attempts to chat', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithPopup: mockLoginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
      user: null,
    });

    render(<PromptWorkspace project={mockProject} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Design a steel beam' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText('You must sign in before we can get to work.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    expect(mockLoginWithPopup).toHaveBeenCalled();
  });

  it('shows success message in chat when authentication becomes successful', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithPopup: mockLoginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue(null),
      user: null,
    });

    const { rerender } = render(<PromptWorkspace project={mockProject} />);

    expect(screen.queryByText(/successfully authenticated/i)).not.toBeInTheDocument();

    // User completes authentication
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      loginWithPopup: mockLoginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('token-123'),
      user: { name: 'Charlie', email: 'charlie@example.com' },
    });

    rerender(<PromptWorkspace project={mockProject} />);

    await waitFor(() => {
      expect(screen.getByText('User charlie@example.com successfully authenticated.')).toBeInTheDocument();
    });
  });

  it('handles sending prompt, streaming tokens, and expanding tool cards', async () => {
    vi.mocked(agentApi.streamChat).mockImplementation(async (_req, callbacks) => {
      callbacks.onToolStart?.('max_moment_ss_beam', { w: 2, l: 10 });
      callbacks.onToolEnd?.('max_moment_ss_beam', 25.0);
      callbacks.onToken('The maximum moment is **25 kip·ft**.');
      callbacks.onDone?.();
    });

    render(<PromptWorkspace project={mockProject} />);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Calculate beam moment' } });

    const submitBtn = screen.getByTitle('Execute Prompt');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Calculate beam moment')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/The maximum moment is/i)).toBeInTheDocument();
      expect(screen.getByText('Simply Supported Beam Moment Calculator')).toBeInTheDocument();
    });

    // Expand Tool Card
    const toolCardHeader = screen.getByText('Simply Supported Beam Moment Calculator');
    fireEvent.click(toolCardHeader);

    expect(screen.getByText(/Result:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/25/i).length).toBeGreaterThan(0);
  });

  it('handles agent streaming error response', async () => {
    vi.mocked(agentApi.streamChat).mockImplementation(async (_req, callbacks) => {
      callbacks.onError?.(new Error('LLM Quota Exceeded'));
    });

    render(<PromptWorkspace project={mockProject} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Calculate seismic' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/⚠️ Error from agent: LLM Quota Exceeded/i)).toBeInTheDocument();
    });
  });

  it('handles network connection failure during prompt', async () => {
    vi.mocked(agentApi.streamChat).mockRejectedValue(new Error('Connection refused'));

    render(<PromptWorkspace project={mockProject} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Calculate' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/Could not connect to Python sidecar/i)).toBeInTheDocument();
    });
  });
});
