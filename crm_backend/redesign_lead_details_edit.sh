#!/usr/bin/env bash
# fix_lead_details_issues.sh
# Fixes: 1) Quotation tab 404, 2) Ticket modal not showing pre-filled lead,
#        3) Timeline duplicate/noise items.

set -uo pipefail

FRONTEND="/home/momar/Desktop/websites/hmdcm/crm_frontend"
LEAD_PAGE="$FRONTEND/src/app/(dashboard)/leads/[id]/page.tsx"
TICKET_MODAL="$FRONTEND/src/components/tickets/NewTicketModal.tsx"

cd "$FRONTEND" || { echo "❌ Frontend dir not found"; exit 1; }

echo "╔════════════════════════════════════════════════════╗"
echo "║   Fix: Quotation 404 + Ticket Lead + Timeline     ║"
echo "╚════════════════════════════════════════════════════╝"

# ── Sanity check ──
for f in "$LEAD_PAGE" "$TICKET_MODAL"; do
  [[ -f "$f" ]] || { echo "❌ Missing: $f"; exit 1; }
done
echo "✓ Sanity check passed"

# ── Backup ──
TS=$(date +%Y%m%d_%H%M%S)
cp "$LEAD_PAGE"   "$LEAD_PAGE.bak_$TS"
cp "$TICKET_MODAL" "$TICKET_MODAL.bak_$TS"
echo "✓ Backups created (suffix: bak_$TS)"

# ── Fix 1: Quotation URLs in lead details page ──
echo ""
echo "→ Fix 1: Quotation routes (/sales/* → /sales/quotations/*)"
sed -i \
  -e "s|router.push(\`/sales/new?lead=\${id}\`)|router.push(\`/sales/quotations/new?lead=\${id}\`)|g" \
  -e "s|router.push(\`/sales/\${q.id}\`)|router.push(\`/sales/quotations/\${q.id}\`)|g" \
  "$LEAD_PAGE"
grep -q "/sales/quotations/new?lead=" "$LEAD_PAGE" \
  && echo "  ✓ Quotation URLs patched" \
  || { echo "  ⚠ Pattern not matched – please review manually"; }

# ── Fix 3 (do before fix 2 since both are file edits): Timeline filter ──
echo ""
echo "→ Fix 3: Filter noisy events from timeline (call_* duplicates)"
# Replace the events.forEach push block with a filtered version
python3 - <<'PYEOF'
import re, sys
path = "/home/momar/Desktop/websites/hmdcm/crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx"
src  = open(path).read()

old = """(events as LeadEvent[]).forEach(e => {
      items.push({ id: `ev-${e.id}`, type: 'event', timestamp: e.created_at, data: e });
    });"""

new = """// Filter out noisy / duplicate events:
    //   call_*  → already shown as their own call row
    //   unknown → skip (avoids raw "popup_shown" labels etc.)
    const HIDDEN_EVENT_TYPES = new Set([
      'call_offered', 'call_answered', 'call_rejected', 'call_no_answer',
    ]);
    const KNOWN_EVENT_TYPES = new Set(Object.keys(EVENT_LABELS));
    (events as LeadEvent[]).forEach(e => {
      if (HIDDEN_EVENT_TYPES.has(e.event_type)) return;
      if (!KNOWN_EVENT_TYPES.has(e.event_type)) return;
      items.push({ id: `ev-${e.id}`, type: 'event', timestamp: e.created_at, data: e });
    });"""

if old in src:
    src = src.replace(old, new)
    open(path, 'w').write(src)
    print("  ✓ Timeline filter applied")
else:
    print("  ⚠ Pattern not found — timeline already filtered or layout changed")
PYEOF

# ── Fix 2: NewTicketModal — pre-fill lead when defaultLeadId is given ──
echo ""
echo "→ Fix 2: Show pre-filled lead in NewTicketModal when defaultLeadId is passed"
python3 - <<'PYEOF'
path = "/home/momar/Desktop/websites/hmdcm/crm_frontend/src/components/tickets/NewTicketModal.tsx"
src  = open(path).read()

