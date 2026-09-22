import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogSync } from './CatalogSync';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); }
  },
}));

describe('CatalogSync Trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never);
    mockPost.mockResolvedValue({ data: { historyId: 'h1', status: 'completed', totals: { candidatesFound: 2, newGames: 1, existingGames: 0, updatedGames: 0, rejected: 1, errors: 0 }, durationMs: 123, dryRun: false } } as never);
  });

  it('renders Start Sync and Advanced', async () => {
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    expect(screen.getByText('Start Sync')).toBeDefined();
  });

  it('opens modal and cancel does not POST', async () => {
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(screen.getByText(/Start Catalog Sync\?/)).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('default Start Sync sends activeOnly true with dates', async () => {
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(await screen.findByText('Start', { selector: 'button' })).toBeDefined();
    fireEvent.click(screen.getByText('Start', { selector: 'button' }));
    expect(await screen.findByText('Confirm Start')).toBeDefined();
    fireEvent.click(screen.getByText('Confirm Start'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.activeOnly).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.from).toBeDefined();
    expect(body.to).toBeDefined();
  });

  it('Advanced with platforms and dryRun', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) return { data: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }] } as never;
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    fireEvent.click(screen.getByText('Advanced options'));
    // uncheck activeOnly
    const activeOnly = screen.getByLabelText(/Active only/) as HTMLInputElement;
    fireEvent.click(activeOnly);
    await waitFor(() => expect(screen.getByText('P1')).toBeDefined());
    // click checkbox for P1 (first checkbox after activeOnly)
    const checkboxes = screen.getAllByRole('checkbox');
    // checkboxes: [activeOnly, P1, P2, Dry run] — P1 is second
    fireEvent.click(checkboxes[1]);
    // dryRun
    fireEvent.click(screen.getByLabelText('Dry run'));
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.activeOnly).toBeUndefined();
    expect(body.platforms).toEqual(['p1']);
    expect(body.dryRun).toBe(true);
  });

  it('prevents double submit', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(await screen.findByText('Start', { selector: 'button' })).toBeDefined();
    fireEvent.click(screen.getByText('Start', { selector: 'button' }));
    expect(await screen.findByText('Confirm Start')).toBeDefined();
    fireEvent.click(screen.getByText('Confirm Start'));
    expect(await screen.findByText('Starting…')).toBeDefined();
    fireEvent.click(screen.getByText('Starting…'));
    // second click while submitting should not call again
    expect(mockPost).toHaveBeenCalledTimes(1);
    resolve({ data: { historyId: 'h1', status: 'completed', totals: { candidatesFound: 0, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 0, errors: 0 }, durationMs: 0, dryRun: false } });
    await waitFor(() => expect(screen.queryByText('Starting…')).toBeNull());
  });

  it('dryRun shows inline DRY RUN, not navigate', async () => {
    mockPost.mockResolvedValue({ data: { historyId: undefined, status: 'completed', totals: { candidatesFound: 5, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 5, errors: 0 }, durationMs: 100, dryRun: true } } as never);
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    // set dryRun via advanced
    fireEvent.click(screen.getByText('Advanced options'));
    fireEvent.click(screen.getByLabelText('Dry run'));
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByText(/DRY RUN/)).toBeDefined());
    expect(screen.queryByText(/View running syncs/)).toBeNull();
  });

  it('409 shows friendly and link', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('CONFLICT', 'Catalog sync already running', 409, 'req-1'));
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(await screen.findByText('Start', { selector: 'button' })).toBeDefined();
    fireEvent.click(screen.getByText('Start', { selector: 'button' }));
    expect(await screen.findByText('Confirm Start')).toBeDefined();
    fireEvent.click(screen.getByText('Confirm Start'));
    await waitFor(() => expect(screen.getByText(/already running/)).toBeDefined());
    expect(screen.getByText(/View running syncs/).getAttribute('href')).toBe('/admin/catalog-sync?status=running');
  });

  it('400 validation preserves form', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('VALIDATION_ERROR', 'From date must be before', 400, 'req-2'));
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(await screen.findByText('Start', { selector: 'button' })).toBeDefined();
    fireEvent.click(screen.getByText('Start', { selector: 'button' }));
    expect(await screen.findByText('Confirm Start')).toBeDefined();
    fireEvent.click(screen.getByText('Confirm Start'));
    await waitFor(() => expect(screen.getByText(/From date must be before/)).toBeDefined());
    // modal still open
    expect(screen.getByText('Start Catalog Sync?')).toBeDefined();
  });

  it('500 shows ErrorBox', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('INTERNAL_ERROR', 'Internal', 500, 'req-3'));
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    fireEvent.click(screen.getByText('Start Sync'));
    expect(await screen.findByText('Start', { selector: 'button' })).toBeDefined();
    fireEvent.click(screen.getByText('Start', { selector: 'button' }));
    expect(await screen.findByText('Confirm Start')).toBeDefined();
    fireEvent.click(screen.getByText('Confirm Start'));
    await waitFor(() => expect(screen.getByText('Internal')).toBeDefined());
  });
});
