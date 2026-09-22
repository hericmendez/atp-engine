import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Enrichment } from './Enrichment';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiClientError: class extends Error {
    constructor(public code: string, msg: string, public status: number, public requestId?: string) { super(msg); this.name = 'ApiClientError'; }
  },
}));

describe('Enrichment Start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/admin/enrichment/jobs')) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
      return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } as never;
    });
    mockPost.mockResolvedValue({ data: { id: 'job-123', type: 'cover', mode: 'needs-cover', status: 'RUNNING' } } as never);
  });

  it('Start Enrichment aparece com jobs', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 'job-1', type: 'cover', mode: 'needs-cover', status: 'COMPLETED', progress: { processed: 10, total: 10, percentage: 100, itemsPerSecond: 1, etaSeconds: 0 }, counters: { succeeded: 10, found: 10, persisted: 10, unchanged: 0, failed: 0 }, cursor: '', owner: { id: null, leaseExpiresAt: null, leaseRemainingMs: null, lastHeartbeatAt: null }, timing: { startedAt: null, pausedAt: null, completedAt: null, lastActivityAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }, error: null, message: '' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } as never);
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    expect(await screen.findByText('Start Enrichment')).toBeDefined();
  });

  it('Start Enrichment aparece no empty state', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('No enrichment jobs exist.')).toBeDefined());
    expect(screen.getAllByText('Start Enrichment').length).toBeGreaterThan(0);
  });

  it('modal fechado inicialmente', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Enrichment Jobs')).toBeDefined());
    expect(screen.queryByText('Start Enrichment', { selector: 'h3' })).toBeNull();
  });

  it('clique abre modal', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Enrichment Jobs')).toBeDefined());
    fireEvent.click(screen.getAllByText('Start Enrichment')[0]);
    expect(await screen.findByText('Start Enrichment', { selector: 'h3' })).toBeDefined();
    expect(screen.getByDisplayValue('Cover')).toBeDefined();
  });

  it('type mostra Cover', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    expect(await screen.findByDisplayValue('Cover')).toBeDefined();
  });

  it('limit inicia em 100', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    expect((screen.getByLabelText('Limit') as HTMLInputElement).value).toBe('100');
  });

  it('batch size inicia em 50 quando Advanced aberto', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Advanced options'));
    expect((screen.getByLabelText('Batch size') as HTMLInputElement).value).toBe('50');
  });

  it('Advanced abre/fecha', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    const adv = screen.getByText('Advanced options');
    fireEvent.click(adv);
    expect(screen.getByLabelText('Batch size')).toBeDefined();
  });

  it('limit 0 inválido', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    const limit = screen.getByLabelText('Limit') as HTMLInputElement;
    fireEvent.change(limit, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Limit must be a positive integer')).toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('limit decimal inválido', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.change(screen.getByLabelText('Limit') as HTMLInputElement, { target: { value: '1.5' } });
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Limit must be a positive integer')).toBeDefined();
  });

  it('limit vazio omite campo', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.change(screen.getByLabelText('Limit') as HTMLInputElement, { target: { value: '' } });
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const payload = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.type).toBe('cover');
    expect(payload.batchSize).toBe(50);
    expect(payload.limit).toBeUndefined();
  });

  it('batch size 0 inválido', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Advanced options'));
    fireEvent.change(screen.getByLabelText('Batch size') as HTMLInputElement, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Batch size must be an integer between 1 and 100')).toBeDefined();
  });

  it('batch size 101 inválido', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Advanced options'));
    fireEvent.change(screen.getByLabelText('Batch size') as HTMLInputElement, { target: { value: '101' } });
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Batch size must be an integer between 1 and 100')).toBeDefined();
  });

  it('batch size válido 50', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Advanced options'));
    fireEvent.change(screen.getByLabelText('Batch size') as HTMLInputElement, { target: { value: '50' } });
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });

  it('POST envia payload correto', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.change(screen.getByLabelText('Limit') as HTMLInputElement, { target: { value: '100' } });
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/enrichment/jobs', { type: 'cover', limit: 100, batchSize: 50 }));
  });

  it('limit vazio não é enviado', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.change(screen.getByLabelText('Limit') as HTMLInputElement, { target: { value: '' } });
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const payload = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.limit).toBeUndefined();
  });

  it('submit desabilita botão', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Creating...')).toBeDefined();
    expect((screen.getByText('Creating...') as HTMLButtonElement).disabled).toBe(true);
    resolve({ data: { id: 'job-123' } });
  });

  it('duplo submit não gera duas chamadas', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(screen.getByText('Creating...'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    resolve({ data: { id: 'job-123' } });
  });

  it('400 mostra erro', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('VALIDATION_ERROR', 'Invalid request data', 400, 'req-1'));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Invalid request data')).toBeDefined();
  });

  it('409 mostra já ativo', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('CONFLICT', 'Active job already exists', 409, 'req-2'));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('An enrichment job is already active.')).toBeDefined();
    expect(screen.getByText('View existing jobs')).toBeDefined();
  });

  it('500 mostra erro', async () => {
    const { ApiClientError } = await import('../api/client');
    mockPost.mockRejectedValue(new ApiClientError('INTERNAL_ERROR', 'Internal', 500, 'req-3'));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Internal')).toBeDefined();
  });

  it('network error', async () => {
    mockPost.mockRejectedValue(new Error('Failed to fetch'));
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    expect(await screen.findByText('Failed to fetch')).toBeDefined();
  });

  it('201 navega para /admin/enrichment/:id', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/enrichment/job-123'));
  });

  it('ESC fecha', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    expect(await screen.findByText('Start Enrichment', { selector: 'h3' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Start Enrichment', { selector: 'h3' })).toBeNull());
  });

  it('labels associados', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    expect(screen.getByLabelText('Limit')).toBeDefined();
    expect(screen.getByLabelText('Batch size')).toBeDefined();
  });

  it('foco inicial', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Limit'));
  });

  it('dark mode permanece legível', async () => {
    render(<MemoryRouter><Enrichment /></MemoryRouter>);
    fireEvent.click((await screen.findAllByText('Start Enrichment'))[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.background).toBe('var(--card-bg)');
  });
});
