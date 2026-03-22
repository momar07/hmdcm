'use client';

import { useParams, useRouter }   from 'next/navigation';
import { useQuery }                from '@tanstack/react-query';
import { useState }                from 'react';
import {
  ArrowLeft, Phone, Mail, Building2, MapPin,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  FileText, MessageSquare, TrendingUp, Clock,
} from 'lucide-react';
import { customersApi } from '@/lib/api/customers';
import { callsApi }     from '@/lib/api/calls';
import { leadsApi }     from '@/lib/api/leads';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import { Spinner }      from '@/components/ui/Spinner';
import api              from '@/lib/api/axios';

function formatDuration(s: number) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function timeAgo(dateStr: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

type Tab = 'timeline' | 'calls' | 'leads';

export default function CustomerDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [tab, setTab] = useState<Tab>('timeline');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn:  () => customersApi.get(id).then(r => r.data),
  });

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ['customer-history', id],
    queryFn:  () => api.get(`/customers/${id}/history/`).then(r => r.data),
    enabled:  !!id && tab === 'timeline',
  });

  const { data: callsData } = useQuery({
    queryKey: ['customer-calls', id],
    queryFn:  () => callsApi.list({ customer: id, page_size: 25 }).then(r => r.data),
    enabled:  !!id && tab === 'calls',
  });

  const { data: leadsData } = useQuery({
    queryKey: ['customer-leads', id],
    queryFn:  () => leadsApi.list({ customer: id, page_size: 25 }).then(r => r.data),
    enabled:  !!id && tab === 'leads',
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!customer) return <div className="text-center py-20 text-gray-400">Customer not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <PageHeader
        title={`${customer.first_name} ${customer.last_name}`}
        subtitle={customer.company || 'No company'}
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>Back</Button>
        }
      />

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customer.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={16} className="text-gray-400" />{customer.email}
            </div>
          )}
          {customer.company && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 size={16} className="text-gray-400" />{customer.company}
            </div>
          )}
          {(customer.city || customer.country) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-gray-400" />
              {[customer.city, customer.country].filter(Boolean).join(', ')}
            </div>
          )}
          <StatusBadge
            status={customer.is_active ? 'active' : 'offline'}
            label={customer.is_active ? 'Active' : 'Inactive'} dot
          />
        </div>

        {/* Phones */}
        {customer.phones?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Phone Numbers</p>
            <div className="flex flex-wrap gap-2">
              {customer.phones.map((ph: any) => (
                <div key={ph.id} className="flex items-center gap-1.5 bg-gray-50 border
                             border-gray-200 rounded-lg px-3 py-1.5">
                  <Phone size={13} className="text-gray-400" />
                  <span className="font-mono text-sm">{ph.number}</span>
                  <span className="text-xs text-gray-400">({ph.phone_type})</span>
                  {ph.is_primary && (
                    <span className="text-xs bg-blue-100 text-blue-700 rounded px-1 font-medium">Primary</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { key: 'timeline', label: 'Timeline',  icon: <Clock size={14}/> },
          { key: 'calls',    label: 'Calls',     icon: <Phone size={14}/> },
          { key: 'leads',    label: 'Leads',     icon: <TrendingUp size={14}/> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TIMELINE TAB ──────────────────────────────────────────────── */}
      {tab === 'timeline' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Customer History
              {historyData?.count !== undefined && (
                <span className="ml-2 text-gray-400 font-normal">({historyData.count} events)</span>
              )}
            </h3>
          </div>
          {histLoading && <div className="flex justify-center py-10"><Spinner /></div>}
          {!histLoading && !historyData?.results?.length && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No history yet.</p>
          )}
          <div className="divide-y divide-gray-50">
            {historyData?.results?.map((item: any, idx: number) => (
              <div key={`${item.type}-${item.id}-${idx}`} className="px-5 py-4 flex gap-4">

                {/* Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
                  ${item.type === 'call'
                    ? item.status === 'no_answer' ? 'bg-red-50' : 'bg-blue-50'
                    : item.type === 'note' ? 'bg-yellow-50' : 'bg-green-50'}`}>
                  {item.type === 'call' && item.status === 'no_answer'
                    ? <PhoneMissed size={14} className="text-red-500" />
                    : item.type === 'call' && item.direction === 'inbound'
                    ? <PhoneIncoming size={14} className="text-blue-600" />
                    : item.type === 'call'
                    ? <PhoneOutgoing size={14} className="text-green-600" />
                    : item.type === 'note'
                    ? <MessageSquare size={14} className="text-yellow-600" />
                    : <TrendingUp size={14} className="text-green-600" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Call */}
                  {item.type === 'call' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {item.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${item.status === 'answered'  ? 'bg-green-50 text-green-700'
                          : item.status === 'no_answer' ? 'bg-red-50 text-red-600'
                          : 'bg-gray-100 text-gray-500'}`}>
                          {item.status}
                        </span>
                        {item.duration > 0 && (
                          <span className="text-xs text-gray-400 font-mono">{formatDuration(item.duration)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.agent_name ? `Agent: ${item.agent_name}` : 'No agent assigned'}
                        {item.queue ? ` · Queue ${item.queue}` : ''}
                      </p>
                      {item.disposition && (
                        <div className="mt-1.5 inline-flex items-center gap-1 bg-blue-50
                                        text-blue-700 text-xs px-2 py-0.5 rounded-full">
                          <FileText size={10}/> {item.disposition}
                        </div>
                      )}
                      {item.note && (
                        <p className="mt-1 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                          {item.note}
                        </p>
                      )}
                    </>
                  )}

                  {/* Note */}
                  {item.type === 'note' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">Note</span>
                        {item.is_pinned && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">📌 Pinned</span>
                        )}
                        {item.call_id && (
                          <span className="text-xs text-gray-400">on a call</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{item.content}</p>
                      <p className="text-xs text-gray-400 mt-1">by {item.author}</p>
                    </>
                  )}

                  {/* Lead */}
                  {item.type === 'lead' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 cursor-pointer hover:underline"
                              onClick={() => router.push(`/leads/${item.id}`)}>
                          {item.title}
                        </span>
                        {item.status_name && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {item.status_name}
                          </span>
                        )}
                        {item.stage_name && (
                          <span className="text-xs px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: item.stage_color || '#6b7280' }}>
                            {item.stage_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.assigned_to ? `Assigned to ${item.assigned_to}` : 'Unassigned'}
                        {item.value ? ` · $${item.value}` : ''}
                      </p>
                    </>
                  )}
                </div>

                {/* Date */}
                <div className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {timeAgo(item.date)}
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CALLS TAB ─────────────────────────────────────────────────── */}
      {tab === 'calls' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              All Calls ({callsData?.count ?? 0})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {!callsData?.results?.length && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No calls yet.</p>
            )}
            {callsData?.results?.map((call: any) => (
              <div key={call.id}
                   className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                   onClick={() => router.push(`/calls/${call.id}`)}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                    ${call.direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50'}`}>
                    {call.direction === 'inbound'
                      ? <PhoneIncoming size={14} className="text-blue-600" />
                      : <PhoneOutgoing size={14} className="text-green-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{call.caller}</span>
                      <StatusBadge status={call.status} size="xs" />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {call.agent_name || 'No agent'} ·{' '}
                      {call.started_at ? new Date(call.started_at).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
                {call.duration > 0 && (
                  <span className="text-xs text-gray-500 font-mono">{formatDuration(call.duration)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LEADS TAB ─────────────────────────────────────────────────── */}
      {tab === 'leads' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              All Leads ({leadsData?.count ?? 0})
            </h3>
            <Button variant="primary" size="sm"
                    onClick={() => router.push(`/leads/new?customer=${id}`)}>
              New Lead
            </Button>
          </div>
          <div className="divide-y divide-gray-50">
            {!leadsData?.results?.length && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No leads yet.</p>
            )}
            {leadsData?.results?.map((lead: any) => (
              <div key={lead.id}
                   className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                   onClick={() => router.push(`/leads/${lead.id}`)}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{lead.title}</p>
                  <p className="text-xs text-gray-400 capitalize">{lead.source}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lead.stage_name && (
                    <span className="text-xs px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: lead.stage_color || '#6b7280' }}>
                      {lead.stage_name}
                    </span>
                  )}
                  {lead.status_name && (
                    <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-medium">
                      {lead.status_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
