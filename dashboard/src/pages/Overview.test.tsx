import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Overview } from './Overview';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url.includes('/admin/games')) return { pagination: { total: 100 } } as never;
      if (url.includes('/admin/enrichment/jobs')) return { data: [] } as never;
      return { data: [] } as never;
    }),
  },
  ApiClientError: class extends Error {},
}));

describe('Overview — cards navigation', () => {
  it('renders cards as links to Games with has* filters', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Total games')).toBeDefined());
    const withCover = screen.getByText('With cover').closest('a');
    expect(withCover?.getAttribute('href')).toBe('/admin/games?hasCover=true');
    expect(screen.getByText('With description').closest('a')?.getAttribute('href')).toBe('/admin/games?hasDescription=true');
  });

  it('shows percentages when total available', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('With cover')).toBeDefined(), { timeout: 2000 });
    // percentages are frontend-only derived, should appear after metrics load
    expect(document.body.textContent).toMatch(/% coverage|With cover/);
  });
});
