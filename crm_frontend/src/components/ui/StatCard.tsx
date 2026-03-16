import clsx from 'clsx';

interface StatCardProps {
  title:    string;
  value:    string | number;
  subtitle?: string;
  icon?:    React.ReactNode;
  trend?:   'up' | 'down' | 'neutral';
  trendValue?: string;
  color?:   'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  className?: string;
}

const COLOR_MAP = {
  blue:   'bg-blue-50   text-blue-600   border-blue-100',
  green:  'bg-green-50  text-green-600  border-green-100',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
  red:    'bg-red-50    text-red-600    border-red-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  gray:   'bg-gray-50   text-gray-600   border-gray-100',
};

const ICON_BG = {
  blue:   'bg-blue-100   text-blue-600',
  green:  'bg-green-100  text-green-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  red:    'bg-red-100    text-red-600',
  purple: 'bg-purple-100 text-purple-600',
  gray:   'bg-gray-100   text-gray-600',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = 'blue',
  className,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white p-5 shadow-sm',
        'hover:shadow-md transition-shadow duration-200',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
          {trendValue && trend && (
            <p
              className={clsx(
                'mt-1 text-xs font-medium',
                trend === 'up'      && 'text-green-600',
                trend === 'down'    && 'text-red-600',
                trend === 'neutral' && 'text-gray-500'
              )}
            >
              {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●'}{' '}
              {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              ICON_BG[color]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
