import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size    = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
  icon?:     React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 border-transparent',
  secondary:
    'bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500 border-gray-300',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border-transparent',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-400 border-transparent',
  success:
    'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 border-transparent',
};

const SIZE_STYLES: Record<Size, string> = {
  xs: 'px-2.5 py-1   text-xs gap-1',
  sm: 'px-3   py-1.5 text-sm gap-1.5',
  md: 'px-4   py-2   text-sm gap-2',
  lg: 'px-5   py-2.5 text-base gap-2',
};

export function Button({
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  icon,
  iconRight,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg border font-medium',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current
                         border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
      {iconRight && !loading && (
        <span className="shrink-0">{iconRight}</span>
      )}
    </button>
  );
}
