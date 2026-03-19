'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Calendar, Tag } from 'lucide-react';
import toast         from 'react-hot-toast';
import { leadsApi }  from '@/lib/api/leads';
import { PageHeader }  from '@/components/ui/PageHeader';
import { Button }      from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner }     from '@/components/ui/Spinner';

export default function LeadDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const router      = useRouter();
  const qc          = useQueryClient();

  // duplicate removed

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn:  () => leadsApi.get(id).then((r) => r.data),
  });

  const { data: statuses } = useQuery({
    queryKey: ['lead-statuses'],
    queryFn:  async () => {
      const r = await leadsApi.statuses();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const { data: stages } = useQuery({
    queryKey: ['lead-stages'],
    queryFn:  async () => {
      const r = await leadsApi.stages();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : (raw?.results ?? []);
    },
  });

  const moveStage = useMutation({
    mutationFn: (stageId: string) => leadsApi.moveStage(id, stageId),
    onSuccess: () => {
      toast.success('Stage updated ✅');
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const changeStatus = useMutation({
    mutationFn: (status_id: string) => leadsApi.changeStatus(id, status_id),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (isLoading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  );
  if (!lead) return (
    <div className="text-center py-20 text-gray-400">Lead not found.</div>
  );

  const customer = lead.customer_detail ?? lead.customer;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={lead.title}
        subtitle={`Source: ${lead.source}`}
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>Back</Button>
        }
      />

      {/* Lead Info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          {lead.status_name && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1
                             rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              <Tag size={12}/> {lead.status_name}
            </span>
          )}
          {lead.priority_name && (
            <span className="inline-flex items-center px-3 py-1
                             rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
              {lead.priority_name}
            </span>
          )}
        </div>

        {lead.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{lead.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {lead.assigned_name && (
            <div className="flex items-center gap-2 text-gray-600">
              <User size={14} className="text-gray-400"/>
              Assigned to: <span className="font-medium">{lead.assigned_name}</span>
            </div>
          )}
          {lead.followup_date && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar size={14} className="text-gray-400"/>
              Follow-up: <span className="font-medium">
                {new Date(lead.followup_date).toLocaleDateString()}
              </span>
            </div>
          )}
          {lead.value && (
            <div className="text-gray-600">
              Value: <span className="font-semibold text-green-600">
                EGP {Number(lead.value).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Current Stage */}
        {lead.stage_name && (
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: lead.stage_color ?? '#6B7280' }}
            />
            <span className="text-sm font-medium text-gray-700">
              Stage: {lead.stage_name}
            </span>
          </div>
        )}

        {/* Move Stage */}
        {stages && stages.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Move Stage
            </p>
            <div className="flex flex-wrap gap-2">
              {(stages as any[]).map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => moveStage.mutate(s.id)}
                  disabled={moveStage.isPending || lead.stage === s.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full
                             text-xs font-medium border transition-colors
                             disabled:opacity-50 disabled:cursor-default"
                  style={{
                    backgroundColor: lead.stage === s.id ? s.color + '25' : '',
                    borderColor:     lead.stage === s.id ? s.color : '#E5E7EB',
                    color:           lead.stage === s.id ? s.color : '#374151',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Change Status */}
        {statuses && statuses.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Change Status
            </p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => changeStatus.mutate(s.id)}
                  disabled={changeStatus.isPending}
                  className="px-3 py-1 rounded-full text-xs font-medium
                             border border-gray-200 hover:border-blue-400
                             hover:bg-blue-50 transition-colors"
                  style={{
                    backgroundColor: lead.status_name === s.name ? s.color + '20' : '',
                    borderColor: lead.status_name === s.name ? s.color : '',
                    color: lead.status_name === s.name ? s.color : '',
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Customer Info */}
      {customer && typeof customer === 'object' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Customer</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">
                {'first_name' in customer
                  ? `${customer.first_name} ${customer.last_name}`
                  : lead.customer_name}
              </p>
              {'primary_phone' in customer && customer.primary_phone && (
                <p className="text-sm text-gray-500 font-mono mt-0.5">
                  {customer.primary_phone}
                </p>
              )}
            </div>
            {'id' in customer && (
              <Button variant="secondary" size="sm"
                      onClick={() => router.push(`/customers/${customer.id}`)}>
                View Profile
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
