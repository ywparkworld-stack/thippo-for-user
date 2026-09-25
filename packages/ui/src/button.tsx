import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

const styles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: { background: '#1f6feb', color: '#fff' },
  secondary: { background: '#eef1f5', color: '#1f2328' },
  danger: { background: '#cf222e', color: '#fff' },
};

export function Button({ variant = 'primary', style, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      style={{
        border: 0,
        borderRadius: 6,
        padding: '8px 16px',
        cursor: 'pointer',
        ...styles[variant],
        ...style,
      }}
      {...props}
    />
  );
}
