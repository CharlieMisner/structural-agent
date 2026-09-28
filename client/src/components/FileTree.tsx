import React from 'react';
import TreeView, { TreeItem } from '@weave-design/tree-view';
import {
  Folder16,
  FolderOpen16,
  FileGeneric16,
  FileAssembly16,
  FileDocument16,
  FileSpreadsheet16,
  FilePdf16,
} from '@weave-design/icons';
import { FileEntry, ProjectState } from '../types/fs';
import { FolderSearch, FolderPlus } from 'lucide-react';

interface FileTreeProps {
  project: ProjectState;
  onSelectFile: (file: FileEntry) => void;
  onOpenFolderDialog: () => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  project,
  onSelectFile,
  onOpenFolderDialog,
}) => {
  const getFileIcon = (file: FileEntry) => {
    if (file.isDirectory) return <Folder16 />;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['edb', '$et', 'sdb', '$2k', 'rvt', 'r3d', 'std'].includes(ext)) {
      return <FileAssembly16 />;
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      return <FileSpreadsheet16 />;
    }
    if (ext === 'pdf') {
      return <FilePdf16 />;
    }
    if (['doc', 'docx', 'md', 'txt'].includes(ext)) {
      return <FileDocument16 />;
    }
    return <FileGeneric16 />;
  };

  const renderTreeItems = (items: FileEntry[]) => {
    return items.map((item) => {
      const isSelected = project.selectedFile?.id === item.id;

      const labelContent = (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectFile(item);
          }}
          className={`flex items-center space-x-2 py-1 px-1.5 rounded transition-colors group cursor-pointer w-full text-xs truncate ${
            isSelected
              ? 'bg-[#00f0ff]/10 text-[#00c8e6] font-medium border border-[#00f0ff]/20'
              : 'hover:bg-[#091728] text-hud-text hover:text-[#00c8e6]'
          }`}
        >
          <span className={`shrink-0 transition-colors ${
            isSelected ? 'text-[#00c8e6]' : 'text-[#44596d] group-hover:text-[#00c8e6]'
          }`}>
            {getFileIcon(item)}
          </span>
          <span className="truncate font-mono">{item.name}</span>
        </div>
      );

      if (item.isDirectory && item.children && item.children.length > 0) {
        return (
          <TreeItem
            key={item.id}
            id={item.id}
            label={labelContent}
            defaultCollapsed={true}
          >
            {renderTreeItems(item.children)}
          </TreeItem>
        );
      }

      return (
        <TreeItem
          key={item.id}
          id={item.id}
          label={labelContent}
        />
      );
    });
  };

  return (
    <aside className="w-full h-full flex flex-col bg-[#050d18] text-hud-text select-none">
      {/* Side Pane Header */}
      <div className="h-9 px-3 border-b border-[#0e2236] flex items-center justify-between bg-[#03070d]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-hud-text truncate font-mono">
          {project.projectName || 'Files'}
        </span>
        <button
          onClick={onOpenFolderDialog}
          title="Open Project Folder"
          className="p-1 rounded hover:bg-[#091728] text-[#44596d] hover:text-[#00c8e6] transition-colors"
        >
          <FolderSearch className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tree Content Area */}
      <div className="flex-1 overflow-y-auto p-2 weave-tree-view-wrapper">
        {project.files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#44596d]">
            <div className="w-10 h-10 rounded-lg bg-[#071322] border border-[#0e2236] flex items-center justify-center mb-2 text-[#44596d]">
              <FolderOpen16 />
            </div>
            <p className="text-xs mt-1 mb-3 text-[#44596d] font-mono">No folder open</p>
            <button
              onClick={onOpenFolderDialog}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#071322] hover:bg-[#0b1c2e] border border-[#0e2236] hover:border-[#00f0ff]/20 text-hud-text hover:text-[#00c8e6] text-xs font-mono transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#00c8e6]/70" />
              <span>Open Folder</span>
            </button>
          </div>
        ) : (
          <TreeView indicator="caret">
            {renderTreeItems(project.files)}
          </TreeView>
        )}
      </div>
    </aside>
  );
};
