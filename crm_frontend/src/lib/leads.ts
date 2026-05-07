// Helper for displaying lead names consistently across the app.
import type { Lead } from '@/types';

type LeadLike = Pick<Lead, 'full_name' | 'company' | 'phone' | 'id'> | null | undefined;

export function getLeadDisplayName(lead: LeadLike): string {
  if (!lead) return 'Unknown';
  if (lead.full_name && lead.full_name.trim()) return lead.full_name.trim();
  if (lead.company   && lead.company.trim())   return lead.company.trim();
  if (lead.phone     && lead.phone.trim())     return `Lead ${lead.phone.trim()}`;
  return `Lead ${String(lead.id).slice(0, 8)}`;
}
