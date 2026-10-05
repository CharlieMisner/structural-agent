import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForteLoginDialog } from '../components/ForteLoginDialog';
import * as tauriCore from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
}));

describe('ForteLoginDialog component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders inputs and closes on cancel or Escape', () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <ForteLoginDialog
        isOpen={true}
        onClose={onClose}
        projectPath="/projects/test"
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Sign into ForteWEB')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('validates empty inputs on submit', async () => {
    render(
      <ForteLoginDialog
        isOpen={true}
        onClose={vi.fn()}
        projectPath="/projects/test"
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    expect(screen.getByText(/Please enter both your Forte User Name and Password/i)).toBeInTheDocument();
  });

  it('handles successful web fetch login and init-file', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            access_token: 'fake_jwt_token',
            expires_in: 3600,
            username: 'engineer@company.com',
          }),
        });
      }
      if (url.includes('/init-file')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'forteweb',
            name: 'ForteWEB',
            authenticated: true,
            fileId: 456,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ForteLoginDialog
        isOpen={true}
        onClose={onClose}
        projectPath="/projects/test"
        onSuccess={onSuccess}
      />
    );

    const userInput = screen.getByPlaceholderText('e.g. engineer@company.com');
    const passInput = screen.getByPlaceholderText('••••••••••••');

    fireEvent.change(userInput, { target: { value: 'engineer@company.com' } });
    fireEvent.change(passInput, { target: { value: 'secretpass' } });

    // Toggle password visibility
    const togglePass = screen.getByTitle('Show password');
    fireEvent.click(togglePass);

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'forteweb',
          authenticated: true,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles Tauri invoke login branch', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'authenticate_forteweb') {
        return {
          accessToken: 'tauri_token',
          expiresIn: 3600,
          userName: 'tauri_user@test.com',
        };
      }
      if (cmd === 'init_forte_project_file') {
        return {
          id: 'forteweb',
          name: 'ForteWEB',
          authenticated: true,
          fileId: 888,
        };
      }
      return {};
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ForteLoginDialog
        isOpen={true}
        onClose={onClose}
        projectPath="/projects/test"
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. engineer@company.com'), {
      target: { value: 'tauri_user@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'tauri_pass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays error message on failed auth', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Invalid Forte credentials' }),
    });

    render(
      <ForteLoginDialog
        isOpen={true}
        onClose={vi.fn()}
        projectPath="/projects/test"
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. engineer@company.com'), {
      target: { value: 'bad@user.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'badpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid Forte credentials')).toBeInTheDocument();
    });
  });
});
