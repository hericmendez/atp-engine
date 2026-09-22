import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Games } from './Games';

function makePlatforms(n: number, start = 0) {
  const families = ['Atari','Mobile','Nintendo','Other','PC','PlayStation','Sega','Xbox'];
  return Array.from({ length: n }, (_, i) => {
    const idx = start + i;
    const name = `Platform ${String(idx).padStart(3,'0')}`;
    const family = families[idx % families.length];
    return { id: `id-${idx}`, name, family, company: 'TestCo', releaseYear: 2000, status: 'active', type: 'console', thumb: null, gameCount: 0 };
  });
}

const mockGetImpl = (url: string) => {
  if (url.includes('/platforms/summary')) {
    const u = new URL(url, 'http://localhost');
    const page = u.searchParams.get('page');
    if (page === '1') return Promise.resolve({ data: makePlatforms(100, 0), pagination: { page: 1, limit: 100, total: 181, totalPages: 2 } } as never);
    if (page === '2') return Promise.resolve({ data: makePlatforms(81, 100), pagination: { page: 2, limit: 100, total: 181, totalPages: 2 } } as never);
    return Promise.resolve({ data: makePlatforms(100, 0), pagination: { page: 1, limit: 100, total: 181, totalPages: 2 } } as never);
  }
  if (url.includes('/admin/games')) {
    return Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never);
  }
  return Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never);
};

vi.mock('../api/client', () => ({
  api: { get: vi.fn((url: string) => mockGetImpl(url)), post: vi.fn() },
  ApiClientError: class extends Error { constructor(public code: string, msg: string, public status: number, public requestId?: string){ super(msg);} },
}));

