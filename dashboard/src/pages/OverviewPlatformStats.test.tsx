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

const STATS = {
  stats: {
    total: 181,
    notEmpty: 58,
    empty: 123,
    byStatus: { active: 46, inactive: 0, discontinued: 135 },
  },
};

function mockDefaults() {
  mockGet.mockImplementation(async (url: string) => {
    if (url.includes('/platforms/summary')) return { data: [], pagination: { page: 1, limit: 1, total: 181, totalPages: 181 }, ...STATS } as never;
    if (url.includes('/admin/games')) return { pagination: { total: 197157 } } as never;
    if (url.includes('/admin/enrichment/jobs')) return { data: [] } as never;
    if (url.includes('/admin/database/stats')) return { data: { dataSize: 0, storageSize: 0, indexSize: 0, totalSize: 0, objects: 0, collections: 0, avgObjSize: 0, collectionsStats: [] } } as never;
    return { data: [] } as never;
  });
}

describe('Overview Platform Stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaults();
  });

  it('games card shows total and In 58 platforms', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('197.157').length).toBeGreaterThan(0));
    expect(screen.getByText('In 58 platforms')).toBeDefined();
    expect(screen.getByText('In 58 platforms').closest('a')?.getAttribute('href')).toBe('/admin/games');
  });

  it('platform card shows 58/181 with status breakdown', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Total platforms')).toBeDefined());
    expect(screen.getByText('58/181')).toBeDefined();
    expect(screen.getByText('not empty / empty')).toBeDefined();
    expect(screen.getByText('Active: 46')).toBeDefined();
    expect(screen.getByText('Discontinued: 135')).toBeDefined();
  });

  it('omits Inactive when zero', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Total platforms')).toBeDefined());
    expect(screen.queryByText('Inactive: 0')).toBeNull();
  });

  it('shows Inactive when non-zero', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) {
        return { data: [], pagination: { page: 1, limit: 1, total: 181, totalPages: 181 }, stats: { total: 181, notEmpty: 58, empty: 123, byStatus: { active: 44, inactive: 3, discontinued: 134 } } } as never;
      }
      if (url.includes('/admin/games')) return { pagination: { total: 197157 } } as never;
      if (url.includes('/admin/enrichment/jobs')) return { data: [] } as never;
      if (url.includes('/admin/database/stats')) return { data: { dataSize: 0, storageSize: 0, indexSize: 0, totalSize: 0, objects: 0, collections: 0, avgObjSize: 0, collectionsStats: [] } } as never;
      return { data: [] } as never;
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Inactive: 3')).toBeDefined());
    expect(screen.getByText('Active: 44')).toBeDefined();
  });

  it('loading does not render false data', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/platforms/summary')) return new Promise((r) => { resolve = r; });
      if (url.includes('/admin/games')) return Promise.resolve({ pagination: { total: 197157 } } as never);
      return Promise.resolve({ data: [] } as never);
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    expect(screen.queryByText('Total platforms')).toBeNull();
    expect(screen.queryByText('0/0')).toBeNull();
    resolve({ data: [], pagination: { page: 1, limit: 1, total: 181, totalPages: 181 }, ...STATS });
    await waitFor(() => expect(screen.getByText('Total platforms')).toBeDefined());
  });

  it('error does not render 0/0 and follows ErrorBox convention', async () => {
    const { ApiClientError } = await import('../api/client');
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/platforms/summary')) throw new ApiClientError('INTERNAL_ERROR', 'Stats failed', 500, 'req-stats-1');
      if (url.includes('/admin/games')) return { pagination: { total: 197157 } } as never;
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Stats failed')).toBeDefined());
    expect(screen.queryByText('0/0')).toBeNull();
    expect(screen.queryByText('Total platforms')).toBeNull();
    // Games section still functional
    expect(screen.getAllByText('197.157').length).toBeGreaterThan(0);
  });
});
