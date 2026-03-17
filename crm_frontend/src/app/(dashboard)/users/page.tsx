'use client';

import { useState }        from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, KeyRound, Phone } from 'lucide-react';
import toast               from 'react-hot-toast';
import { usersApi }        from '@/lib/api/users';
import { agentStatusApi }  from '@/lib/api/users';
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

// ── Reset Password Modal ──────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm,     setConfirm]     = useState('');

  const { mutate, isLoading } = useMutation({
    mutationFn: () => usersApi.resetPassword(user.id, newPassword),
    onSuccess: () => {
      toast.success('Password reset successfully ✅');
      onClose();
    },
    onError: () => toast.error('Failed to reset password'),
  });

  const valid = newPassword.length >= 8 && newPassword === confirm;

  return (
    <Modal open onClose={onClose} title={`Reset Password — ${user.full_name}`} size="sm">
      <div className="space-y-4">
        <Input
          label="New Password *"
          type="password"
          placeholder="Min 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          label="Confirm Password *"
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm && newPassword !== confirm && (
          <p className="text-xs text-red-500">Passwords do not match</p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<KeyRound size={14} />}
            loading={isLoading}
            disabled={!valid}
            onClick={() => mutate()}
          >
            Reset Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function UsersPage() {
  const [roleFilter,    setRoleFilter]    = useState('');
  const [page,          setPage]          = useState(1);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editUser,      setEditUser]      = useState<User | null>(null);
  const [resetUser,     setResetUser]     = useState<User | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, roleFilter],
    queryFn:  () => usersApi.list({ page, role: roleFilter || undefined, page_size: 25 }).then((r) => r.data),
    keepPreviousData: true,
  });

  const { mutate: deleteUser } = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('User deleted.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Failed to delete user.'),
  });

  const confirmDelete = (u: User) => {
    if (confirm(`Delete user "${u.full_name}"?`)) deleteUser(u.id);
  };

  const columns: Column<User>[] = [
    {
      key: 'name', header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${AVATAR_BG[u.role] ?? 'bg-gray-400'}`}>
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
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
          {u.role}
        </span>
      ),
      width: '110px',
    },
    {
      key: 'team', header: 'Team',
      render: (u) => (
        <span className="text-sm text-gray-600">
          {(u as unknown as Record<string, unknown>).team_name as string ?? '—'}
        </span>
      ),
      width: '130px',
    },
    {
      key: 'status', header: 'Status',
      render: (u) => <StatusBadge status={u.status} dot />,
      width: '110px',
    },
    {
      key: 'extension', header: 'SIP Ext',
      render: (u) => (
        <span className="font-mono text-sm text-blue-600 font-medium">
          {u.extension?.number ? `📞 ${u.extension.number}` : '—'}
        </span>
      ),
      width: '90px',
    },
    {
      key: 'actions', header: '',
      render: (u) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setResetUser(u); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 transition-colors"
            title="Reset Password"
          >
            <KeyRound size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditUser(u); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); confirmDelete(u); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      width: '100px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${data?.count ?? 0} team members`}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
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
          <span>Showing {(page-1)*25+1}–{Math.min(page*25, data.count)} of {data.count}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!data.previous} onClick={() => setPage((p) => p-1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={!data.next} onClick={() => setPage((p) => p+1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add New User" size="md">
        <UserForm onClose={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ['users'] }); }} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User" size="md">
        {editUser && (
          <UserForm
            user={editUser}
            onClose={() => { setEditUser(null); queryClient.invalidateQueries({ queryKey: ['users'] }); }}
          />
        )}
      </Modal>

      {/* Reset Password Modal */}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}

// ── User Form (Create + Edit) ─────────────────────────────────
function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const isEdit = !!user;

  const { data: teamsData } = useQuery({
    queryKey: ['teams-all'],
    queryFn:  () => usersApi.teams.list().then((r) => r.data),
  });

  const teamOptions = [
    { value: '', label: '— No Team —' },
    ...(teamsData?.results ?? []).map((t) => ({ value: t.id, label: t.name })),
  ];

  const [form, setForm] = useState({
    first_name:      user?.first_name                  ?? '',
    last_name:       user?.last_name                   ?? '',
    email:           user?.email                       ?? '',
    password:        '',
    role:            user?.role                        ?? 'agent',
    phone:           user?.phone                       ?? '',
    team:            (user?.team as unknown as string) ?? '',
    is_active:       user?.is_active                   ?? true,
    sip_extension:   user?.extension?.number           ?? '',
  });

  const { mutate, isLoading } = useMutation({
    mutationFn: async () => {
      // 1. create or update user
      const payload = isEdit
        ? {
            first_name: form.first_name,
            last_name:  form.last_name,
            role:       form.role as User['role'],
            phone:      form.phone,
            team:       (form.team || null) as unknown as User['team'],
            is_active:  form.is_active,
          }
        : {
            first_name: form.first_name,
            last_name:  form.last_name,
            email:      form.email,
            password:   form.password,
            role:       form.role as User['role'],
            phone:      form.phone,
            team:       (form.team || null) as unknown as User['team'],
          };

      const res  = isEdit
        ? await usersApi.update(user!.id, payload)
        : await usersApi.create(payload as Parameters<typeof usersApi.create>[0]);

      const userId = res.data.id;

      // 2. set SIP extension if provided
      if (form.sip_extension.trim()) {
        await usersApi.setExtension(userId, form.sip_extension.trim());
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'User updated! ✅' : 'User created! ✅');
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Operation failed.';
      toast.error(msg);
    },
  });

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="First Name *" placeholder="Ahmed"  value={form.first_name} onChange={set('first_name')} />
        <Input label="Last Name *"  placeholder="Hassan" value={form.last_name}  onChange={set('last_name')} />
      </div>

      <Input
        label="Email *" type="email" placeholder="agent@company.com"
        value={form.email} onChange={set('email')} disabled={isEdit}
      />

      {!isEdit && (
        <Input
          label="Password *" type="password" placeholder="Min 8 characters"
          value={form.password} onChange={set('password')}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
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
        <Select
          label="Team"
          options={teamOptions}
          value={form.team}
          onChange={set('team')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Phone" placeholder="+20100000000"
          value={form.phone} onChange={set('phone')}
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            SIP Extension
          </label>
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="e.g. 200"
              value={form.sip_extension}
              onChange={set('sip_extension')}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         font-mono"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Asterisk/Issabel extension number</p>
        </div>
      </div>

      {isEdit && (
        <Select
          label="Active"
          options={[
            { value: 'true',  label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
          value={String(form.is_active)}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}
        />
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isLoading} onClick={() => mutate()}>
          {isEdit ? 'Save Changes' : 'Create User'}
        </Button>
      </div>
    </div>
  );
}
