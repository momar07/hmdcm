'use client';

import { useState }     from 'react';
import { useRouter }    from 'next/navigation';
import { useQuery }     from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { customersApi }                from '@/lib/api/customers';
import { PageHeader }   from '@/components/ui/PageHeader';
import { DataTable }    from '@/components/ui/DataTable';
import { Button }       from '@/components/ui/Button';
import { Input }        from '@/components/ui/Input';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import type { Customer, Column, PaginatedResponse } from '@/types';

export default function CustomersPage() {
  const router            = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage]   = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', page, search],
    queryFn:  () =>
      customersApi.list({ page, search, page_size: 25 }).then((r) => r.data),
    placeholderData: (prev: PaginatedResponse<Customer> | undefined) => prev,
  });

  const columns: Column<Customer>[] = [
    {
      key:    'name',
      header: 'Name',
      render: (c) => (
        <div>
          <p className="font-medium text-gray-900">
            {c.first_name} {c.last_name}
          </p>
          {c.company && (
            <p className="text-xs text-gray-400">{c.company}</p>
          )}
        </div>
      ),
    },
    {
      key:    'primary_phone',
      header: 'Phone',
      render: (c) => (
        <span className="font-mono text-sm text-gray-700">
          {c.primary_phone ?? '—'}
        </span>
      ),
    },
    {
      key:    'email',
      header: 'Email',
      render: (c) => (
        <span className="text-sm text-gray-600">{c.email || '—'}</span>
      ),
    },
    {
      key:    'tags',
      header: 'Tags',
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center px-1.5 py-0.5
                         rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      key:    'is_active',
      header: 'Status',
      render: (c) => (
        <StatusBadge
          status={c.is_active ? 'active' : 'offline'}
          label={c.is_active ? 'Active' : 'Inactive'}
          dot
        />
      ),
      width: '100px',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${data?.count ?? 0} total customers`}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => router.push('/customers/new')}
          >
            New Customer
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Search by name, phone, email..."
          leftIcon={<Search size={16} />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyField="id"
        isLoading={isLoading}
        emptyText="No customers found. Add your first customer."
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
      />

      {/* Pagination */}
      {data && data.count > 25 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 25 + 1}–
            {Math.min(page * 25, data.count)} of {data.count}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!data.previous}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data.next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
