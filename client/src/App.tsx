import React, { useState, useRef, useEffect } from 'react';
import { ThemeContext } from '@weave-design/theme-context';
import darkBlueMediumDensityTheme from '@weave-design/theme-data/build/esm/darkBlueMediumDensityTheme';
import { FileTree } from './components/FileTree';
import { TopNav } from './components/TopNav';
import { PromptWorkspace } from './components/PromptWorkspace';
import { FileEntry, ProjectConfig, ProjectState, ToolConfig } from './types/fs';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAuth } from './auth/AuthProvider';

export const App: React.FC = () => {
  const { getAccessToken } = useAuth();
  const [project, setProject] = useState<ProjectState>({
    rootPath: null,
    projectId: null,
    projectName: '',
    files: [],
    selectedFile: null,
    isLoading: false,
  });

  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(260);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // -------------------------------------------------------------
    // Hybrid RPC WebSocket Bridge (Local Client -> Remote Server)
    // -------------------------------------------------------------
    const connectRpc = () => {
      const ws = new WebSocket('ws://127.0.0.1:41420/ws/rpc');
      
      ws.onopen = () => {
        console.log('[RPC] Connected to Cloud Server (Local Sidecar mode)');
      };
      
      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'execute_tool') {
            console.log(`[RPC] Cloud requested local tool execution: ${payload.tool}`, payload.args);
            
            // --- MOCK LOCAL EXECUTION ---
            let result = {};
            if (payload.tool === 'etabs_get_reactions') {
              result = { P: 245.5, V2: 12.3, V3: -4.2, M2: 0, M3: 145.0 };
            } else if (payload.tool === 'revit_update_schedule') {
              result = { status: "success", elements_updated: 14 };
            } else {
              result = { error: "Unknown local tool" };
            }
            
            // Simulate local processing delay
            await new Promise((res) => setTimeout(res, 800));
            
            // Send back to cloud
            ws.send(JSON.stringify({
              type: "tool_result",
              id: payload.id,
              result: result
            }));
            console.log(`[RPC] Sent result back for ${payload.tool}`);
          }
        } catch (err) {
          console.error('[RPC] Message error', err);
        }
      };
      
      ws.onclose = () => {
        console.log('[RPC] Disconnected, reconnecting in 2s...');
        setTimeout(connectRpc, 2000);
      };
      
      wsRef.current = ws;
    };
    
    connectRpc();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect loop on unmount
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const lastProject = localStorage.getItem('statikor_last_project');
    if (lastProject) {
      loadFolder(lastProject);
    }
  }, []); // Run once on mount

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - dragStartXRef.current;
      const minW = 160;
      const maxW = Math.max(minW, window.innerWidth * 0.6);
      const newWidth = Math.max(minW, Math.min(maxW, dragStartWidthRef.current + delta));
      setSidebarWidth(Math.round(newWidth));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const loadFolder = async (folderPath: string) => {
    localStorage.setItem('statikor_last_project', folderPath);
    const folderName = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Project';
    setProject((prev) => ({
      ...prev,
      rootPath: folderPath,
      projectName: folderName,
      isLoading: true,
    }));

    try {
      // Ensure Python backend initializes .statikor/project.json as well
      const token = await getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch('http://127.0.0.1:41420/api/project/init', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: folderPath }),
      }).catch(() => null);

      if (isTauri()) {
        const [loadedFiles, projectConfig] = await Promise.all([
          invoke<FileEntry[]>('read_project_directory', { path: folderPath }),
          invoke<ProjectConfig>('get_project_config', { path: folderPath }).catch(() => null),
        ]);

        let tools = projectConfig?.tools || [];
        const forteTool = tools.find((t) => t.id === 'forteweb');
        if (forteTool && forteTool.authenticated && !forteTool.fileId && !forteTool.projectFileTreeId) {
          try {
            const initializedForte = await invoke<ToolConfig>('init_forte_project_file', {
              projectPath: folderPath,
              username: forteTool.username,
            });
            tools = tools.map((t) => (t.id === 'forteweb' ? initializedForte : t));
          } catch (initErr) {
            console.warn('Auto-init Forte file on load warning:', initErr);
          }
        }

        setProject((prev) => ({
          ...prev,
          files: loadedFiles,
          projectId: projectConfig?.id || null,
          tools,
          selectedFile: null,
          isLoading: false,
        }));
      } else {
        // Fallback for browser preview mode
        const mockProjectId = crypto.randomUUID();
        setProject((prev) => ({
          ...prev,
          projectId: mockProjectId,
          tools: [],
          files: [
            {
              id: `${folderPath}/models`,
              name: 'Models',
              path: `${folderPath}/models`,
              isDirectory: true,
              children: [
                { id: `${folderPath}/models/framing.edb`, name: 'framing.edb', path: `${folderPath}/models/framing.edb`, isDirectory: false },
                { id: `${folderPath}/models/building.rvt`, name: 'building.rvt', path: `${folderPath}/models/building.rvt`, isDirectory: false },
              ],
            },
            {
              id: `${folderPath}/drawings`,
              name: 'Drawings',
              path: `${folderPath}/drawings`,
              isDirectory: true,
              children: [
                { id: `${folderPath}/drawings/plan.dxf`, name: 'plan.dxf', path: `${folderPath}/drawings/plan.dxf`, isDirectory: false },
              ],
            },
            {
              id: `${folderPath}/calculations.pdf`,
              name: 'calculations.pdf',
              path: `${folderPath}/calculations.pdf`,
              isDirectory: false,
            },
          ],
          selectedFile: null,
          isLoading: false,
        }));
      }
    } catch (err) {
      console.error('Failed to load project directory:', err);
      setProject((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleOpenFolderDialog = async () => {
    try {
      if (isTauri()) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Structural Project Folder',
        });
        if (selected && typeof selected === 'string') {
          await loadFolder(selected);
        }
      } else {
        const path = prompt('Enter local project folder path:');
        if (path) {
          await loadFolder(path);
        }
      }
    } catch (err) {
      console.error('Error opening folder dialog:', err);
    }
  };

  const handleSelectFile = (file: FileEntry) => {
    setProject((prev) => ({
      ...prev,
      selectedFile: file,
    }));
  };

  const handleCreateFile = async (targetDir: string, fileName: string): Promise<boolean> => {
    const cleanDir = targetDir.replace(/\/+$/, '');
    const cleanName = fileName.replace(/^\/+/, '');
    const filePath = `${cleanDir}/${cleanName}`;
    try {
      if (isTauri()) {
        await invoke('create_file', { path: filePath });
      } else {
        const res = await fetch('http://127.0.0.1:41420/api/fs/create-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: 'Failed to create file' }));
          throw new Error(errData.detail || 'Failed to create file');
        }
      }
      if (project.rootPath) {
        await loadFolder(project.rootPath);
      }
      return true;
    } catch (err) {
      console.error('Failed to create file:', err);
      alert(`Could not create file: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const handleCreateFolder = async (targetDir: string, folderName: string): Promise<boolean> => {
    const cleanDir = targetDir.replace(/\/+$/, '');
    const cleanName = folderName.replace(/^\/+/, '');
    const dirPath = `${cleanDir}/${cleanName}`;
    try {
      if (isTauri()) {
        await invoke('create_directory', { path: dirPath });
      } else {
        const res = await fetch('http://127.0.0.1:41420/api/fs/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: dirPath }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: 'Failed to create folder' }));
          throw new Error(errData.detail || 'Failed to create folder');
        }
      }
      if (project.rootPath) {
        await loadFolder(project.rootPath);
      }
      return true;
    } catch (err) {
      console.error('Failed to create folder:', err);
      alert(`Could not create folder: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const handleDeletePath = async (targetPath: string): Promise<boolean> => {
    try {
      if (isTauri()) {
        await invoke('delete_path', { path: targetPath });
      } else {
        const res = await fetch('http://127.0.0.1:41420/api/fs/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath }),
        });
        if (!res.ok) {
          throw new Error('Failed to delete path');
        }
      }
      if (project.rootPath) {
        await loadFolder(project.rootPath);
      }
      return true;
    } catch (err) {
      console.error('Failed to delete:', err);
      return false;
    }
  };

  const handleRefresh = async () => {
    if (project.rootPath) {
      await loadFolder(project.rootPath);
    }
  };

  const handleSaveTool = async (tool: import('./types/fs').ToolConfig) => {
    if (project.rootPath) {
      if (isTauri()) {
        const updatedConfig = await invoke<ProjectConfig>('save_project_tool', {
          projectPath: project.rootPath,
          tool,
        });
        setProject((prev) => ({
          ...prev,
          tools: updatedConfig.tools || [],
        }));
      } else {
        const res = await fetch('http://127.0.0.1:41420/api/project/cloud-software/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath: project.rootPath, software: tool }),
        });
        if (res.ok) {
          const data = await res.json();
          setProject((prev) => ({
            ...prev,
            tools: data.config?.tools || [],
          }));
        }
      }
    } else {
      // Fallback if no folder open yet
      setProject((prev) => {
        const currentTools = prev.tools || [];
        const existingIdx = currentTools.findIndex((t) => t.id === tool.id);
        const nextTools = [...currentTools];
        if (existingIdx >= 0) {
          nextTools[existingIdx] = tool;
        } else {
          nextTools.push(tool);
        }
        return { ...prev, tools: nextTools };
      });
    }
  };

  return (
    <ThemeContext.Provider value={darkBlueMediumDensityTheme}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#03070d] text-hud-text">
        <TopNav
          onOpenFolder={handleOpenFolderDialog}
          onToggleSidebar={() => setShowSidebar((prev) => !prev)}
        />

        {/* Both panes with 1px border, rounded corners, and 3px space between with vertical ellipse grip */}
        <div className="flex flex-1 overflow-hidden p-1.5 gap-[3px] bg-[#03070d]">
          {showSidebar && (
            <div
              style={{ width: `${sidebarWidth}px` }}
              className="h-full shrink-0 flex flex-col rounded-lg border border-[#0e2236] overflow-hidden bg-[#050d18]"
            >
              <FileTree
                project={project}
                onSelectFile={handleSelectFile}
                onOpenFolderDialog={handleOpenFolderDialog}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onDeletePath={handleDeletePath}
                onRefresh={handleRefresh}
                onSaveTool={handleSaveTool}
              />
            </div>
          )}

          {/* 3px space resizer splitter with vertical ellipse grip */}
          {showSidebar && (
            <div
              onMouseDown={startResizing}
              className="w-[3px] h-full cursor-col-resize select-none relative flex items-center justify-center group shrink-0"
              title="Drag to resize pane"
            >
              {/* Expanded hit area so dragging is easy to engage */}
              <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-30 cursor-col-resize" />

              {/* Vertical ellipse grip */}
              <svg
                width="6"
                height="28"
                viewBox="0 0 6 28"
                className={`z-40 transition-colors pointer-events-none ${
                  isDragging
                    ? 'text-[#00c8e6] drop-shadow-[0_0_6px_#00c8e6]'
                    : 'text-[#2e4760] group-hover:text-[#00c8e6]'
                }`}
              >
                <ellipse cx="3" cy="14" rx="2" ry="12" fill="currentColor" />
              </svg>
            </div>
          )}

          {/* Right Pane (Prompt Workspace / Conversation) */}
          <div className="flex-1 h-full rounded-lg border border-[#0e2236] overflow-hidden bg-[#03070d] flex flex-col">
            <PromptWorkspace project={project} />
          </div>
        </div>
      </div>
    </ThemeContext.Provider>
  );
};

export default App;
