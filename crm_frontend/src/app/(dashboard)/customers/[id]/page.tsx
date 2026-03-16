'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery }              from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Building2, MapPin,
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
} from 'lucide-react';
import { customersApi }  from '@/lib/api/customers';
import { leadsApi }      from '@/lib/api/leads';
import { callsApi }      from '@/lib/api/calls';
import { PageHeader }    from '@/components/ui/PageHeader';
import { Button }        from '@/components/ui/Button';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { Spinner }       from '@/components/ui/Spinner';

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === 'inbound') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium
                     text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
      <PhoneIncoming size={11} /> Inbound
    </span>
  );
  if (direction === 'outbound') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium
                     text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
      <PhoneOutgoing size={11} /> Outbound
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium
                     text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
      <Phone size={11} /> Internal
    </span>
  );
}

export default function CustomerDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn:  () => customersApi.get(id).then((r) => r.data),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['customer-leads', id],
    queryFn:  () => leadsApi.list({ customer: id, page_size: 10 }).then((r) => r.data),
    enabled:  !!id,
  });

  const { data: callsData } = useQuery({
    queryKey: ['customer-calls', id],
    queryFn:  () => callsApi.list({ customer: id, page_size: 10 }).then((r) => r.data),
    enabled:  !!id,
  });

  if (isLoading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );
  if (!customer) return (
    <div className="text-center py-20 text-gray-400">Customer not found.</div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
              <Mail size={16} className="text-gray-400" />
              {customer.email}
            </div>
          )}
          {customer.company && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 size={16} className="text-gray-400" />
              {customer.company}
            </div>
          )}
          {(customer.city || customer.country) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-gray-400" />
              {[customer.city, customer.country].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="flex items-center gap-2">
            <StatusBadge
              status={customer.is_active ? 'active' : 'offline'}
              label={customer.is_active ? 'Active' : 'Inactive'}
              dot
            />
          </div>
        </div>

        {/* Phones */}
        {customer.phones?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Phone Numbers
            </p>
            <div className="flex flex-wrap gap-2">
              {customer.phones.map((ph) => (
                <div key={ph.id}
                     className="flex items-center gap-1.5 bg-gray-50 border
                                border-gray-200 rounded-lg px-3 py-1.5">
                  <Phone size={13} className="text-gray-400" />
                  <span className="font-mono text-sm">{ph.number}</span>
                  <span className="text-xs text-gray-400">({ph.phone_type})</span>
                  {ph.is_primary && (
                    <span className="text-xs bg-blue-100 text-blue-700
                                     rounded px-1 font-medium">Primary</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leads */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Leads ({leadsData?.count ?? 0})
          </h3>
          <Button variant="primary" size="sm"
                  onClick={() => router.push(`/leads/new?customer=${id}`)}>
            New Lead
          </Button>
        </div>
        <div className="divide-y divide-gray-50">
          {leadsData?.results?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No leads yet.</p>
          )}
          {leadsData?.results?.map((lead) => (
            <div key={lead.id}
                 className="px-5 py-3 flex items-center justify-between
                            hover:bg-gray-50 cursor-pointer"
                 onClick={() => router.push(`/leads/${lead.id}`)}>
              <div>
                <p className="text-sm font-medium text-gray-900">{lead.title}</p>
                <p className="text-xs text-gray-400 capitalize">{lead.source}</p>
              </div>
              {lead.status_name && (
                <span className="text-xs bg-blue-50 text-blue-700
                                 rounded-full px-2 py-0.5 font-medium">
                  {lead.status_name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Recent Calls ({callsData?.count ?? 0})
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {callsData?.results?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No calls yet.</p>
          )}
          {callsData?.results?.map((call) => (
            <div
              key={call.id}
              className="px-5 py-3 flex items-center justify-between
                         hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/calls/${call.id}`)}
            >
              {/* Left — direction + number + time */}
              <div className="flex items-center gap-3">
                {/* Direction icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                  ${call.direction === 'inbound'
                    ? 'bg-blue-50'
                    : call.direction === 'outbound'
                    ? 'bg-green-50'
                    : 'bg-gray-100'}`}>
                  {call.direction === 'inbound'
                    ? <PhoneIncoming  size={14} className="text-blue-600" />
                    : call.direction === 'outbound'
                    ? <PhoneOutgoing  size={14} className="text-green-600" />
                    : <Phone          size={14} className="text-gray-500" />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-900">
                      {call.caller_number}
                    </span>
                    <DirectionBadge direction={call.direction} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {call.started_at
                      ? new Date(call.started_at).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Right — status + duration */}
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={call.status} size="xs" />
                {call.duration > 0 && (
                  <span className="text-xs text-gray-500 font-mono">
                    {formatDuration(call.duration)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
