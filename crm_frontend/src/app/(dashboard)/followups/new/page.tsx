'use client';

import { useState }       from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm }         from 'react-hook-form';
import { zodResolver }     from '@hookform/resolvers/zod';
import { z }               from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast               from 'react-hot-toast';
import { followupsApi }    from '@/lib/api/followups';
import { customersApi }    from '@/lib/api/customers';
import { PageHeader }      from '@/components/ui/PageHeader';
import { Button }          from '@/components/ui/Button';
import { Input }           from '@/components/ui/Input';
import { Select }          from '@/components/ui/Select';

const schema = z.object({
  customer_id:   z.string().uuid('Select a customer'),
  title:         z.string().min(2, 'Title is required'),
  followup_type: z.enum(['call', 'email', 'meeting', 'sms', 'other']),
  scheduled_at:  z.string().min(1, 'Schedule date is required'),
  description:   z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewFollowupPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const preCustomer  = searchParams.get('customer_id') ?? '';

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { customer_id: preCustomer, followup_type: 'call' },
  });

  // load customers for dropdown
  const { data: custData } = useQuery({
    queryKey: ['customers-all'],
    queryFn:  () => customersApi.list({ page_size: 200 }).then((r) => r.data),
  });

  const customerOptions = [
    { value: '', label: 'Select customer…' },
    ...(custData?.results ?? []).map((c) => ({
      value: c.id,
      label: `${c.first_name} ${c.last_name}${c.primary_phone ? ' — ' + c.primary_phone : ''}`,
    })),
  ];

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: FormData) => followupsApi.create(data),
    onSuccess: () => {
      toast.success('Follow-up created! ✅');
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['followups-overdue'] });
      qc.invalidateQueries({ queryKey: ['followups-upcoming'] });
      router.push('/followups');
    },
    onError: (err: any) => {
      const msg = err?.response?.data
        ? JSON.stringify(err.response.data)
        : 'Failed to create follow-up';
      toast.error(msg);
    },
  });

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="New Follow-up" subtitle="Schedule a follow-up action" />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 mt-6">

        {/* Customer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
          <Select
            {...register('customer_id')}
            options={customerOptions}
            error={errors.customer_id?.message}
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <Input
            {...register('title')}
            placeholder="e.g. Call back about quote"
            error={errors.title?.message}
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <Select
            {...register('followup_type')}
            options={[
              { value: 'call',    label: 'Call' },
              { value: 'email',   label: 'Email' },
              { value: 'meeting', label: 'Meeting' },
              { value: 'sms',     label: 'SMS' },
              { value: 'other',   label: 'Other' },
            ]}
            error={errors.followup_type?.message}
          />
        </div>

        {/* Scheduled At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled At *</label>
          <Input
            type="datetime-local"
            {...register('scheduled_at')}
            error={errors.scheduled_at?.message}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional notes…"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Create Follow-up
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
