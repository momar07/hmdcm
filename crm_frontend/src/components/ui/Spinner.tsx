import clsx from 'clsx';

interface SpinnerProps {
  size?:  'sm' | 'md' | 'lg';
  color?: 'blue' | 'white' | 'gray';
  className?: string;
}

const SIZE  = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
const COLOR = {
  blue:  'border-blue-500',
  white: 'border-white',
  gray:  'border-gray-400',
};

export function Spinner({ size = 'md', color = 'blue', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(
        'rounded-full border-2 border-t-transparent animate-spin shrink-0',
        SIZE[size],
        COLOR[color],
        className
      )}
    />
  );
}
