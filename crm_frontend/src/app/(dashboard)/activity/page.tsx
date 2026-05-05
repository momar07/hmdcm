'use client';

import { useEffect, useState, useCallback } from 'react';
import { callsApi } from '@/lib/api/calls';

type Event = {
  id: string;
  call: string;
  event_type: string;
  agent_name: string | null;
  agent_id?: string | null;
  ring_duration: number;
  note: string;
  created_at: string;
};

type CurrentUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
};

const EVENT_BADGE: Record<string, string> = {
  offered:       'bg-blue-100 text-blue-700',
  popup_shown:   'bg-indigo-100 text-indigo-700',
  answered:      'bg-green-100 text-green-700',
  rejected:      'bg-red-100 text-red-700',
  dismissed:     'bg-orange-100 text-orange-700',
  timeout:       'bg-yellow-100 text-yellow-800',
  ringhangup:    'bg-pink-100 text-pink-700',
  transfer_init: 'bg-purple-100 text-purple-700',
  hold_started:  'bg-cyan-100 text-cyan-700',
  hold_ended:    'bg-cyan-100 text-cyan-700',
  mute_toggled:  'bg-gray-100 text-gray-700',
};

const EVENT_LABEL: Record<string, string> = {
  offered:       'Offered',
  popup_shown:   'Popup Shown',
  answered:      'Answered',
  rejected:      'Rejected',
  dismissed:     'Dismissed (X)',
  timeout:       'Timeout',
  ringhangup:    'Ring Hangup',
  transfer_init: 'Transfer',
  hold_started:  'On Hold',
  hold_ended:    'Resumed',
  mute_toggled:  'Mute Toggled',
};

export default function ActivityPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [user, setUser]       = useState<CurrentUser | null>(null);
  const [days, setDays]       = useState(1);
  const [eventType, setEventType] = useState('');
  const [scope, setScope]     = useState<'mine' | 'all'>('mine');

  const isSupervisor = user?.role === 'supervisor' || user?.role === 'admin';

  const fetchUser = useCallback(async () => {
    const candidates = ['/api/auth/me/', '/api/users/me/', '/api/me/'];
    for (const url of candidates) {
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          return;
        }
      } catch {}
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = { days };
      if (eventType) params.event_type = eventType;
      if (scope === 'mine' || !isSupervisor) params.agent_id = user.id;
      const res: any = await callsApi.agentActivity(params);
      const data = res?.data ?? res;
      setEvents(Array.isArray(data) ? data : (data?.results ?? []));
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [user, days, eventType, scope, isSupervisor]);

  useEffect(() => { fetchUser(); }, [fetchUser]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  // Group events by call_id for compact display
  const grouped = events.reduce<Record<string, Event[]>>((acc, e) => {
    (acc[e.call] = acc[e.call] || []).push(e);
    return acc;
  }, {});

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Activity</h1>
          <p className="text-sm text-gray-500 mt-1">
            Timeline of your call events — answered, dismissed, rejected, timeouts.
          </p>
        </div>
        <button onClick={fetchEvents} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Period</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Event type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All</option>
            {Object.keys(EVENT_LABEL).map(k => (
              <option key={k} value={k}>{EVENT_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {isSupervisor && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Scope</label>
            <select value={scope} onChange={e => setScope(e.target.value as 'mine'|'all')}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="mine">Just me</option>
              <option value="all">All agents</option>
            </select>
          </div>
        )}
      </div>

      {/* Distribution summary */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <p className="text-xs text-gray-500 mb-2">Distribution ({events.length} events)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([t, n]) => (
              <span key={t} className={`text-xs px-2 py-1 rounded-full ${EVENT_BADGE[t] || 'bg-gray-100 text-gray-700'}`}>
                {EVENT_LABEL[t] || t}: <b>{n}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-gray-500">No events for the selected filters.</p>
      )}

      <div className="space-y-3">
        {Object.entries(grouped).map(([callId, evs]) => (
          <div key={callId} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <a href={`/calls/${callId}`} className="text-xs text-blue-600 hover:underline font-mono">
                Call {callId.slice(0, 8)}
              </a>
              <span className="text-xs text-gray-400">{evs.length} event{evs.length>1?'s':''}</span>
            </div>
            <div className="space-y-2">
              {evs.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 font-mono w-20">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${EVENT_BADGE[e.event_type] || 'bg-gray-100 text-gray-700'}`}>
                    {EVENT_LABEL[e.event_type] || e.event_type}
                  </span>
                  <span className="text-gray-700">{e.agent_name || '—'}</span>
                  {e.ring_duration > 0 && (
                    <span className="text-xs text-gray-400">ring {e.ring_duration}s</span>
                  )}
                  {e.note && <span className="text-xs text-gray-500 truncate flex-1">{e.note}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
