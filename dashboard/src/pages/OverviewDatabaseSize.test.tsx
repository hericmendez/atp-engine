import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); }
  },
}));

import { Overview } from './Overview';

describe('Overview Database Size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock all other Overview fetches to avoid real calls
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/admin/database/stats')) {
        return { data: { dataSize: 12345678, storageSize: 14500000, indexSize: 2345678, totalSize: 14691356, objects: 196449, collections: 8, avgObjSize: 62, collectionsStats: [] } } as never;
      }
      if (url.includes('/admin/games')) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
      if (url.includes('/admin/enrichment/jobs')) return { data: [] } as never;
      if (url.includes('/platforms/summary')) return { data: [] } as never;
      return { data: [] } as never;
    });
  });

  it('loading', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/admin/database/stats')) return new Promise((r) => { resolve = r; });
      return Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never);
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    expect(screen.getByText('Database — storage')).toBeDefined();
    // Loading shows via Loading component
    expect(await screen.findByText('Loading…')).toBeDefined();
    resolve({ data: { dataSize: 0, storageSize: 0, indexSize: 0, totalSize: 0, objects: 0, collections: 0, avgObjSize: 0, collectionsStats: [] } });
  });

  it('sucesso mostra Data, Allocated, Indexes, Documents', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Database — storage')).toBeDefined());
    expect(screen.getAllByText('Data').length).toBeGreaterThan(0);
    expect(screen.getByText('Allocated')).toBeDefined();
    expect(screen.getByText('Indexes')).toBeDefined();
    expect(screen.getByText('Documents')).toBeDefined();
    // Formatted values
    expect(screen.getByText('11.8 MB')).toBeDefined(); // dataSize 12345678 ~ 11.8 MB
    expect(screen.getByText(/196/)).toBeDefined();
  });

  it('erro mostra ErrorBox', async () => {
    const { ApiClientError } = await import('../api/client');
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/admin/database/stats')) throw new ApiClientError('DATABASE_STATS_ERROR', 'Failed', 500, 'req-1');
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Failed')).toBeDefined());
  });

  it('valores formatados', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/admin/database/stats')) return { data: { dataSize: 1024 * 1024 * 1024, storageSize: 2 * 1024 * 1024 * 1024, indexSize: 500000, totalSize: 1024 * 1024 * 1024 + 500000, objects: 1000, collections: 5, avgObjSize: 100, collectionsStats: [] } } as never;
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('1.00 GB')).toBeDefined());
  });

  it('Updated, caso implementado', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Updated/)).toBeDefined());
  });
});
