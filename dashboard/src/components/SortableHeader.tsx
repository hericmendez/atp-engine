import React from 'react';

export function SortableHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: string;
  label: string;
  sort: string;
  order: string;
  onSort: (field: string) => void;
}) {
  const isActive = sort === field;
  const ariaSort = isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th aria-sort={ariaSort as never} style={th}>
      <button
        onClick={() => onSort(field)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: isActive ? 700 : 400,
          color: isActive ? 'var(--text-primary)' : 'var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 0,
        }}
        aria-label={`Sort by ${label}${isActive ? ` ${order}` : ''}`}
      >
        {label}
        <span aria-hidden style={{ color: isActive ? 'var(--text-primary)' : '#94a3b8', fontSize: 11 }}>
          {isActive ? (order === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  background: 'var(--bg-soft)',
  fontSize: 12,
  borderBottom: '1px solid var(--card-border)',
};
