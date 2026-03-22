import type { TicketStatus, TicketPriority, TicketType, TicketSource } from "@/types/tickets"

// ═══════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════

export const STATUS_CONFIG: Record<TicketStatus, {
  label : string
  color : string   // Tailwind bg class
  text  : string   // Tailwind text class
  dot   : string   // hex for dot indicator
}> = {
  open:        { label: "Open",        color: "bg-blue-100",   text: "text-blue-700",   dot: "#3B82F6" },
  in_progress: { label: "In Progress", color: "bg-yellow-100", text: "text-yellow-700", dot: "#F59E0B" },
  pending:     { label: "Pending",     color: "bg-orange-100", text: "text-orange-700", dot: "#F97316" },
  resolved:    { label: "Resolved",    color: "bg-green-100",  text: "text-green-700",  dot: "#10B981" },
  closed:      { label: "Closed",      color: "bg-gray-100",   text: "text-gray-500",   dot: "#6B7280" },
}

// ═══════════════════════════════════════════════════════════════
// PRIORITY
// ═══════════════════════════════════════════════════════════════

export const PRIORITY_CONFIG: Record<TicketPriority, {
  label : string
  color : string
  text  : string
  icon  : string
}> = {
  low:    { label: "Low",    color: "bg-green-100",  text: "text-green-700",  icon: "▼" },
  medium: { label: "Medium", color: "bg-yellow-100", text: "text-yellow-700", icon: "●" },
  high:   { label: "High",   color: "bg-orange-100", text: "text-orange-700", icon: "▲" },
  urgent: { label: "Urgent", color: "bg-red-100",    text: "text-red-700",    icon: "🔴" },
}

// ═══════════════════════════════════════════════════════════════
// TYPE + SOURCE
// ═══════════════════════════════════════════════════════════════

export const TYPE_LABELS: Record<TicketType, string> = {
  complaint : "Complaint",
  request   : "Request",
  inquiry   : "Inquiry",
}

export const SOURCE_LABELS: Record<TicketSource, string> = {
  call   : "📞 Phone Call",
  manual : "✏️ Manual",
  email  : "✉️ Email",
  portal : "🌐 Portal",
  system : "⚙️ System",
}

// ═══════════════════════════════════════════════════════════════
// SLA HELPERS
// ═══════════════════════════════════════════════════════════════

export function formatSLARemaining(mins: number | null): string {
  if (mins === null) return "—"
  if (mins <= 0)     return "Overdue"
  if (mins < 60)     return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function getSLAColor(mins: number | null, breached: boolean): string {
  if (breached || mins === 0) return "text-red-600"
  if (mins === null)          return "text-gray-400"
  if (mins < 60)              return "text-orange-500"
  if (mins < 240)             return "text-yellow-600"
  return "text-green-600"
}

// ═══════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════

export function formatTicketDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ═══════════════════════════════════════════════════════════════════
// FLAT LABEL MAPS — for component compatibility
// ═══════════════════════════════════════════════════════════════════

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        "Open",
  in_progress: "In Progress",
  pending:     "Pending",
  resolved:    "Resolved",
  closed:      "Closed",
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
  urgent: "Urgent",
}

// ═══════════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════════

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const date  = new Date(dateStr)
  const now   = new Date()
  const diff  = Math.floor((now.getTime() - date.getTime()) / 1000) // seconds

  if (diff < 60)                    return "just now"
  if (diff < 3600)                  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)                 return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7)             return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
