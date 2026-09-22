import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GameDetail } from './GameDetail';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); this.name = 'ApiClientError'; }
  },
}));

describe('GameDetail', () => {
  it('shows DATA QUALITY derived from DTO', async () => {
    const fakeGame = {
      id: 'atp-igdb-1',
      titles: [{ value: 'Test Game', type: 'primary' }],
      releases: [],
      developers: [{ name: 'Dev' }],
      publishers: [],
      genres: [{ name: 'Action' }],
      externalIdentifiers: [],
      relationships: [{ sourceGameId: 'atp-igdb-1', targetGameId: 'atp-igdb-2', type: 'REMAKE' }],
      evidence: [{ source: 'igdb', externalId: '1', retrievedAt: new Date().toISOString(), rawTitle: 'Raw Title' }],
      classification: 'GAME',
      completeness: 'FOUND_COMPLETE',
      description: 'Desc',
      cover: { url: 'https://cdn.test/a.jpg', source: 'igdb', sourceId: '1', width: 200, height: 300, type: 'unknown' },
      gameType: 'main_game',
      gameStatus: null,
      lastEnrichedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { api } = await import('../api/client');
    vi.mocked(api.get).mockResolvedValueOnce({ data: fakeGame } as never);

    render(
      <MemoryRouter initialEntries={['/admin/games/atp-igdb-1']}>
        <Routes><Route path="/admin/games/:id" element={<GameDetail />} /></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('DATA QUALITY')).toBeDefined());
    expect(screen.getByText('Description')).toBeDefined();
    // hasPublishers false → ✗
    const qualitySection = screen.getByText('DATA QUALITY').parentElement!.textContent!;
    expect(qualitySection).toContain('✓ Description');
    expect(qualitySection).toContain('✗ Publishers');
    expect(screen.getByText(/REMAKE/)).toBeDefined();
    expect(screen.getByText(/igdb:1/)).toBeDefined();
    expect(screen.getByText(/Raw Title/)).toBeDefined();
  });

  it('shows not found for 404', async () => {
    const { api } = await import('../api/client');
    const { ApiClientError } = await import('../api/client');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiClientError('NOT_FOUND', 'Game not found', 404, 'req-123'));
    render(
      <MemoryRouter initialEntries={['/admin/games/missing']}>
        <Routes><Route path="/admin/games/:id" element={<GameDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Game not found/)).toBeDefined());
  });
});
