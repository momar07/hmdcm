'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ConvertedLead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company: string;
  converted_at: string | null;
  customer_id: string | null;
  stage_name: string;
  score: number;
  assigned_name: string | null;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function fetchConverted(search = ''): Promise<ConvertedLead[]> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('access_token') : null;
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`${BASE}/api/customers/converted/${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export default function CustomersPage() {
  const router  = useRouter();
  const [customers, setCustomers] = useState<ConvertedLead[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  const load = async (q = '') => {
    setLoading(true);
    try { setCustomers(await fetchConverted(q)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Only leads that were marked as <strong>WON</strong> appear here
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(search)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => load(search)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Search
        </button>
        <span className="text-sm text-gray-500">{customers.length} customers</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No customers yet. Mark a lead as WON to create one.</p>
          <button
            onClick={() => router.push('/leads')}
            className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Leads Pipeline
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Customer', 'Phone', 'Email', 'Company',
                  'Converted', 'Assigned To', 'Actions'].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-gray-600 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700
                                      flex items-center justify-center text-xs font-bold">
                        {c.first_name?.[0]}{c.last_name?.[0]}
                      </div>
                      <span className="font-medium text-gray-900">
                        {c.first_name} {c.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.company || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {c.converted_at
                      ? new Date(c.converted_at).toLocaleDateString('en-EG')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.assigned_name || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/leads/${c.id}`)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      View Lead →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
