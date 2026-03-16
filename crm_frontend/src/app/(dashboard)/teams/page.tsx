'use client';

import { useState }        from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users }     from 'lucide-react';
import toast               from 'react-hot-toast';
import { usersApi }        from '@/lib/api/users';
import { PageHeader }      from '@/components/ui/PageHeader';
import { DataTable }       from '@/components/ui/DataTable';
import { Button }          from '@/components/ui/Button';
import { Modal }           from '@/components/ui/Modal';
import { Input }           from '@/components/ui/Input';
import type { Team, Column } from '@/types';

export default function TeamsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn:  () => usersApi.teams.list().then((r) => r.data),
  });

  const { mutate: deleteTeam } = useMutation({
    mutationFn: (id: string) => usersApi.teams.update(id, { is_active: false } as Partial<Team>),
    onSuccess: () => {
      toast.success('Team deactivated.');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  const columns: Column<Team>[] = [
    {
      key: 'name', header: 'Team Name',
      render: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
            <Users size={14} className="text-brand-600" />
          </div>
          <span className="font-medium text-gray-900">{t.name}</span>
        </div>
      ),
    },
    {
      key: 'description', header: 'Description',
      render: (t) => (
        <span className="text-sm text-gray-500">{t.description ?? '—'}</span>
      ),
    },
    {
      key: 'supervisor', header: 'Supervisor',
      render: (t) => (
        <span className="text-sm text-gray-700">
          {(t as unknown as Record<string, unknown>).supervisor_name as string ?? '—'}
        </span>
      ),
      width: '160px',
    },
    {
      key: 'is_active', header: 'Status',
      render: (t) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${t.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100  text-gray-500'}`}>
          {t.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '90px',
    },
    {
      key: 'actions', header: '',
      render: (t) => (
        <Button variant="ghost" size="sm"
                onClick={(e) => { e.stopPropagation(); deleteTeam(t.id); }}>
          Deactivate
        </Button>
      ),
      width: '110px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle={`${Array.isArray(teams) ? teams.length : 0} teams`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />}
                  onClick={() => setCreateOpen(true)}>
            New Team
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={Array.isArray(teams) ? teams : []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No teams found."
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}
             title="Create New Team" size="md">
        <CreateTeamForm onClose={() => setCreateOpen(false)} />
      </Modal>
    </div>
  );
}

function CreateTeamForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '' });

  const { mutate, isLoading } = useMutation({
    mutationFn: () => usersApi.teams.create(form),
    onSuccess: () => {
      toast.success('Team created!');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
    onError: () => toast.error('Failed to create team.'),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Input label="Team Name *" placeholder="Sales Team A"
             value={form.name} onChange={set('name')} />
      <Input label="Description"  placeholder="Handles inbound sales calls"
             value={form.description} onChange={set('description')} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" isLoading={isLoading}
                onClick={() => mutate()}>Create Team</Button>
      </div>
    </div>
  );
}
