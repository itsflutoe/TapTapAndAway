import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  right?: ReactNode;
  left?: ReactNode;
}

export default function PageHeader({ title, left, right }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div style={{ justifySelf: 'start', minWidth: 0 }}>{left}</div>
      <h1>{title}</h1>
      <div style={{ justifySelf: 'end', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
      </div>
    </header>
  );
}
