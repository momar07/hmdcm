'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { leadsApi } from '@/features/leads/api';
import LeadKanban from '@/components/leads/LeadKanban';
import type { Lead, LeadStage } from '@/types/leads';

export default function LeadsPage() {
  const router = useRouter();
  const [leads,  setLeads]  = useState<Lead[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [view,   setView]   = useState<'kanban' | 'list'>('kanban');
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // Stats
  const total  = leads.length;
  const won    = leads.filter(l => l.converted_to_customer).length;
  const lost   = leads.filter(l => !l.is_active && !l.converted_to_customer).length;
  const active = leads.filter(l => l.is_active).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, stagesRes] = await Promise.all([
        leadsApi.list(search ? { search } : undefined),
        leadsApi.stages(),
      ]);
      setLeads(leadsRes.results ?? []);
      setStages(stagesRes.results ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleMoveStage = async (leadId: string, stageId: string) => {
    await leadsApi.moveStage(leadId, stageId);
    await load();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage all your leads — Customer is created only after WON
          </p>
        </div>
        <button
          onClick={() => router.push('/leads/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Lead
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Leads',  value: total,  color: 'blue'  },
          { label: 'Active',       value: active, color: 'green' },
          { label: 'Converted',    value: won,    color: 'purple'},
          { label: 'Lost',         value: lost,   color: 'red'   },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold text-${stat.color}-600 mt-1`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          {(['kanban', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm ${view === v
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {v === 'kanban' ? '⬛ Kanban' : '☰ List'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : view === 'kanban' ? (
        <LeadKanban
          leads={leads}
          stages={stages}
          onMoveStage={handleMoveStage}
          onLeadClick={lead => router.push(`/leads/${lead.id}`)}
        />
      ) : (
        // List view — simple table
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Name','Phone','Stage','Score','Value','Source','Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium">
                    {lead.first_name} {lead.last_name}
                    {lead.converted_to_customer && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                        Customer
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{lead.phone}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: lead.stage_color || '#6b7280' }}
                    >
                      {lead.stage_name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${lead.score >= 70 ? 'text-red-600' : lead.score >= 40 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {lead.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-green-600">
                    {lead.value ? `${Number(lead.value).toLocaleString()} EGP` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{lead.source}</td>
                  <td className="px-4 py-3">
                    {lead.is_active
                      ? <span className="text-green-600 text-xs">● Active</span>
                      : <span className="text-red-500 text-xs">● Closed</span>}
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
