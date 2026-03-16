'use client';

import { useState }        from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus }            from 'lucide-react';
import toast               from 'react-hot-toast';
import { usersApi }        from '@/lib/api/users';
import { PageHeader }      from '@/components/ui/PageHeader';
import { DataTable }       from '@/components/ui/DataTable';
import { Button }          from '@/components/ui/Button';
import { StatusBadge }     from '@/components/ui/StatusBadge';
import { Select }          from '@/components/ui/Select';
import { Modal }           from '@/components/ui/Modal';
import { Input }           from '@/components/ui/Input';
import type { User, Column } from '@/types';

const ROLE_COLORS: Record<string, string> = {
  admin:      'bg-purple-100 text-purple-800',
  supervisor: 'bg-blue-100   text-blue-800',
  agent:      'bg-green-100  text-green-800',
  qa:         'bg-yellow-100 text-yellow-800',
};

const AVATAR_BG: Record<string, string> = {
  admin:      'bg-purple-500',
  supervisor: 'bg-blue-500',
  agent:      'bg-green-500',
  qa:         'bg-yellow-500',
};

export default function UsersPage() {
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, roleFilter],
    queryFn:  () => usersApi.list({ page, role: roleFilter || undefined, page_size: 25 }).then((r) => r.data),
    keepPreviousData: true,
  });

  const columns: Column<User>[] = [
    {
      key: 'name', header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center
                           text-white text-sm font-bold shrink-0
                           ${AVATAR_BG[u.role] ?? 'bg-gray-400'}`}>
            {u.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="font-medium text-gray-900">{u.full_name}</p>
            <p className="text-xs text-gray-400">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role', header: 'Role',
      render: (u) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full
                          text-xs font-medium capitalize
                          ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
          {u.role}
        </span>
      ),
      width: '110px',
    },
    {
      key: 'status', header: 'Status',
      render: (u) => <StatusBadge status={u.status} dot />,
      width: '110px',
    },
    {
      key: 'extension', header: 'Extension',
      render: (u) => (
        <span className="font-mono text-sm text-gray-700">
          {u.extension?.number ?? '—'}
        </span>
      ),
      width: '100px',
    },
    {
      key: 'is_active', header: 'Active',
      render: (u) => (
        <StatusBadge
          status={u.is_active ? 'active' : 'offline'}
          label={u.is_active ? 'Yes' : 'No'}
        />
      ),
      width: '80px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${data?.count ?? 0} team members`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />}
                  onClick={() => setInviteOpen(true)}>
            Add User
          </Button>
        }
      />

      <div className="mb-4">
        <Select
          options={[
            { value: '',           label: 'All Roles' },
            { value: 'admin',      label: 'Admin' },
            { value: 'supervisor', label: 'Supervisor' },
            { value: 'agent',      label: 'Agent' },
            { value: 'qa',         label: 'QA' },
          ]}
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="w-44"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No users found."
      />

      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
                    disabled={!data.previous}
                    onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm"
                    disabled={!data.next}
                    onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)}
             title="Add New User" size="md">
        <AddUserForm onClose={() => setInviteOpen(false)} />
      </Modal>
    </div>
  );
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    password: '', role: 'agent', phone: '',
  });

  const { mutate, isLoading } = useMutation({
    mutationFn: () => usersApi.create({ ...form }),
    onSuccess: () => {
      toast.success('User created successfully!');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Failed to create user.';
      toast.error(msg);
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="First Name *" placeholder="Ahmed"
               value={form.first_name} onChange={set('first_name')} />
        <Input label="Last Name *"  placeholder="Hassan"
               value={form.last_name}  onChange={set('last_name')} />
      </div>
      <Input label="Email *" type="email" placeholder="agent@company.com"
             value={form.email} onChange={set('email')} />
      <Input label="Password *" type="password" placeholder="Min 8 characters"
             value={form.password} onChange={set('password')} />
      <Select
        label="Role"
        options={[
          { value: 'agent',      label: 'Agent' },
          { value: 'supervisor', label: 'Supervisor' },
          { value: 'admin',      label: 'Admin' },
          { value: 'qa',         label: 'QA' },
        ]}
        value={form.role}
        onChange={set('role')}
      />
      <Input label="Phone" placeholder="+20100000000"
             value={form.phone} onChange={set('phone')} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" isLoading={isLoading}
                onClick={() => mutate()}>Create User</Button>
      </div>
    </div>
  );
}
