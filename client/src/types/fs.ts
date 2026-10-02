export interface FileEntry {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface ToolConfig {
  id: string;
  name: string;
  authenticated: boolean;
  username?: string;
  tokenExpiresAt?: number;
  addedAt?: number;
  forteUserRootId?: number;
  fileId?: number;
  projectFileTreeId?: number;
}

export interface ProjectConfig {
  id: string;
  tools?: ToolConfig[];
}

export interface ProjectState {
  rootPath: string | null;
  projectId?: string | null;
  projectName: string;
  files: FileEntry[];
  tools?: ToolConfig[];
  selectedFile: FileEntry | null;
  isLoading: boolean;
}
