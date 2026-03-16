'use client';

import { useState }   from 'react';
import { useQuery }   from '@tanstack/react-query';
import { Plus }       from 'lucide-react';
import { usersApi }   from '@/lib/api/users';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable }  from '@/components/ui/DataTable';
import { Button }     from '@/components/ui/Button';
import { StatusBadge }from '@/components/ui/StatusBadge';
import { Select }     from '@/components/ui/Select';
import { Modal }      from '@/components/ui/Modal';
import { Input }      from '@/components/ui/Input';
import type { User, Column } from '@/types';

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-purple-100 text-purple-800',
  supervisor: 'bg-blue-100   text-blue-800',
  agent:      'bg-green-100  text-green-800',
  qa:         'bg-yellow-100 text-yellow-800',
};

export default function UsersPage() {
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, roleFilter],
    queryFn:  () =>
      usersApi.list({
        page,
        role:      roleFilter || undefined,
        page_size: 25,
      }).then((r) => r.data),
    keepPreviousData: true,
  });

  const columns: Column<User>[] = [
    {
      key:    'name',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center
                        text-white text-sm font-bold shrink-0
                        ${ROLE_BADGE[u.role]?.includes('purple')
                          ? 'bg-purple-500'
                          : u.role === 'supervisor'
                          ? 'bg-blue-500'
                          : u.role === 'agent'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'}`}
          >
            {u.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{u.full_name}</p>
            <p className="text-xs text-gray-400">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key:    'role',
      header: 'Role',
      render: (u) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full
                      text-xs font-medium capitalize ${ROLE_BADGE[u.role] ?? ''}`}
        >
          {u.role}
        </span>
      ),
      width: '110px',
    },
    {
      key:    'status',
      header: 'Status',
      render: (u) => <StatusBadge status={u.status} dot />,
      width:  '110px',
    },
    {
      key:    'extension',
      header: 'Extension',
      render: (u) => (
        <span className="font-mono text-sm text-gray-700">
          {u.extension?.number ?? '—'}
        </span>
      ),
      width: '100px',
    },
    {
      key:    'is_active',
      header: 'Active',
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
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setInviteOpen(true)}
          >
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
            Showing {(page - 1) * 25 + 1}–
            {Math.min(page * 25, data.count)} of {data.count}
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

      {/* Invite User Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add New User"
        size="md"
      >
        <AddUserForm onClose={() => setInviteOpen(false)} />
      </Modal>
    </div>
  );
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="First Name" placeholder="Ahmed" />
        <Input label="Last Name"  placeholder="Hassan" />
      </div>
      <Input label="Email"    type="email" placeholder="agent@company.com" />
      <Input label="Password" type="password" placeholder="••••••••" />
      <Select
        label="Role"
        options={[
          { value: 'agent',      label: 'Agent' },
          { value: 'supervisor', label: 'Supervisor' },
          { value: 'admin',      label: 'Admin' },
          { value: 'qa',         label: 'QA' },
        ]}
      />
      <Input label="Extension Number" placeholder="109" />
      <p className="text-xs text-gray-400">
        User will receive login credentials via email.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary">Create User</Button>
      </div>
    </div>
  );
}
