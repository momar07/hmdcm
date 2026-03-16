import clsx from 'clsx';

type Status =
  | 'available' | 'busy' | 'away' | 'offline' | 'on_call'
  | 'ringing'   | 'answered' | 'no_answer' | 'busy_call'
  | 'failed'    | 'voicemail'
  | 'pending'   | 'completed' | 'cancelled' | 'rescheduled'
  | 'active'    | 'draft'     | 'paused';

const STYLES: Record<string, string> = {
  available:   'bg-green-100  text-green-800',
  busy:        'bg-yellow-100 text-yellow-800',
  away:        'bg-orange-100 text-orange-800',
  offline:     'bg-gray-100   text-gray-600',
  on_call:     'bg-blue-100   text-blue-800',
  ringing:     'bg-yellow-100 text-yellow-800',
  answered:    'bg-green-100  text-green-800',
  no_answer:   'bg-red-100    text-red-700',
  busy_call:   'bg-orange-100 text-orange-800',
  failed:      'bg-red-100    text-red-700',
  voicemail:   'bg-purple-100 text-purple-800',
  pending:     'bg-yellow-100 text-yellow-800',
  completed:   'bg-green-100  text-green-800',
  cancelled:   'bg-red-100    text-red-700',
  rescheduled: 'bg-blue-100   text-blue-800',
  active:      'bg-green-100  text-green-800',
  draft:       'bg-gray-100   text-gray-600',
  paused:      'bg-orange-100 text-orange-800',
};

interface Props {
  status:  string;
  label?:  string;
  size?:   'xs' | 'sm' | 'md';
  dot?:    boolean;
}

export function StatusBadge({ status, label, size = 'sm', dot = false }: Props) {
  const style = STYLES[status] ?? 'bg-gray-100 text-gray-600';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'xs' && 'px-1.5 py-0.5 text-xs',
        size === 'sm' && 'px-2   py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1   text-sm',
        style
      )}
    >
      {dot && (
        <span
          className={clsx(
            'rounded-full',
            size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5',
            status === 'available' || status === 'answered' || status === 'completed'
              ? 'bg-green-500'
              : status === 'offline' || status === 'cancelled' || status === 'failed'
              ? 'bg-red-500'
              : 'bg-yellow-500'
          )}
        />
      )}
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}

export default StatusBadge;
