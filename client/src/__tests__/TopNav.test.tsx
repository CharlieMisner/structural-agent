import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopNav } from '../components/TopNav';
import { AddToolDialog } from '../components/AddToolDialog';

describe('TopNav component', () => {
  it('renders title, menus, and triggers menu actions', () => {
    const onOpenFolder = vi.fn();
    const onToggleSidebar = vi.fn();
    const onClearChat = vi.fn();

    render(
      <TopNav
        onOpenFolder={onOpenFolder}
        onToggleSidebar={onToggleSidebar}
        onClearChat={onClearChat}
      />
    );

    expect(screen.getByText(/Statikor/i)).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();

    // Hover Edit
    fireEvent.mouseEnter(screen.getByText('Edit'));

    // Open File Menu
    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('Open Project Folder...')).toBeInTheDocument();

    // Hover View when a menu is open
    fireEvent.mouseEnter(screen.getByText('View'));
    expect(screen.getByText('Toggle File Tree')).toBeInTheDocument();

    // Toggle File Tree
    fireEvent.click(screen.getByText('Toggle File Tree'));
    expect(onToggleSidebar).toHaveBeenCalled();

    // Open View Menu again and Clear Conversation
    fireEvent.click(screen.getByText('View'));
    fireEvent.click(screen.getByText('Clear Conversation'));
    expect(onClearChat).toHaveBeenCalled();

    // Open File Menu and Open Project Folder
    fireEvent.click(screen.getByText('File'));
    fireEvent.click(screen.getByText('Open Project Folder...'));
    expect(onOpenFolder).toHaveBeenCalled();
  });

  it('handles Edit, Window, and Help menus and outside click', () => {
    window.alert = vi.fn();
    document.execCommand = vi.fn();
    render(<TopNav onOpenFolder={vi.fn()} onToggleSidebar={vi.fn()} />);

    // Open Edit Menu
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Undo'));
    expect(document.execCommand).toHaveBeenCalledWith('undo');

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Redo'));
    expect(document.execCommand).toHaveBeenCalledWith('redo');

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Cut'));
    expect(document.execCommand).toHaveBeenCalledWith('cut');

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Copy'));
    expect(document.execCommand).toHaveBeenCalledWith('copy');

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Paste'));
    expect(document.execCommand).toHaveBeenCalledWith('paste');

    // Open Window Menu
    fireEvent.click(screen.getByText('Window'));
    expect(screen.getByText('Minimize')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();

    // Open Help Menu
    fireEvent.click(screen.getByText('Help'));
    expect(screen.getByText('About Statikor')).toBeInTheDocument();

    fireEvent.click(screen.getByText('About Statikor'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Statikor v0.1.0'));

    // Click outside closes menu
    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('Open Project Folder...')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Open Project Folder...')).not.toBeInTheDocument();
  });
});

describe('AddToolDialog component', () => {
  it('renders enabled and disabled tools, and selects ForteWEB', () => {
    const onClose = vi.fn();
    const onSelectTool = vi.fn();

    const { rerender } = render(
      <AddToolDialog isOpen={false} onClose={onClose} onSelectTool={onSelectTool} />
    );
    expect(screen.queryByText('Add Tool')).not.toBeInTheDocument();

    rerender(<AddToolDialog isOpen={true} onClose={onClose} onSelectTool={onSelectTool} />);
    expect(screen.getByText('Add Tool')).toBeInTheDocument();
    expect(screen.getByText('ForteWEB')).toBeInTheDocument();
    expect(screen.getByText('Autodesk Revit')).toBeInTheDocument();

    // Click ForteWEB
    fireEvent.click(screen.getByText('ForteWEB'));
    expect(onSelectTool).toHaveBeenCalledWith('forteweb');

    // Press Escape to close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
