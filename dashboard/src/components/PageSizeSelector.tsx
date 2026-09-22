import React from 'react';

const OPTIONS = [10, 20, 30, 50, 100] as const;

export function PageSizeSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      Rows per page:
      <select
        aria-label="Rows per page"
        value={String(value)}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ padding: '6px 8px', border: '1px solid var(--input-border)', borderRadius: 6 }}
      >
        {OPTIONS.map((o) => (
          <option key={o} value={String(o)}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
