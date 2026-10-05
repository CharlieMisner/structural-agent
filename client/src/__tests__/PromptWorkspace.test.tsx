import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptWorkspace } from '../components/PromptWorkspace';
import * as agentApi from '../services/agentApi';
import { ProjectState } from '../types/fs';

vi.mock('../services/agentApi', () => ({
  streamChat: vi.fn(),
  AGENT_BASE_URL: 'http://127.0.0.1:41420',
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial welcome state and selected file target pill', () => {
    render(<PromptWorkspace project={mockProject} />);

    expect(screen.getByText(/What are we designing today, Charlie\?/i)).toBeInTheDocument();
    expect(screen.getByText('beam.rvt')).toBeInTheDocument();
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
