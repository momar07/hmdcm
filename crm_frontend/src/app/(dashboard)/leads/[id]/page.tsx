'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { leadsApi } from '@/features/leads/api';
import LeadScoreBadge from '@/components/leads/LeadScoreBadge';
import LeadTimeline from '@/components/leads/LeadTimeline';
import MarkWonModal from '@/components/leads/MarkWonModal';
import MarkLostModal from '@/components/leads/MarkLostModal';
import type { Lead, TimelineEvent } from '@/types/leads';

type Tab = 'overview' | 'timeline';

export default function LeadDetailPage() {
  const router   = useRouter();
  const { id }   = useParams<{ id: string }>();
  const [lead,     setLead]     = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tab,      setTab]      = useState<Tab>('overview');
  const [loading,  setLoading]  = useState(true);
  const [showWon,  setShowWon]  = useState(false);
  const [showLost, setShowLost] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadData, tlData] = await Promise.all([
        leadsApi.get(id),
        leadsApi.timeline(id),
      ]);
      setLead(leadData);
      setTimeline(tlData.results ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleMarkWon = async (wonAmount?: number) => {
    await leadsApi.markWon(id, { won_amount: wonAmount });
    setShowWon(false);
    await load();
  };

  const handleMarkLost = async (reason: string) => {
    await leadsApi.markLost(id, { lost_reason: reason });
    setShowLost(false);
    await load();
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (!lead) return (
    <div className="p-6 text-center text-gray-500">Lead not found.</div>
  );

  const isWon  = lead.converted_to_customer;
  const isLost = !lead.is_active && !isWon;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => router.push('/leads')}
        className="text-gray-500 hover:text-gray-700 text-sm">
        ← Back to Leads
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {lead.first_name} {lead.last_name}
              </h1>
              {/* Status badge */}
              {isWon && (
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                  🏆 WON → Customer
                </span>
              )}
              {isLost && (
                <span className="bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">
                  ❌ LOST
                </span>
              )}
              {!isWon && !isLost && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                  🎯 Active Lead
                </span>
              )}
            </div>
            {lead.company && <p className="text-gray-500 mt-1">{lead.company}</p>}
            <div className="flex gap-4 mt-2 text-sm text-gray-500">
              {lead.phone && <span>📞 {lead.phone}</span>}
              {lead.email && <span>✉️ {lead.email}</span>}
            </div>
          </div>
          {/* Score */}
          <LeadScoreBadge score={lead.score} classification={lead.classification} />
        </div>

        {/* Stage + Value row */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {lead.stage_name && (
            <span
              className="px-3 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: lead.stage_color || '#6b7280' }}
            >
              {lead.stage_name}
            </span>
          )}
          {lead.value && (
            <span className="text-sm text-green-700 font-medium">
              💰 {Number(lead.value).toLocaleString()} EGP
            </span>
          )}
          {lead.won_amount && (
            <span className="text-sm text-green-700 font-bold">
              🏆 Won: {Number(lead.won_amount).toLocaleString()} EGP
            </span>
          )}
          <span className="text-sm text-gray-500 capitalize">
            📌 {lead.source}
          </span>
        </div>

        {/* Customer link if converted */}
        {isWon && lead.customer_id && (
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-purple-700">
              👤 Converted to Customer:
              <button
                onClick={() => router.push(`/customers/${lead.customer_id}`)}
                className="ml-2 font-semibold underline hover:text-purple-900"
              >
                {lead.customer_name || 'View Customer →'}
              </button>
            </p>
          </div>
        )}

        {/* LOST reason */}
        {isLost && lead.lost_reason && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              ❌ Lost reason: <span className="font-medium">{lead.lost_reason}</span>
            </p>
          </div>
        )}

        {/* Action buttons */}
        {!isWon && !isLost && (
          <div className="flex gap-3 mt-5 pt-5 border-t border-gray-100">
            <button
              onClick={() => setShowWon(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium
                         py-2.5 rounded-lg text-sm transition-colors"
            >
              🏆 Mark as WON
            </button>
            <button
              onClick={() => setShowLost(true)}
              className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium
                         py-2.5 rounded-lg text-sm border border-red-200 transition-colors"
            >
              ❌ Mark as LOST
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['overview', 'timeline'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors
              ${tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'timeline' ? `🕐 Timeline (${timeline.length})` : '📋 Overview'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Lead Details</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              ['Full Name',    `${lead.first_name} ${lead.last_name}`],
              ['Phone',        lead.phone    || '—'],
              ['Email',        lead.email    || '—'],
              ['Company',      lead.company  || '—'],
              ['Source',       lead.source],
              ['Lifecycle',    lead.lifecycle_stage],
              ['Stage',        lead.stage_name || '—'],
              ['Assigned To',  lead.assigned_name || '—'],
              ['Created',      new Date(lead.created_at).toLocaleDateString('en-EG')],
              ['Updated',      new Date(lead.updated_at).toLocaleDateString('en-EG')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Activity Timeline</h3>
          <LeadTimeline events={timeline} />
        </div>
      )}

      {/* Modals */}
      {showWon && (
        <MarkWonModal
          leadName={`${lead.first_name} ${lead.last_name}`}
          defaultValue={lead.value ? Number(lead.value) : null}
          onConfirm={handleMarkWon}
          onClose={() => setShowWon(false)}
        />
      )}
      {showLost && (
        <MarkLostModal
          leadName={`${lead.first_name} ${lead.last_name}`}
          onConfirm={handleMarkLost}
          onClose={() => setShowLost(false)}
        />
      )}
    </div>
  );
}
