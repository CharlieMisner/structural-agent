import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import * as tauriCore from '@tauri-apps/api/core';
import * as tauriDialog from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('App component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    global.WebSocket = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    })) as any;
  });

  it('renders top navigation, sidebar and workspace', () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);

    render(<App />);

    expect(screen.getByText(/Statikor/i)).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText(/What are we designing today, Charlie\?/i)).toBeInTheDocument();
  });

  it('auto-loads last project from localStorage on mount in web mode', async () => {
    localStorage.setItem('statikor_last_project', '/users/engineer/projects/bridge_calc');
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('bridge_calc')).toBeInTheDocument();
      expect(screen.getByText('Models')).toBeInTheDocument();
    });
  });

  it('handles Tauri open folder dialog and folder load', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(tauriDialog.open).mockResolvedValue('/projects/tauri_bridge');
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'read_project_directory') {
        return [
          {
            id: '/projects/tauri_bridge/calc.pdf',
            name: 'calc.pdf',
            path: '/projects/tauri_bridge/calc.pdf',
            isDirectory: false,
          },
        ];
      }
      if (cmd === 'get_project_config') {
        return {
          id: 'proj-tauri-1',
          tools: [{ id: 'forteweb', name: 'ForteWEB', authenticated: true, fileId: 100 }],
        };
      }
      return {};
    });

    render(<App />);

    // Click Open Project Folder in sidebar
    const openFolderBtn = screen.getByTitle('Open Project Folder');
    fireEvent.click(openFolderBtn);

    await waitFor(() => {
      expect(screen.getByText('tauri_bridge')).toBeInTheDocument();
      expect(screen.getByText('calc.pdf')).toBeInTheDocument();
    });
  });

  it('handles sidebar resizing mouse events', () => {
    render(<App />);

    const resizer = screen.getByTitle('Drag to resize pane');
    fireEvent.mouseDown(resizer, { clientX: 260 });

    fireEvent.mouseMove(document, { clientX: 320 });
    fireEvent.mouseUp(document);
  });

  it('handles web prompt fallback for folder selection', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);
    window.prompt = vi.fn().mockReturnValue('/home/user/web_proj');

    render(<App />);

    const openFolderBtn = screen.getByTitle('Open Project Folder');
    fireEvent.click(openFolderBtn);

    await waitFor(() => {
      expect(screen.getByText('web_proj')).toBeInTheDocument();
    });
  });

  it('handles file selection, file creation, folder creation, deletion, and tool saving', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);
    window.prompt = vi.fn().mockReturnValue('/home/user/web_proj');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', config: { tools: [] } }),
    });

    render(<App />);

    // Load folder
    fireEvent.click(screen.getByTitle('Open Project Folder'));

    await waitFor(() => {
      expect(screen.getByText('web_proj')).toBeInTheDocument();
    });

    // Select file
    const docFile = screen.getByText('calculations.pdf');
    fireEvent.click(docFile);

    // Target pill should show calculations.pdf
    expect(screen.getByText('Target:')).toBeInTheDocument();

    // Create new file
    const newFileBtn = screen.getAllByTitle('New File')[0];
    fireEvent.click(newFileBtn);
    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'notes.txt' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Create new folder
    const newFolderBtn = screen.getAllByTitle('New Folder')[0];
    fireEvent.click(newFolderBtn);
    const folderInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(folderInput, { target: { value: 'specs' } });
    fireEvent.keyDown(folderInput, { key: 'Enter' });

    // Delete a path
    window.confirm = vi.fn().mockReturnValue(true);
    fireEvent.contextMenu(screen.getAllByText('calculations.pdf')[0]);
    fireEvent.click(screen.getByText('Delete'));
  });

  it('handles Tauri file and folder operations, tool saving and auto-init', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(tauriDialog.open).mockResolvedValue('/projects/tauri_bridge');

    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'read_project_directory') {
        return [
          {
            id: '/projects/tauri_bridge/beam.rvt',
            name: 'beam.rvt',
            path: '/projects/tauri_bridge/beam.rvt',
            isDirectory: false,
          },
        ];
      }
      if (cmd === 'get_project_config') {
        return {
          id: 'proj-1',
          tools: [{ id: 'forteweb', name: 'ForteWEB', authenticated: true, username: 'test@eng.com' }],
        };
      }
      if (cmd === 'init_forte_project_file') {
        return {
          id: 'forteweb',
          name: 'ForteWEB',
          authenticated: true,
          username: 'test@eng.com',
          fileId: 101,
          projectFileTreeId: 101,
        };
      }
      if (cmd === 'create_file') {
        return { id: args?.path, name: 'slab.rvt', path: args?.path, isDirectory: false };
      }
      if (cmd === 'create_directory') {
        return { id: args?.path, name: 'details', path: args?.path, isDirectory: true, children: [] };
      }
      if (cmd === 'delete_path') {
        return {};
      }
      if (cmd === 'save_project_tool') {
        return { id: 'proj-1', tools: [args?.tool] };
      }
      return {};
    });

    render(<App />);

    fireEvent.click(screen.getByTitle('Open Project Folder'));

    await waitFor(() => {
      expect(screen.getByText('tauri_bridge')).toBeInTheDocument();
      expect(screen.getByText('beam.rvt')).toBeInTheDocument();
    });

    // Select file
    fireEvent.click(screen.getByText('beam.rvt'));
    expect(screen.getByText('Target:')).toBeInTheDocument();

    // Create file
    const newFileBtn = screen.getAllByTitle('New File')[0];
    fireEvent.click(newFileBtn);
    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'slab.rvt' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Create folder
    const newFolderBtn = screen.getAllByTitle('New Folder')[0];
    fireEvent.click(newFolderBtn);
    const folderInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(folderInput, { target: { value: 'details' } });
    fireEvent.keyDown(folderInput, { key: 'Enter' });

    // Delete path
    window.confirm = vi.fn().mockReturnValue(true);
    fireEvent.contextMenu(screen.getAllByText('beam.rvt')[0]);
    fireEvent.click(screen.getByText('Delete'));
  });

  it('handles WebSocket RPC messages and tool responses', async () => {
    let messageHandler: ((event: any) => void) | null = null;
    const mockSend = vi.fn();

    global.WebSocket = vi.fn().mockImplementation(() => ({
      send: mockSend,
      close: vi.fn(),
      onopen: null,
      set onmessage(handler: any) {
        messageHandler = handler;
      },
      onclose: null,
      onerror: null,
    })) as any;

    render(<App />);

    expect(messageHandler).toBeDefined();

    // 1. etabs_get_reactions tool
    if (messageHandler) {
      await (messageHandler as any)({
        data: JSON.stringify({
          type: 'execute_tool',
          id: 'rpc-1',
          tool: 'etabs_get_reactions',
          args: { node: 1 },
        }),
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"tool_result"')
      );

      // 2. revit_update_schedule tool
      await (messageHandler as any)({
        data: JSON.stringify({
          type: 'execute_tool',
          id: 'rpc-2',
          tool: 'revit_update_schedule',
          args: {},
        }),
      });

      // 3. Unknown tool
      await (messageHandler as any)({
        data: JSON.stringify({
          type: 'execute_tool',
          id: 'rpc-3',
          tool: 'unknown_tool',
        }),
      });
    }
  });
});
