'use client';

import { useParams, useRouter }      from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast                          from 'react-hot-toast';
import { CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { followupsApi }               from '@/lib/api/followups';
import { PageHeader }                 from '@/components/ui/PageHeader';
import { Button }                     from '@/components/ui/Button';
import { StatusBadge }                from '@/components/ui/StatusBadge';

export default function FollowupDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const { data: followup, isLoading } = useQuery({
    queryKey: ['followup', id],
    queryFn:  () => followupsApi.get(id).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['followup', id] });
    qc.invalidateQueries({ queryKey: ['followups'] });
  };

  const completeMutation = useMutation({
    mutationFn: () => followupsApi.complete(id),
    onSuccess:  () => { toast.success('Marked complete!'); invalidate(); },
    onError:    () => toast.error('Failed to complete'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => followupsApi.cancel(id),
    onSuccess:  () => { toast.success('Cancelled.'); invalidate(); },
    onError:    () => toast.error('Failed to cancel'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  if (!followup) return (
    <div className="text-center text-gray-500 mt-20">Follow-up not found.</div>
  );

  const isOverdue =
    followup.status === 'pending' &&
    new Date(followup.scheduled_at) < new Date();

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <PageHeader
        title={followup.title}
        subtitle={`For ${followup.customer_name}`}
        actions={
          <div className="flex gap-2">
            {followup.status === 'pending' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircle size={14} />}
                  loading={completeMutation.isPending}
                  onClick={() => completeMutation.mutate()}
                >
                  Complete
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={14} />}
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Details Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4 space-y-4">

        <div className="flex items-center gap-3">
          <StatusBadge status={followup.status} dot />
          {isOverdue && (
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              <Clock size={12} /> Overdue
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-0.5">Type</p>
            <p className="font-medium capitalize">{followup.followup_type}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">Assigned To</p>
            <p className="font-medium">{followup.assigned_name}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">Scheduled At</p>
            <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
              {new Date(followup.scheduled_at).toLocaleString()}
            </p>
          </div>
          {followup.completed_at && (
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Completed At</p>
              <p className="font-medium text-green-600">
                {new Date(followup.completed_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {followup.description && (
          <div>
            <p className="text-gray-400 text-xs mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{followup.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
