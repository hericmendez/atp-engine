import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Platforms } from './Platforms';

const mockGet = vi.fn();
const mockGetBlob = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    getBlob: (...args: unknown[]) => mockGetBlob(...args),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); }
  },
}));

describe('Platforms Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) {
        return {
          data: [
            { id: 'pc', name: 'PC', company: 'Test', releaseYear: 2020, family: 'PC', type: 'computer', status: 'active', gameCount: 10 },
            { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, family: 'PlayStation', type: 'console', status: 'active', gameCount: 5 },
          ],
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
          origin: 'database',
        } as never;
      }
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    mockGetBlob.mockResolvedValue({ blob: new Blob(['test'], { type: 'text/csv' }), filename: 'atp-pc-games-2026-09-22.csv' });
    // Mock URL and anchor
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('coluna Export aparece', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    expect(await screen.findByText('Export')).toBeDefined();
    expect(screen.getByText('Export').tagName).toBe('TH');
    expect(screen.getByText('Export').getAttribute('scope')).toBe('col');
  });

  it('cada plataforma possui CSV e JSON', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Export')).toBeDefined());
    expect(screen.getAllByLabelText('Export PC as CSV')).toHaveLength(1);
    expect(screen.getAllByLabelText('Export PC as JSON')).toHaveLength(1);
    expect(screen.getByLabelText('Export PlayStation 5 as CSV')).toBeDefined();
  });

  it('headers anteriores permanecem', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Export')).toBeDefined());
    expect(screen.getByText('platformId')).toBeDefined();
    expect(screen.getByText('name')).toBeDefined();
    expect(screen.getByText('gameCount')).toBeDefined();
  });

  it('encodeURIComponent para nomes com espaços', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Export PlayStation 5 as CSV')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Export PlayStation 5 as CSV'));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledWith('/api/v1/platforms/PlayStation%205/games/export?format=csv'));
  });

  it('format csv/json', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Export PC as CSV')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Export PC as CSV'));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledWith(expect.stringContaining('format=csv')));
    vi.clearAllMocks();
    mockGetBlob.mockResolvedValue({ blob: new Blob(['{}'], { type: 'application/json' }), filename: 'atp-pc-games.json' });
    fireEvent.click(screen.getByLabelText('Export PC as JSON'));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalledWith(expect.stringContaining('format=json')));
  });

  it('download cria anchor e revoke', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Export PC as CSV')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Export PC as CSV'));
    await waitFor(() => expect(mockGetBlob).toHaveBeenCalled());
    await waitFor(() => expect(createElementSpy).toHaveBeenCalledWith('a'));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalled());
  });

  it('loading CSV disabled durante CSV', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGetBlob.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Export PC as CSV')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Export PC as CSV'));
    expect((screen.getByLabelText('Export PC as CSV') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Export PC as CSV').getAttribute('aria-busy')).toBe('true');
    // JSON should also be disabled for same platform? Our implementation disables both for same platform
    expect((screen.getByLabelText('Export PC as JSON') as HTMLButtonElement).disabled).toBe(true);
    // Other platform still enabled
    expect((screen.getByLabelText('Export PlayStation 5 as CSV') as HTMLButtonElement).disabled).toBe(false);
    resolve({ blob: new Blob([''], { type: 'text/csv' }), filename: 'a.csv' });
    await waitFor(() => expect((screen.getByLabelText('Export PC as CSV') as HTMLButtonElement).disabled).toBe(false));
  });

  it('erro libera loading e mostra ErrorBox', async () => {
    const { ApiClientError } = await import('../api/client');
    mockGetBlob.mockRejectedValue(new ApiClientError('PLATFORM_NOT_FOUND', 'not found', 404, 'req-1'));
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Export PC as CSV')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Export PC as CSV'));
    await waitFor(() => expect(screen.getByText('not found')).toBeDefined());
    expect((screen.getByLabelText('Export PC as CSV') as HTMLButtonElement).disabled).toBe(false);
  });

  it('acessibilidade scope col e aria-label', async () => {
    render(<MemoryRouter><Platforms /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Export')).toBeDefined());
    expect(screen.getByText('Export').getAttribute('scope')).toBe('col');
    expect(screen.getByLabelText('Export PC as CSV')).toBeDefined();
    expect(screen.getByLabelText('Export PC as JSON')).toBeDefined();
  });
});
