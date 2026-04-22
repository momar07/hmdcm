'use client';
import type { TimelineEvent } from '@/types/leads';

interface Props { events: TimelineEvent[] }

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  call:      { icon: '📞', color: 'bg-blue-100 border-blue-300',    label: 'Call'      },
  followup:  { icon: '📅', color: 'bg-yellow-100 border-yellow-300',label: 'Follow-up' },
  note:      { icon: '📝', color: 'bg-gray-100 border-gray-300',    label: 'Note'      },
  task:      { icon: '✅', color: 'bg-purple-100 border-purple-300', label: 'Task'      },
  quotation: { icon: '📄', color: 'bg-green-100 border-green-300',  label: 'Quotation' },
  event:     { icon: '🔔', color: 'bg-orange-100 border-orange-300',label: 'Event'     },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-EG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EventCard({ ev }: { ev: TimelineEvent }) {
  const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.event;
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${cfg.color}`}>
      <span className="text-xl flex-shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {cfg.label} {ev.subtype ? `· ${ev.subtype}` : ''}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(ev.date)}</span>
        </div>
        {ev.title && <p className="text-sm font-medium text-gray-800 mt-0.5">{ev.title}</p>}
        {ev.note  && <p className="text-sm text-gray-600 mt-0.5">{ev.note}</p>}
        {ev.actor && <p className="text-xs text-gray-400 mt-1">by {ev.actor}</p>}
        {ev.duration !== undefined && (
          <p className="text-xs text-gray-500 mt-1">Duration: {ev.duration}s</p>
        )}
        {ev.amount && (
          <p className="text-xs text-green-700 mt-1 font-medium">Amount: {ev.amount} EGP</p>
        )}
      </div>
    </div>
  );
}

export default function LeadTimeline({ events }: Props) {
  if (!events.length) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-2">📭</p>
        <p className="text-sm">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((ev, i) => (
        <EventCard key={i} ev={ev} />
      ))}
    </div>
  );
}
