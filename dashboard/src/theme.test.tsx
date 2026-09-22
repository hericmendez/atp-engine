import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, STORAGE_KEY, useTheme } from './theme';

function ThemeProbe() {
  const { theme, toggle } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        toggle
      </button>
      <div data-testid="isDark">{document.documentElement.classList.contains('dark') ? 'dark' : 'light'}</div>
    </div>
  );
}

describe('Theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    // @ts-ignore
    delete document.documentElement.dataset.theme;
  });

  it('defaults to light and applies', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies saved light preference', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('applies saved dark preference', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggle changes theme', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggle persists in localStorage', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    fireEvent.click(screen.getByText('toggle'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    fireEvent.click(screen.getByText('toggle'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('reload recovers dark preference', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const { unmount } = render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    unmount();
    // Simulate reload: new provider reads same localStorage
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('invalid preference safely falls back to light', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid' as unknown as string);
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    // Should not be invalid, should be light (or prefers-color-scheme)
    const t = screen.getByTestId('theme').textContent;
    expect(['light', 'dark']).toContain(t);
    // Not crash, class matches theme
    expect(document.documentElement.dataset.theme).toBe(t);
  });

  it('toggle has accessible aria-label', () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(screen.getByLabelText('Switch to dark mode')).toBeDefined();
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByLabelText('Switch to light mode')).toBeDefined();
  });

  it('does not break with no localStorage', () => {
    const orig = localStorage.getItem;
    // @ts-ignore
    localStorage.getItem = () => { throw new Error('no storage'); };
    expect(() => render(<ThemeProvider><ThemeProbe /></ThemeProvider>)).not.toThrow();
    // @ts-ignore
    localStorage.getItem = orig;
  });
});
