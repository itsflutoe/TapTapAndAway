import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Optional right-side content (e.g. badge) — keeps title optically centered */
  right?: ReactNode;
  /** Optional left-side content (e.g. back link) */
  left?: ReactNode;
}

/**
 * Centered top title. Left/right slots balance each other so the title stays middle.
 */
export default function PageHeader({ title, left, right }: PageHeaderProps) {
  return (
    <header
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        marginBottom: 16,
        minHeight: 36,
        gap: 8,
      }}
    >
      <div style={{ justifySelf: 'start', minWidth: 0 }}>{left}</div>
      <h1
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: -0.3,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
      <div style={{ justifySelf: 'end', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
      </div>
    </header>
  );
}
