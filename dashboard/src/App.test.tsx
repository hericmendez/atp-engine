import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './components/Layout';

vi.mock('./api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: { authenticated: true } })),
    post: vi.fn(async () => ({ data: {} })),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number) { super(msg); }
  },
}));

vi.mock('./theme', () => ({
  useTheme: () => ({ theme: 'light', toggle: vi.fn(), setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Admin canonical URL', () => {
  it('Overview NavLink points to /admin/', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/admin/']}>
        <Layout />
      </MemoryRouter>,
    );
    const overviewLink = container.querySelector('a[href="/admin/"]');
    expect(overviewLink).not.toBeNull();
    expect(overviewLink?.textContent).toBe('Overview');
  });

  it('does not contain legacy /admin without slash for Overview', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/admin/']}>
        <Layout />
      </MemoryRouter>,
    );
    const legacy = container.querySelector('a[href="/admin"]:not([href="/admin/"])');
    // Should not have href exactly "/admin" for Overview (only /admin/ is canonical)
    // Filter to Overview link specifically
    const links = Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/admin/');
    expect(links.filter((h) => h === '/admin')).toHaveLength(0);
  });

  it('deep links preserved', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/admin/']}>
        <Layout />
      </MemoryRouter>,
    );
    const links = Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/admin/games');
    expect(links).toContain('/admin/platforms');
    expect(links).toContain('/admin/enrichment');
    expect(links).toContain('/admin/catalog-sync');
  });
});
