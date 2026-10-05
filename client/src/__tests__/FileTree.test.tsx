import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree } from '../components/FileTree';
import { ProjectState } from '../types/fs';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
}));

const mockProjectWithFiles: ProjectState = {
  rootPath: '/projects/my_project',
  projectId: 'proj-1',
  projectName: 'My Project',
  files: [
    {
      id: '/projects/my_project/src',
      name: 'src',
      path: '/projects/my_project/src',
      isDirectory: true,
      children: [
        {
          id: '/projects/my_project/src/index.ts',
          name: 'index.ts',
          path: '/projects/my_project/src/index.ts',
          isDirectory: false,
        },
        {
          id: '/projects/my_project/src/calc.xlsx',
          name: 'calc.xlsx',
          path: '/projects/my_project/src/calc.xlsx',
          isDirectory: false,
        },
        {
          id: '/projects/my_project/src/model.edb',
          name: 'model.edb',
          path: '/projects/my_project/src/model.edb',
          isDirectory: false,
        },
        {
          id: '/projects/my_project/src/report.pdf',
          name: 'report.pdf',
          path: '/projects/my_project/src/report.pdf',
          isDirectory: false,
        },
        {
          id: '/projects/my_project/src/notes.doc',
          name: 'notes.doc',
          path: '/projects/my_project/src/notes.doc',
          isDirectory: false,
        },
      ],
    },
  ],
  tools: [
    {
      id: 'forteweb',
      name: 'ForteWEB',
      authenticated: true,
      username: 'user@example.com',
      fileId: 123,
      projectFileTreeId: 123,
    },
  ],
  selectedFile: null,
  isLoading: false,
};

describe('FileTree component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders explorer header, project name, files and tools', () => {
    const onSelectFile = vi.fn();
    const onOpenFolderDialog = vi.fn();

    render(
      <FileTree
        project={mockProjectWithFiles}
        onSelectFile={onSelectFile}
        onOpenFolderDialog={onOpenFolderDialog}
      />
    );

    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('ForteWEB')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('expands folder and selects file', () => {
    const onSelectFile = vi.fn();
    render(
      <FileTree
        project={mockProjectWithFiles}
        onSelectFile={onSelectFile}
        onOpenFolderDialog={vi.fn()}
      />
    );

    // Click folder to expand
    fireEvent.click(screen.getByText('src'));
    expect(onSelectFile).toHaveBeenCalledWith(mockProjectWithFiles.files[0]);

    // Check that children are now visible
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('calc.xlsx')).toBeInTheDocument();
    expect(screen.getByText('model.edb')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('notes.doc')).toBeInTheDocument();

    // Click child file
    fireEvent.click(screen.getByText('index.ts'));
    expect(onSelectFile).toHaveBeenCalledWith(mockProjectWithFiles.files[0].children![0]);
  });

  it('handles inline creation of file and folder', async () => {
    const onCreateFile = vi.fn().mockResolvedValue(true);
    const onCreateFolder = vi.fn().mockResolvedValue(true);

    render(
      <FileTree
        project={mockProjectWithFiles}
        onSelectFile={vi.fn()}
        onOpenFolderDialog={vi.fn()}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    );

    // Click "New File" button in header
    const newFileBtn = screen.getAllByTitle('New File')[0];
    fireEvent.click(newFileBtn);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new_beam.rvt' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreateFile).toHaveBeenCalledWith('/projects/my_project', 'new_beam.rvt');

    // Click "New Folder" button in header
    const newFolderBtn = screen.getAllByTitle('New Folder')[0];
    fireEvent.click(newFolderBtn);

    const folderInput = screen.getByRole('textbox');
    fireEvent.change(folderInput, { target: { value: 'calcs' } });
    fireEvent.blur(folderInput);

    expect(onCreateFolder).toHaveBeenCalledWith('/projects/my_project', 'calcs');
  });

  it('handles right click context menu and deletion', () => {
    window.confirm = vi.fn().mockReturnValue(true);
    const onDeletePath = vi.fn().mockResolvedValue(true);

    render(
      <FileTree
        project={mockProjectWithFiles}
        onSelectFile={vi.fn()}
        onOpenFolderDialog={vi.fn()}
        onDeletePath={onDeletePath}
      />
    );

    // Expand folder
    fireEvent.click(screen.getByText('src'));

    // Context menu on index.ts
    fireEvent.contextMenu(screen.getByText('index.ts'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete'));
    expect(onDeletePath).toHaveBeenCalledWith('/projects/my_project/src/index.ts');
  });

  it('handles Add Tool dialog and tool click', async () => {
    const onSaveTool = vi.fn().mockResolvedValue(undefined);

    render(
      <FileTree
        project={mockProjectWithFiles}
        onSelectFile={vi.fn()}
        onOpenFolderDialog={vi.fn()}
        onSaveTool={onSaveTool}
      />
    );

    // Click Add Tool button
    fireEvent.click(screen.getByRole('button', { name: /Add Tool/i }));
    expect(screen.getAllByText('Add Tool').length).toBeGreaterThan(0);

    // Select ForteWEB
    const forteBtns = screen.getAllByText('ForteWEB');
    fireEvent.click(forteBtns[0]);

    // Click existing tool to open login dialog
    fireEvent.click(forteBtns[0]);
  });

  it('renders empty folder state when no files present', () => {
    const onOpenFolderDialog = vi.fn();
    const emptyProj: ProjectState = {
      rootPath: null,
      projectId: null,
      projectName: '',
      files: [],
      selectedFile: null,
      isLoading: false,
    };

    render(
      <FileTree
        project={emptyProj}
        onSelectFile={vi.fn()}
        onOpenFolderDialog={onOpenFolderDialog}
      />
    );

    expect(screen.getByText('Open A Folder')).toBeInTheDocument();
    expect(screen.getByText('No folder open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open Folder/i }));
    expect(onOpenFolderDialog).toHaveBeenCalled();
  });
});
