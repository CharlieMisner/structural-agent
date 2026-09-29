export interface FileEntry {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface ProjectConfig {
  id: string;
}

export interface ProjectState {
  rootPath: string | null;
  projectId?: string | null;
  projectName: string;
  files: FileEntry[];
  selectedFile: FileEntry | null;
  isLoading: boolean;
}
