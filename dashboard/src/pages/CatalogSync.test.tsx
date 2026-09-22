import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogSync } from './CatalogSync';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  },
  ApiClientError: class extends Error {},
}));

describe('CatalogSync history', () => {
  it('shows empty when no history', async () => {
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('No catalog sync history.')).toBeDefined());
  });

  it('shows contextual empty with filters', async () => {
    render(<MemoryRouter initialEntries={['/admin/catalog-sync?status=failed']}><CatalogSync /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/No catalog syncs match/)).toBeDefined());
  });

  it('renders status filter options', async () => {
    render(<MemoryRouter><CatalogSync /></MemoryRouter>);
    expect(screen.getByDisplayValue('status: all')).toBeDefined();
    expect(screen.getByDisplayValue('trigger: all')).toBeDefined();
  });
});
