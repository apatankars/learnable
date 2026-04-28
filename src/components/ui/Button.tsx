import type { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const variants: Record<Variant, string> = {
  primary: 'bg-leaf-500 hover:bg-leaf-600 text-white shadow-md hover:shadow-lg border border-leaf-600',
  secondary: 'bg-bark-100 hover:bg-bark-200 text-bark-800 border border-bark-300',
  ghost: 'bg-transparent hover:bg-leaf-50 text-leaf-700 border border-leaf-200',
  danger: 'bg-red-500 hover:bg-red-600 text-white border border-red-600',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
};

export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`
        font-dm font-medium rounded-lg transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-95 cursor-pointer
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
