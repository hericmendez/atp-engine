import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Games, badgeType, badgeClass, badgeComp } from './Games';

// Mock api client
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); }
  },
}));

describe('Games — URL state & empty states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders filters and search button', async () => {
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/search \(title\/dev\/pub\)/i)).toBeDefined();
    expect(screen.getByText('Search')).toBeDefined();
    expect(screen.getByText('Clear filters')).toBeDefined();
  });

  it('shows "No games found" without filters and "No games match" with filters', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('No games found.')).toBeDefined());
    unmount();
    render(<MemoryRouter initialEntries={['/admin/games?hasCover=true']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/No games match the selected filters/)).toBeDefined());
  });

  it('pagination shows Prev/Next when data present', async () => {
    const { api } = await import('../api/client');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) return { data: [] } as never;
      return {
        data: [{ id: 'atp-1', titles: [{ value: 'A', type: 'primary' }], releases: [], developers: [], publishers: [], genres: [], externalIdentifiers: [], relationships: [], evidence: [], classification: 'GAME', completeness: 'FOUND_COMPLETE', description: null, cover: null, gameType: null, gameStatus: null, lastEnrichedAt: null, createdAt: null, updatedAt: null } as never],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 2 },
      } as never;
    });
    render(<MemoryRouter initialEntries={['/admin/games']}><Games /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Search')).toBeDefined());
    await waitFor(() => expect(screen.getByLabelText('Previous page')).toBeDefined());
  });

  describe('Games badges dark mode contrast', () => {
    it('gameType uses #e0f2fe and dark text', () => {
      expect(badgeType('PORT')).toEqual(expect.objectContaining({ background: '#e0f2fe', color: '#0f172a' }));
      expect(badgeType(null)).toEqual({});
    });
    it('classification GAME uses #dcfce7 and dark text', () => {
      expect(badgeClass('GAME')).toEqual(expect.objectContaining({ background: '#dcfce7', color: '#0f172a' }));
    });
    it('classification UNKNOWN preserves var(--bg-soft) and adaptive text', () => {
      expect(badgeClass('UNKNOWN')).toEqual(expect.objectContaining({ background: 'var(--bg-soft)', color: 'var(--text-primary)' }));
    });
    it('classification other uses #fef9c3 and dark text', () => {
      expect(badgeClass('DLC')).toEqual(expect.objectContaining({ background: '#fef9c3', color: '#0f172a' }));
      expect(badgeClass('MOVIE')).toEqual(expect.objectContaining({ background: '#fef9c3', color: '#0f172a' }));
    });
    it('completeness FOUND_COMPLETE uses #dcfce7 and dark text', () => {
      expect(badgeComp('FOUND_COMPLETE')).toEqual(expect.objectContaining({ background: '#dcfce7', color: '#0f172a' }));
    });
    it('completeness NOT_FOUND uses #fee2e2 and dark text', () => {
      expect(badgeComp('NOT_FOUND')).toEqual(expect.objectContaining({ background: '#fee2e2', color: '#0f172a' }));
    });
    it('completeness other uses #fef9c3 and dark text', () => {
      expect(badgeComp('FOUND_PARTIAL')).toEqual(expect.objectContaining({ background: '#fef9c3', color: '#0f172a' }));
      expect(badgeComp('FOUND_SUFFICIENT')).toEqual(expect.objectContaining({ background: '#fef9c3', color: '#0f172a' }));
    });
  });
});
