import React from 'react';

function getPages(current: number, total: number): (number | '…')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 2) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 2, current - 1, current, current + 1, current + 2, '…', total];
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = getPages(page, totalPages);
  return (
    <nav aria-label="Pagination" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={btn}>
        ‹ Previous
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e-${i}`} style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>
            …
          </span>
        ) : (
          <button
            key={p}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p as number)}
            style={{
              ...btn,
              background: p === page ? 'var(--text-primary)' : 'var(--card-border)',
              color: p === page ? 'var(--card-bg)' : 'var(--text-primary)',
            }}
          >
            {p}
          </button>
        ),
      )}
      <button aria-label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)} style={btn}>
        Next ›
      </button>
    </nav>
  );
}

const btn: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--input-border)',
  borderRadius: 6,
  background: 'var(--card-bg)',
  cursor: 'pointer',
  minWidth: 36,
};
