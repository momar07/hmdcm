import clsx from 'clsx';
import { forwardRef } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:    string;
  error?:    string;
  options:   SelectOption[];
  placeholder?: string;
  wrapperClass?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, wrapperClass, className, ...props }, ref) => {
    return (
      <div className={clsx('flex flex-col gap-1', wrapperClass)}>
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <select
          ref={ref}
          className={clsx(
            'block w-full rounded-lg border bg-white px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            'transition-colors duration-150',
            error
              ? 'border-red-400 focus:ring-red-400'
              : 'border-gray-300 focus:border-blue-500',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
