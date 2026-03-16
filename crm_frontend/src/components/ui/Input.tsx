import clsx from 'clsx';
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:      string;
  error?:      string;
  helperText?: string;
  leftIcon?:   React.ReactNode;
  rightIcon?:  React.ReactNode;
  wrapperClass?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, wrapperClass, className, ...props }, ref) => {
    return (
      <div className={clsx('flex flex-col gap-1', wrapperClass)}>
        {label && (
          <label className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute inset-y-0 left-3 flex items-center
                             text-gray-400 pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={clsx(
              'block w-full rounded-lg border text-sm',
              'placeholder-gray-400 bg-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'transition-colors duration-150',
              error
                ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                : 'border-gray-300 focus:border-blue-500',
              leftIcon  ? 'pl-9' : 'pl-3',
              rightIcon ? 'pr-9' : 'pr-3',
              'py-2',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute inset-y-0 right-3 flex items-center
                             text-gray-400">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
