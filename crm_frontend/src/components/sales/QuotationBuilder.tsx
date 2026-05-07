'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationsApi, termsApi, productsApi, salesSettingsApi } from '@/lib/api/sales';
import type { Quotation, QuotationItem, QuotationField, Product, TermsTemplate } from '@/types';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api/axios';

interface Props {
  quotation?:  Quotation | null;
  leadId?:     string | null;
}

const EMPTY_ITEM: Partial<QuotationItem> = {
  product: null, description: '', qty: 1,
  unit_price: 0, discount_pct: 0, line_total: 0,
  dimensions: {}, note: '', order: 0,
};

const EMPTY_FIELD: Partial<QuotationField> = { key: '', value: '', order: 0 };

export default function QuotationBuilder({ quotation, leadId }: Props) {
  const router = useRouter();
  const qc     = useQueryClient();
  const isEdit = !!quotation;

  const { data: settings } = useQuery({
    queryKey: ['sales-settings'],
    queryFn:  salesSettingsApi.get,
  });

  const { data: termsData } = useQuery({
    queryKey: ['terms-templates'],
    queryFn:  () => termsApi.list({ active_only: true }),
  });
  const templates: TermsTemplate[] = (termsData as any)?.results ?? termsData ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-active'],
    queryFn:  () => productsApi.list({ is_active: true, page_size: 200 } as any),
  });
  const products: Product[] = (productsData as any)?.results ?? productsData ?? [];

  const { data: leadsData } = useQuery({
    queryKey: ['leads-simple'],
    queryFn:  () => api.get('/leads/?page_size=200').then((r: any) => r.data?.results ?? r.data),
    staleTime: 60_000,
  });
  const leads = leadsData ?? [];

  // ── Determine available types from settings ───────────────
  const canPriceQuote = settings?.enable_price_quotation ?? true;
  const canContract   = settings?.enable_contract ?? false;
  const bothEnabled   = canPriceQuote && canContract;

  // ── Form state ────────────────────────────────────────────
  const [qType,       setQType]       = useState<'price_quote' | 'contract'>(quotation?.quotation_type as any ?? 'price_quote');
  const [title,       setTitle]       = useState(quotation?.title ?? '');
  const [lead,        setLead]        = useState(quotation?.lead ?? leadId ?? '');
  const [currency,    setCurrency]    = useState(quotation?.currency ?? settings?.default_currency ?? 'EGP');
  const [taxRate,     setTaxRate]     = useState(String(quotation?.tax_rate ?? settings?.default_tax_rate ?? 14));
  const [validUntil,  setValidUntil]  = useState(quotation?.valid_until ?? '');
  const [termsBody,   setTermsBody]   = useState(quotation?.terms_body ?? '');
  const [internalNote,setInternalNote]= useState(quotation?.internal_note ?? '');
  const [items,       setItems]       = useState<Partial<QuotationItem>[]>(quotation?.items ?? [{ ...EMPTY_ITEM }]);
  const [fields,      setFields]      = useState<Partial<QuotationField>[]>(quotation?.fields_data ?? [{ ...EMPTY_FIELD }]);

  useEffect(() => {
    if (settings && !isEdit) {
      setCurrency(settings.default_currency);
      setTaxRate(String(settings.default_tax_rate));
    }
  }, [settings]);

  // Sync lead from URL param if it arrives after first render
  useEffect(() => {
    if (leadId && !isEdit && !lead) {
      setLead(leadId);
    }
  }, [leadId, isEdit]);

  // ── Totals ────────────────────────────────────────────────
  const subtotal   = items.reduce((sum, item) => {
    const price = Number(item.unit_price ?? 0);
    const qty   = Number(item.qty ?? 0);
    const disc  = Number(item.discount_pct ?? 0);
    return sum + qty * price * (1 - disc / 100);
  }, 0);
  const taxAmount  = subtotal * (Number(taxRate) / 100);
  const total      = subtotal + taxAmount;

  // ── Item helpers ──────────────────────────────────────────
  const updateItem = (idx: number, key: string, val: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [key]: val };
      if (key === 'product') {
        const prod = products.find(p => p.id === val);
        if (prod) {
          updated.description = prod.name;
          updated.unit_price  = Number(prod.base_price);
        }
      }
      return updated;
    }));
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl) setTermsBody(tmpl.body);
  };

  // ── Save ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (draft: boolean) => {
      const payload = {
        quotation_type: qType,
        title, lead: lead || null,
        currency, tax_rate: Number(taxRate),
        valid_until: validUntil || null,
        terms_body: termsBody, internal_note: internalNote,
        items:       qType === 'price_quote' ? items.filter(i => i.description || i.product) : [],
        fields_data: qType === 'contract'    ? fields.filter(f => f.key)                     : [],
      };
      return isEdit
        ? quotationsApi.update(quotation!.id, payload)
        : quotationsApi.create(payload as any);
    },
    onSuccess: (data) => {
      toast.success(isEdit ? 'Quotation updated ✅' : 'Quotation created ✅');
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save'),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        quotation_type: qType,
        title, lead: lead || null,
        currency, tax_rate: Number(taxRate),
        valid_until: validUntil || null,
        terms_body: termsBody, internal_note: internalNote,
        items:       qType === 'price_quote' ? items.filter(i => i.description || i.product) : [],
        fields_data: qType === 'contract'    ? fields.filter(f => f.key)                     : [],
      };
      const saved = isEdit
        ? await quotationsApi.update(quotation!.id, payload)
        : await quotationsApi.create(payload as any);
      return quotationsApi.submit(saved.id);
    },
    onSuccess: (data: any) => {
      toast.success('Submitted for approval 🎉');
      qc.invalidateQueries({ queryKey: ['quotations'] });
      router.push('/sales/quotations/' + data.id);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to submit'),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-1 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            {isEdit ? `✏️ Edit ${quotation!.ref_number}` : '📄 New Quotation'}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}
            className="px-4 py-2 border text-sm rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            💾 Save Draft
          </button>
          <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50">
            🚀 Submit for Approval
          </button>
        </div>
      </div>

      <div className="space-y-5">

        {/* Type selector — only shown if both types enabled */}
        {bothEnabled && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Quotation Type</p>
            <div className="flex gap-3">
              {canPriceQuote && (
                <button onClick={() => setQType('price_quote')}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    qType === 'price_quote' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  📄 Price Quotation
                </button>
              )}
              {canContract && (
                <button onClick={() => setQType('contract')}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    qType === 'contract' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  📋 Contract / Agreement
                </button>
              )}
            </div>
          </div>
        )}

        {/* Header info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Details</p>
          <div className="grid grid-cols-2 gap-4">
            {qType === 'contract' && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Title *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Land Sale Agreement — Plot 42" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={lead} onChange={e => setLead(e.target.value)}>
                <option value="">No lead linked</option>
                {lead && !(leads as any[]).find((l: any) => l.id === lead) && (
                  <option value={lead}>Linked lead (loading…)</option>
                )}
                {(leads as any[]).map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name || l.company || `Lead ${l.phone || l.id.slice(0,8)}`}
                  </option>
                ))}
              </select>
            </div>
            {qType === 'price_quote' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={currency} onChange={e => setCurrency(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={taxRate} onChange={e => setTaxRate(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line Items — price_quote only */}
        {qType === 'price_quote' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Line Items</p>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-3">
                    <select className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={item.product ?? ''} onChange={e => updateItem(idx, 'product', e.target.value || null)}>
                      <option value="">Custom item...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Description" value={item.description ?? ''}
                      onChange={e => updateItem(idx, 'description', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Qty" value={item.qty ?? 1}
                      onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Price" value={item.unit_price ?? 0}
                      onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} />
                  </div>
                  <div className="col-span-1">
                    <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Disc%" value={item.discount_pct ?? 0}
                      onChange={e => updateItem(idx, 'discount_pct', Number(e.target.value))} />
                  </div>
                  <div className="col-span-1 pt-2 text-sm font-medium text-gray-700 text-right">
                    {(Number(item.qty ?? 0) * Number(item.unit_price ?? 0) * (1 - Number(item.discount_pct ?? 0) / 100)).toLocaleString()}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM, order: prev.length }])}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800">+ Add Item</button>

            {/* Totals */}
            <div className="mt-5 pt-4 border-t space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax ({taxRate}%)</span>
                <span>{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-800 text-base pt-1 border-t">
                <span>Total</span>
                <span>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
              </div>
            </div>
          </div>
        )}

        {/* Contract Fields — contract only */}
        {qType === 'contract' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Contract Fields</p>
            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={idx} className="flex gap-3 items-center">
                  <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Field name (e.g. Plot Number)"
                    value={field.key ?? ''} onChange={e => setFields(prev => prev.map((f, i) => i === idx ? { ...f, key: e.target.value } : f))} />
                  <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Value"
                    value={field.value ?? ''} onChange={e => setFields(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))} />
                  <button onClick={() => setFields(prev => prev.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setFields(prev => [...prev, { ...EMPTY_FIELD, order: prev.length }])}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800">+ Add Field</button>
          </div>
        )}

        {/* Terms & Conditions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Terms & Conditions</p>
          {templates.length > 0 && (
            <div className="flex gap-2 mb-3">
              <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue="" onChange={e => applyTemplate(e.target.value)}>
                <option value="">Apply a template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <textarea rows={6}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            placeholder="Write terms here or apply a template above..."
            value={termsBody} onChange={e => setTermsBody(e.target.value)} />
        </div>

        {/* Internal Note */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-2">Internal Note</p>
          <textarea rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Internal notes (not shown in print view)..."
            value={internalNote} onChange={e => setInternalNote(e.target.value)} />
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 pb-8">
          <button onClick={() => router.back()}
            className="px-5 py-2.5 border text-sm rounded-xl text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}
            className="px-5 py-2.5 border text-sm rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            💾 Save Draft
          </button>
          <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50">
            🚀 Submit for Approval
          </button>
        </div>

      </div>
    </div>
  );
}
