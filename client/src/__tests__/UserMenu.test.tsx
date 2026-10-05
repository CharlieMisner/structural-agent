import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UserMenu } from '../components/UserMenu';
import * as AuthProviderModule from '../auth/AuthProvider';

describe('UserMenu component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state', () => {
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      loginWithRedirect: vi.fn(),
      loginWithPopup: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(<UserMenu />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders Sign In button when unauthenticated and triggers login popup', async () => {
    const loginWithPopup = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      loginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(<UserMenu />);
    const signInBtn = screen.getByText('Sign In');
    expect(signInBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(signInBtn);
    });

    expect(loginWithPopup).toHaveBeenCalled();
  });

  it('displays error message when loginWithPopup fails', async () => {
    const loginWithPopup = vi.fn().mockRejectedValue(new Error('User cancelled login'));

    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      loginWithPopup,
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(<UserMenu />);
    const signInBtn = screen.getByText('Sign In');

    await act(async () => {
      fireEvent.click(signInBtn);
    });

    expect(screen.getByText('User cancelled login')).toBeInTheDocument();
  });

  it('renders user menu when authenticated and handles logout', () => {
    const logout = vi.fn();
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        picture: 'https://example.com/avatar.jpg',
      },
      loginWithPopup: vi.fn(),
      loginWithRedirect: vi.fn(),
      logout,
      getAccessToken: vi.fn(),
    });

    render(<UserMenu />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(screen.getByText('Jane Doe'));
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();

    // Click Sign Out
    fireEvent.click(screen.getByText('Sign Out'));
    expect(logout).toHaveBeenCalled();
  });

  it('closes dropdown when clicking outside', () => {
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      loginWithPopup: vi.fn(),
      loginWithRedirect: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
    });

    render(
      <div>
        <div data-testid="outside">Outside</div>
        <UserMenu />
      </div>
    );

    fireEvent.click(screen.getByText('John Doe'));
    expect(screen.getByText('john@example.com')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('john@example.com')).not.toBeInTheDocument();
  });
});