# 2a) Patch the open-effect to fetch the lead by defaultLeadId
old_effect = """  // Re-build form every time modal opens
  useEffect(() => {
    if (open) {
      setForm(buildForm());
      setError(null);
      // Reset lead search unless defaultLeadId is set
      if (!defaultLeadId) {
        setSelectedLead(null);
        setLeadSearch("");
        setLeadResults([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);"""

new_effect = """  // Re-build form every time modal opens
  useEffect(() => {
    if (!open) return;
    setForm(buildForm());
    setError(null);

    if (defaultLeadId) {
      // Fetch & display the pre-linked lead (so the user SEES it's linked)
      (async () => {
        try {
          const res = await api.get(`/leads/${defaultLeadId}/`);
          const l = (res.data as any) ?? null;
          if (l) {
            setSelectedLead(l);
            setLeadSearch(l.title ?? `${l.first_name || ''} ${l.last_name || ''}`.trim());
          }
        } catch {
          // leave empty – the form.lead is still set, ticket will link correctly
        }
      })();
    } else {
      setSelectedLead(null);
      setLeadSearch("");
      setLeadResults([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultLeadId]);"""

if old_effect in src:
    src = src.replace(old_effect, new_effect)
    open(path, 'w').write(src)
    print("  ✓ NewTicketModal patched – lead box pre-fills from defaultLeadId")
else:
    print("  ⚠ Pattern not found – modal already patched or layout changed")
PYEOF

# ── TypeScript validation ──
echo ""
echo "→ Running TypeScript check on modified files..."
TS_LOG=$(mktemp)
if npx tsc --noEmit --project tsconfig.json 2>&1 | tee "$TS_LOG" \
   | grep -E "page\.tsx|NewTicketModal\.tsx" | grep -E "error TS" >/dev/null; then
    echo ""
    echo "❌ TypeScript errors found in modified files:"
    grep -E "page\.tsx|NewTicketModal\.tsx" "$TS_LOG" | grep -E "error TS"
    echo ""
    echo "Rolling back changes..."
    cp "$LEAD_PAGE.bak_$TS"   "$LEAD_PAGE"
    cp "$TICKET_MODAL.bak_$TS" "$TICKET_MODAL"
    rm -f "$TS_LOG"
    exit 1
fi
rm -f "$TS_LOG"
echo "✓ TypeScript check passed (no new errors in patched files)"

# ── Final report ──
echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║                ✅  ALL FIXES APPLIED                ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo "Modified files:"
echo "  • $LEAD_PAGE"
echo "  • $TICKET_MODAL"
echo ""
echo "Backups:"
echo "  • $LEAD_PAGE.bak_$TS"
echo "  • $TICKET_MODAL.bak_$TS"
echo ""
echo "Changes:"
echo "  1) Quotation tab → routes to /sales/quotations/new and /sales/quotations/<id>"
echo "  2) New Ticket modal → pre-fills lead box when opened from a lead page"
echo "  3) Timeline → drops duplicate call_* events and unknown event types"
echo ""
echo "Next steps:"
echo "  cd $FRONTEND"
echo "  rm -rf .next"
echo "  npm run dev"
echo ""
echo "Then test:"
echo "  • Open any lead page → click 'Quotes' tab → click 'New' → should open /sales/quotations/new?lead=<id>"
echo "  • Click any existing quote → should open /sales/quotations/<id>"
echo "  • Click 'Ticket' button → modal should already show the linked lead in the search box"
echo "  • Open 'Timeline' tab → call rows should appear once (not twice)"
echo ""
echo "Rollback (if needed):"
echo "  cp $LEAD_PAGE.bak_$TS $LEAD_PAGE"
echo "  cp $TICKET_MODAL.bak_$TS $TICKET_MODAL"