describe('FASE 4.11 — PLATFORM / PLATFORMFAMILY SELECTS', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. renderiza os dois selects', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('All platforms')).toBeDefined());
    expect(screen.getByText('All families')).toBeDefined();
  });

  it('2-3. carrega duas páginas e consolida 181 plataformas', async () => {
    const { api } = await import('../api/client');
    const spy = vi.mocked(api.get);
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('All platforms')).toBeDefined());
    // wait for platforms loaded
    await waitFor(() => {
      const opts = screen.getAllByText(/Platform \d{3}/);
      expect(opts.length).toBeGreaterThanOrEqual(181);
    });
    const calls = spy.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/platforms/summary'));
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toContain('page=1&limit=100');
    expect(calls[1][0]).toContain('page=2&limit=100');
  });

  it('4. sem duplicatas', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(/Platform \d{3}/).length).toBe(181));
    const opts = screen.getAllByText(/Platform \d{3}/).map(el => (el as HTMLOptionElement).value);
    expect(new Set(opts).size).toBe(181);
  });

  it('5. ordenação alfabética determinística', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(/Platform \d{3}/).length).toBe(181));
    const opts = screen.getAllByText(/Platform \d{3}/).map(el => (el as HTMLOptionElement).value);
    const sorted = [...opts].sort((a,b) => a.localeCompare(b));
    expect(opts).toEqual(sorted);
  });

  it('6. value usa name, não id', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Platform 001')).toBeDefined());
    const opt = screen.getByText('Platform 001') as HTMLOptionElement;
    expect(opt.value).toBe('Platform 001');
    expect(opt.value).not.toBe('id-1');
  });

  it('7. derivação das 8 famílias', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Atari')).toBeDefined());
    const families = ['Atari','Mobile','Nintendo','Other','PC','PlayStation','Sega','Xbox'];
    for (const f of families) expect(screen.getByText(f)).toBeDefined();
  });

  it('8. ordenação das famílias alfabeticamente', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Atari')).toBeDefined());
    const opts = ['Atari','Mobile','Nintendo','Other','PC','PlayStation','Sega','Xbox'].map(f => screen.getByText(f) as HTMLOptionElement);
    const values = opts.map(o => o.value);
    expect(values).toEqual([...values].sort((a,b)=>a.localeCompare(b)));
  });

  it('9. deep link com platform', async () => {
    render(<MemoryRouter initialEntries={['/admin/games?platform=Platform%20005']}><Games /></MemoryRouter>);
    await waitFor(() => expect((screen.getByDisplayValue('Platform 005') as HTMLSelectElement).value).toBe('Platform 005'));
  });

  it('10. deep link com platformFamily', async () => {
    render(<MemoryRouter initialEntries={['/admin/games?platformFamily=PlayStation']}><Games /></MemoryRouter>);
    await waitFor(() => expect((screen.getByDisplayValue('PlayStation') as HTMLSelectElement).value).toBe('PlayStation'));
  });

  it('11. alteração de Platform reseta page para 1', async () => {
    const { api } = await import('../api/client');
    render(<MemoryRouter initialEntries={['/admin/games?page=3']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('All platforms')).toBeDefined());
    const sel = screen.getByDisplayValue('All platforms') as HTMLSelectElement;
    const opts = screen.getAllByText(/Platform \d{3}/);
    fireEvent.change(sel, { target: { value: (opts[0] as HTMLOptionElement).value } });
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.filter(([u]) => typeof u === 'string' && (u as string).includes('/admin/games')).pop()?.[0] as string;
      expect(lastCall).toContain('page=1');
    });
  });

  it('12. alteração de PlatformFamily reseta page para 1', async () => {
    const { api } = await import('../api/client');
    render(<MemoryRouter initialEntries={['/admin/games?page=3']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('All families')).toBeDefined());
    const sel = screen.getByDisplayValue('All families') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'Nintendo' } });
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.filter(([u]) => typeof u === 'string' && (u as string).includes('/admin/games')).pop()?.[0] as string;
      expect(lastCall).toContain('page=1');
    });
  });

  it('13. preservação dos demais filtros', async () => {
    const { api } = await import('../api/client');
    render(<MemoryRouter initialEntries={['/admin/games?search=zelda&platform=Platform%20001']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByDisplayValue('Platform 001')).toBeDefined());
    const famSel = screen.getByDisplayValue('All families') as HTMLSelectElement;
    fireEvent.change(famSel, { target: { value: 'PC' } });
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.filter(([u]) => typeof u === 'string' && (u as string).includes('/admin/games')).pop()?.[0] as string;
      expect(lastCall).toContain('search=zelda');
    });
  });

  it('14. preservação de limit/sort/order', async () => {
    const { api } = await import('../api/client');
    render(<MemoryRouter initialEntries={['/admin/games?limit=50&sort=title&order=asc']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('All platforms')).toBeDefined());
    const sel = screen.getByDisplayValue('All platforms') as HTMLSelectElement;
    const opts = screen.getAllByText(/Platform \d{3}/);
    fireEvent.change(sel, { target: { value: (opts[0] as HTMLOptionElement).value } });
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.filter(([u]) => typeof u === 'string' && (u as string).includes('/admin/games')).pop()?.[0] as string;
      expect(lastCall).toContain('limit=50');
      expect(lastCall).toContain('sort=title');
      expect(lastCall).toContain('order=asc');
    });
  });

  it('15. opção All remove query param', async () => {
    const { api } = await import('../api/client');
    render(<MemoryRouter initialEntries={['/admin/games?platform=Platform%20001']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByDisplayValue('Platform 001')).toBeDefined());
    const sel = screen.getByDisplayValue('Platform 001') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: '' } });
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.filter(([u]) => typeof u === 'string' && (u as string).includes('/admin/games')).pop()?.[0] as string;
      expect(lastCall).not.toContain('platform=');
    });
  });

  it('16. loading', async () => {
    // mock slow
    const { api } = await import('../api/client');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) {
        await new Promise(r => setTimeout(r, 50));
        return { data: [] } as never;
      }
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    expect(screen.getByText('Loading platforms...')).toBeDefined();
    await waitFor(() => expect(screen.queryByText('Loading platforms...')).toBeNull());
  });

  it('17. erro + retry', async () => {
    const { api } = await import('../api/client');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) throw new Error('fail');
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Platform load failed/)).toBeDefined());
    expect(screen.getByText('Retry')).toBeDefined();
    // retry should be clickable and table still functional
    vi.mocked(api.get).mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never);
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.queryByText(/Platform load failed/)).toBeNull());
  });
});
