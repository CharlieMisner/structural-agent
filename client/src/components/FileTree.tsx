import React, { useState } from 'react';
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
import {
  FolderSearch,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Plus,
  Wrench,
} from 'lucide-react';
import { AddToolDialog } from './AddToolDialog';

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
  const [isFolderOpen, setIsFolderOpen] = useState<boolean>(true);
  const [isToolsOpen, setIsToolsOpen] = useState<boolean>(true);
  const [isAddToolOpen, setIsAddToolOpen] = useState<boolean>(false);

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
          <span
            className={`shrink-0 transition-colors ${
              isSelected
                ? 'text-[#00c8e6]'
                : 'text-[#44596d] group-hover:text-[#00c8e6]'
            }`}
          >
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

  const isOnlyToolsOpen = !isFolderOpen && isToolsOpen;

  return (
    <>
      <aside className="w-full h-full flex flex-col bg-[#050d18] text-hud-text select-none overflow-hidden">
        {/* Sidebar Header: EXPLORE */}
        <div className="h-9 px-3 border-b border-[#0e2236] flex items-center justify-between bg-[#03070d] shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-hud-text font-mono">
            Explore
          </span>
          <button
            onClick={onOpenFolderDialog}
            title="Open Project Folder"
            className="p-1 rounded hover:bg-[#091728] text-[#44596d] hover:text-[#00c8e6] transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Panel 1: Current Folder / Open A Folder (Collapsible) */}
        <div
          className={`flex flex-col overflow-hidden transition-all duration-150 ${
            isFolderOpen ? (isToolsOpen ? 'flex-1 min-h-[140px]' : 'flex-1') : 'shrink-0'
          }`}
        >
          {/* Panel 1 Header */}
          <div
            onClick={() => setIsFolderOpen((prev) => !prev)}
            className="h-8 px-2.5 flex items-center justify-between bg-[#06101d] hover:bg-[#091728] border-b border-[#0e2236] cursor-pointer transition-colors shrink-0 group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isFolderOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              )}
              {project.projectName ? (
                <span className="text-xs font-semibold text-hud-text font-mono truncate uppercase tracking-wide">
                  {project.projectName}
                </span>
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFolderDialog();
                  }}
                  className="text-xs italic text-[#7ba5c6] hover:text-[#00c8e6] transition-colors cursor-pointer"
                  title="Click to select project folder"
                >
                  Open A Folder
                </span>
              )}
            </div>
            {project.projectName && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFolderDialog();
                }}
                title="Change Folder"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#0f243b] text-[#546b82] hover:text-[#00c8e6] transition-all"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Panel 1 Body (File Tree or Open Folder State) */}
          {isFolderOpen && (
            <div className="flex-1 overflow-y-auto p-2 weave-tree-view-wrapper">
              {project.files.length === 0 ? (
                <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-4 text-[#44596d]">
                  <div className="w-9 h-9 rounded-lg bg-[#071322] border border-[#0e2236] flex items-center justify-center mb-2 text-[#44596d]">
                    <FolderOpen16 />
                  </div>
                  <p className="text-xs mb-3 text-[#44596d] font-mono italic">
                    No folder open
                  </p>
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
          )}
        </div>

        {/* Panel 2: Tools (Collapsible) */}
        <div
          className={`flex flex-col border-t border-[#0e2236] overflow-hidden transition-all duration-150 ${
            isOnlyToolsOpen ? 'flex-1' : isToolsOpen ? 'shrink-0 max-h-[50%]' : 'shrink-0'
          }`}
        >
          {/* Panel 2 Header */}
          <div
            onClick={() => setIsToolsOpen((prev) => !prev)}
            className="h-8 px-2.5 flex items-center justify-between bg-[#06101d] hover:bg-[#091728] border-b border-[#0e2236] cursor-pointer transition-colors shrink-0 group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isToolsOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#546b82] group-hover:text-hud-text transition-colors shrink-0" />
              )}
              <span className="text-xs font-semibold text-hud-text font-mono uppercase tracking-wide">
                Tools
              </span>
            </div>
          </div>

          {/* Panel 2 Body */}
          {isToolsOpen && (
            <div className="p-3 flex flex-col space-y-2.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => setIsAddToolOpen(true)}
                className="w-full flex items-center justify-center space-x-2 py-1.5 px-3 rounded bg-[#00c8e6]/10 hover:bg-[#00c8e6]/20 border border-[#00c8e6]/30 hover:border-[#00c8e6]/60 text-[#00c8e6] text-xs font-mono font-medium transition-all group shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                <span>Add Tool</span>
              </button>

              <div className="py-2 px-2 rounded border border-dashed border-[#0e2236] bg-[#030914]/50 text-center">
                <div className="flex items-center justify-center space-x-1.5 text-[#44596d] mb-1">
                  <Wrench className="w-3 h-3 text-[#44596d]" />
                  <span className="text-[11px] font-mono">Engineering Tools</span>
                </div>
                <p className="text-[10px] text-[#3b4e61] font-mono leading-tight">
                  Connect structural software to automate member design and analysis.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Add Tool Modal Dialog */}
      <AddToolDialog
        isOpen={isAddToolOpen}
        onClose={() => setIsAddToolOpen(false)}
      />
    </>
  );
};
