import type { InputHTMLAttributes, ReactNode } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
}

export function TextField({ label, name, error, id, ...props }: TextFieldProps) {
  const inputId = id ?? `field-${name}`;
  const errorId = `${inputId}-error`;
  return (
    <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
      <label htmlFor={inputId} style={{ fontSize: 14, fontWeight: 600 }}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={{ padding: '8px 10px', border: '1px solid #c9d1d9', borderRadius: 6, fontSize: 16 }}
        {...props}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ color: '#cf222e', fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function FormMessage({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success';
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        background: kind === 'error' ? '#ffebe9' : '#dafbe1',
        color: kind === 'error' ? '#82071e' : '#116329',
        fontSize: 14,
      }}
    >
      {children}
    </p>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{title}</h1>
      {children}
    </main>
  );
}
