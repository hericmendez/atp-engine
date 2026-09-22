import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';

const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) {
      super(msg);
      this.name = 'ApiClientError';
    }
  },
}));

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { authenticated: true, username: 'admin' } } as never);
  });

  it('renders username/password and Sign in', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByText('Admin Login')).toBeDefined();
    expect(screen.getByPlaceholderText('admin')).toBeDefined();
    expect(screen.getByText('Sign in')).toBeDefined();
  });

  it('submits username/password to /admin/login', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password') as HTMLInputElement, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/login', { username: 'admin', password: 'secret123' }));
  });

  it('prevents double submit', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    const pwd = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(pwd, { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Sign in'));
    expect(await screen.findByText('Signing in…')).toBeDefined();
    fireEvent.click(screen.getByText('Signing in…'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    resolve({ data: { authenticated: true } });
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  });

  it('shows error on 401', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('UNAUTHORIZED', 'Invalid credentials', 401, 'req-1'));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password') as HTMLInputElement, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeDefined());
  });

  it('shows rate limited message on 429', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('RATE_LIMITED', 'Too many', 429, 'req-2'));
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password') as HTMLInputElement, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(screen.getByText('Too many attempts. Try again later.')).toBeDefined());
  });

  it('password initially hidden', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.getByLabelText('Show password')).toBeDefined();
  });

  it('toggle shows and hides password', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'mySecret' } });
    const showBtn = screen.getByLabelText('Show password');
    fireEvent.click(showBtn);
    const textInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(textInput).not.toBeNull();
    expect(textInput.value).toBe('mySecret');
    expect(screen.getByLabelText('Hide password')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Hide password'));
    const pwdAgain = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(pwdAgain).not.toBeNull();
    expect(pwdAgain.value).toBe('mySecret');
    expect(screen.getByLabelText('Show password')).toBeDefined();
  });

  it('toggle button is type button and preserves value on submit', async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(input, { target: { value: 'keepMe' } });
    const btn = screen.getByLabelText('Show password');
    expect(btn.getAttribute('type')).toBe('button');
    fireEvent.click(btn);
    expect(document.querySelector('input[type="text"]')!.getAttribute('value') || (document.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('keepMe');
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/login', { username: 'admin', password: 'keepMe' }));
  });

  it('toggle does not log password', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<MemoryRouter><Login /></MemoryRouter>);
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByLabelText('Show password'));
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('secret123'));
    spy.mockRestore();
  });
});
