import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Platforms } from './Platforms';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  },
  ApiClientError: class extends Error {},
}));

describe('Platforms — URL state', () => {
  it('reads sort/order/showEmpty from URL', async () => {
    const { api } = await import('../api/client');
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Test Platform', company: 'TestCo', releaseYear: 2020, status: 'active', family: null, type: 'console', thumb: null, gameCount: 5 }],
      pagination: { page: 2, limit: 20, total: 1, totalPages: 1 },
    } as never);
    render(
      <MemoryRouter initialEntries={['/admin/platforms?sort=gameCount&order=desc&showEmptyPlatforms=true&page=2']}>
        <Platforms />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Platforms')).toBeDefined());
    // Sortable header for gameCount should be active with descending
    await waitFor(() => expect(screen.getByText(/gameCount/)).toBeDefined());
    const header = screen.getByText(/gameCount/);
    expect(header.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByDisplayValue('show empty')).toBeDefined();
  });

  it('shows contextual empty when filters active', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/platforms?companyName=NonexistentXYZ']}><Platforms /></MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No platforms match/)).toBeDefined());
  });

  it('shows generic empty without filters', async () => {
    render(<MemoryRouter initialEntries={['/admin/platforms']}><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/No platforms found/)).toBeDefined());
  });
});
