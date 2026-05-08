"""
Action type constants for ActivityLog.verb.

Use these constants instead of free-form strings so the admin Audit page
can group, filter, and translate consistently.

Phase A uses only LEAD_* constants. The rest will be wired in Phase B.
"""

# ── Lead actions (Phase A) ────────────────────────────────────────────────
LEAD_CREATED         = 'lead.created'
LEAD_UPDATED         = 'lead.updated'
LEAD_ARCHIVED        = 'lead.archived'
LEAD_RESTORED        = 'lead.restored'
LEAD_DELETED         = 'lead.deleted'
LEAD_STAGE_CHANGED   = 'lead.stage_changed'
LEAD_STATUS_CHANGED  = 'lead.status_changed'
LEAD_ASSIGNED        = 'lead.assigned'
LEAD_FOLLOWUP_SET    = 'lead.followup_set'

# ── Call actions (Phase B) ────────────────────────────────────────────────
CALL_MADE            = 'call.made'
CALL_ANSWERED        = 'call.answered'
CALL_REJECTED        = 'call.rejected'
CALL_COMPLETED       = 'call.completed'

# ── Ticket actions (Phase B) ──────────────────────────────────────────────
TICKET_CREATED       = 'ticket.created'
TICKET_UPDATED       = 'ticket.updated'
TICKET_STATUS_CHANGED = 'ticket.status_changed'

# ── Quotation actions (Phase B) ───────────────────────────────────────────
QUOTATION_CREATED    = 'quotation.created'
QUOTATION_SUBMITTED  = 'quotation.submitted'
QUOTATION_APPROVED   = 'quotation.approved'

# ── Followup actions (Phase B) ────────────────────────────────────────────
FOLLOWUP_CREATED     = 'followup.created'
FOLLOWUP_COMPLETED   = 'followup.completed'

# ── User actions (Phase B) ────────────────────────────────────────────────
USER_LOGIN           = 'user.login'
USER_LOGOUT          = 'user.logout'

# Human-readable labels for the admin UI
ACTION_LABELS = {
    LEAD_CREATED:          'Lead created',
    LEAD_UPDATED:          'Lead updated',
    LEAD_ARCHIVED:         'Lead archived',
    LEAD_RESTORED:         'Lead restored',
    LEAD_DELETED:          'Lead permanently deleted',
    LEAD_STAGE_CHANGED:    'Lead stage changed',
    LEAD_STATUS_CHANGED:   'Lead status changed',
    LEAD_ASSIGNED:         'Lead assigned',
    LEAD_FOLLOWUP_SET:     'Lead follow-up set',
    CALL_MADE:             'Call made',
    CALL_ANSWERED:         'Call answered',
    CALL_REJECTED:         'Call rejected',
    CALL_COMPLETED:        'Call completed',
    TICKET_CREATED:        'Ticket created',
    TICKET_UPDATED:        'Ticket updated',
    TICKET_STATUS_CHANGED: 'Ticket status changed',
    QUOTATION_CREATED:     'Quotation created',
    QUOTATION_SUBMITTED:   'Quotation submitted',
    QUOTATION_APPROVED:    'Quotation approved',
    FOLLOWUP_CREATED:      'Follow-up created',
    FOLLOWUP_COMPLETED:    'Follow-up completed',
    USER_LOGIN:            'User logged in',
    USER_LOGOUT:           'User logged out',
}
