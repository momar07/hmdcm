'use client';

import { useState }        from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';
import toast               from 'react-hot-toast';
import { usersApi }        from '@/lib/api/users';
import { PageHeader }      from '@/components/ui/PageHeader';
import { DataTable }       from '@/components/ui/DataTable';
import { Button }          from '@/components/ui/Button';
import { Modal }           from '@/components/ui/Modal';
import { Input }           from '@/components/ui/Input';
import { Select }          from '@/components/ui/Select';
import type { Team, Column } from '@/types';

export default function TeamsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam]     = useState<Team | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn:  () => usersApi.teams.list().then((r) => r.data),
  });
  const teams: Team[] = data?.results ?? [];

  const { mutate: deleteTeam } = useMutation({
    mutationFn: (id: string) => usersApi.teams.delete(id),
    onSuccess: () => {
      toast.success('Team deleted.');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: () => toast.error('Failed to delete team.'),
  });

  const confirmDelete = (t: Team) => {
    if (confirm(`Delete team "${t.name}"?`)) deleteTeam(t.id);
  };

  const columns: Column<Team>[] = [
    {
      key: 'name', header: 'Team Name',
      render: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users size={14} className="text-blue-600" />
          </div>
          <span className="font-medium text-gray-900">{t.name}</span>
        </div>
      ),
    },
    {
      key: 'description', header: 'Description',
      render: (t) => <span className="text-sm text-gray-500">{t.description || '—'}</span>,
    },
    {
      key: 'supervisor', header: 'Supervisor',
      render: (t) => (
        <span className="text-sm text-gray-700">
          {(t as unknown as Record<string,unknown>).supervisor_name as string ?? '—'}
        </span>
      ),
      width: '150px',
    },
    {
      key: 'member_count', header: 'Members',
      render: (t) => (
        <span className="font-mono text-sm text-gray-700">
          {(t as unknown as Record<string,unknown>).member_count as number ?? 0}
        </span>
      ),
      width: '90px',
    },
    {
      key: 'is_active', header: 'Status',
      render: (t) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${t.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
          {t.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
      width: '90px',
    },
    {
      key: 'actions', header: '',
      render: (t) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setEditTeam(t); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Edit">
            <Pencil size={15} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); confirmDelete(t); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete">
            <Trash2 size={15} />
          </button>
        </div>
      ),
      width: '80px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle={`${data?.count ?? 0} teams`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />}
                  onClick={() => setCreateOpen(true)}>
            New Team
          </Button>
        }
      />

      <DataTable columns={columns} data={teams} keyField="id"
                 isLoading={isLoading} emptyText="No teams found." />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Team" size="md">
        <TeamForm onClose={() => setCreateOpen(false)} />
      </Modal>

      <Modal open={!!editTeam} onClose={() => setEditTeam(null)} title="Edit Team" size="md">
        {editTeam && <TeamForm team={editTeam} onClose={() => setEditTeam(null)} />}
      </Modal>
    </div>
  );
}

function TeamForm({ team, onClose }: { team?: Team; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!team;

  const { data: usersData } = useQuery({
    queryKey: ['users-supervisors'],
    queryFn:  () => usersApi.list({ role: 'supervisor', page_size: 100 }).then((r) => r.data),
  });
  const supervisorOptions = [
    { value: '', label: '— No Supervisor —' },
    ...(usersData?.results ?? []).map((u) => ({ value: u.id, label: u.full_name })),
  ];

  const [form, setForm] = useState({
    name:        team?.name        ?? '',
    description: team?.description ?? '',
    supervisor:  (team as unknown as Record<string,unknown>)?.supervisor as string ?? '',
    is_active:   team?.is_active   ?? true,
  });

  const { mutate, isLoading } = useMutation({
    mutationFn: () =>
      isEdit
        ? usersApi.teams.update(team!.id, {
            ...form,
            supervisor: form.supervisor || null,
          } as Partial<Team>)
        : usersApi.teams.create({
            ...form,
            supervisor: form.supervisor || null,
          } as Partial<Team>),
    onSuccess: () => {
      toast.success(isEdit ? 'Team updated!' : 'Team created!');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
    onError: () => toast.error('Operation failed.'),
  });

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Input label="Team Name *" placeholder="Sales Team A"
             value={form.name} onChange={set('name')} />
      <Input label="Description" placeholder="Handles inbound sales calls"
             value={form.description} onChange={set('description')} />
      <Select label="Supervisor"
              options={supervisorOptions}
              value={form.supervisor}
              onChange={set('supervisor')} />
      {isEdit && (
        <Select label="Status"
          options={[
            { value: 'true',  label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
          value={String(form.is_active)}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))} />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" isLoading={isLoading}
                disabled={!form.name.trim()} onClick={() => mutate()}>
          {isEdit ? 'Save Changes' : 'Create Team'}
        </Button>
      </div>
    </div>
  );
}
