import api from './axios';
import type {
  PaginatedTickets, TicketDetail, TicketListItem,
  TicketCreatePayload, TicketUpdatePayload,
  TicketNote, TicketAttachment,
  TicketDashboard, Tag, SLAPolicy,
  TicketFilters,
} from "@/types/tickets"

// ── helper: build query string from filters ───────────────────────
function toParams(filters: TicketFilters = {}): Record<string, string> {
  const p: Record<string, string> = {}
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return
    if (Array.isArray(v)) {
      if (v.length > 0) p[k] = v.join(",")
    } else {
      p[k] = String(v)
    }
  })
  return p
}

export const ticketsApi = {

  // ── TICKETS CRUD ───────────────────────────────────────────────

  list: (filters: TicketFilters = {}) =>
    api.get<PaginatedTickets>("/tickets/tickets/", { params: toParams(filters) }),

  get: (id: string) =>
    api.get<TicketDetail>(`/tickets/tickets/${id}/`),

  create: (data: TicketCreatePayload) =>
    api.post<TicketDetail>("/tickets/tickets/", data),

  update: (id: string, data: TicketUpdatePayload) =>
    api.patch<TicketDetail>(`/tickets/tickets/${id}/`, data),

  delete: (id: string) =>
    api.delete(`/tickets/tickets/${id}/`),

  // ── STATUS ACTIONS ─────────────────────────────────────────────

  resolve: (id: string) =>
    api.post(`/tickets/tickets/${id}/resolve/`),

  close: (id: string) =>
    api.post(`/tickets/tickets/${id}/close/`),

  escalate: (id: string, payload: {
    note?        : string
    escalated_to?: string
  }) =>
    api.post(`/tickets/tickets/${id}/escalate/`, payload),

  // ── NOTES ──────────────────────────────────────────────────────

  listNotes: (ticketId: string) =>
    api.get<TicketNote[]>(`/tickets/tickets/${ticketId}/notes/`),

  addNote: (ticketId: string, data: {
    content   : string
    visibility: "internal" | "public"
  }) =>
    api.post<TicketNote>(`/tickets/tickets/${ticketId}/notes/`, data),

  // ── ATTACHMENTS ────────────────────────────────────────────────

  addAttachment: (ticketId: string, file: File, extra?: {
    attachment_type? : string
    asterisk_call_id?: string
  }) => {
    const form = new FormData()
    form.append("file", file)
    if (extra?.attachment_type)  form.append("attachment_type",  extra.attachment_type)
    if (extra?.asterisk_call_id) form.append("asterisk_call_id", extra.asterisk_call_id)
    return api.post<TicketAttachment>(
      `/tickets/tickets/${ticketId}/attachments/`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    )
  },

  // ── HISTORY ────────────────────────────────────────────────────

  getHistory: (ticketId: string) =>
    api.get(`/tickets/tickets/${ticketId}/history/`),

  // ── DASHBOARD ──────────────────────────────────────────────────

  dashboard: () =>
    api.get<TicketDashboard>("/tickets/dashboard/"),

  // ── SCREEN POP ─────────────────────────────────────────────────

  screenPop: (params: { phone?: string; call_id?: string }) =>
    api.get<TicketListItem[]>("/tickets/screen-pop/", { params }),

  // ── TAGS ───────────────────────────────────────────────────────

  listTags: () =>
    api.get<{ results: Tag[] }>("/tickets/tags/"),

  createTag: (data: { name: string; color: string }) =>
    api.post<Tag>("/tickets/tags/", data),

  // ── SLA POLICIES ───────────────────────────────────────────────

  listSLAPolicies: () =>
    api.get<{ results: SLAPolicy[] }>("/tickets/sla-policies/"),

}

export default ticketsApi
