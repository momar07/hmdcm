'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesSettingsApi, termsApi, productsApi } from '@/lib/api/sales';
import type { SalesSettings, TermsTemplate, Product } from '@/types';
import toast from 'react-hot-toast';

// ─── Terms Template Modal ─────────────────────────────────────
function TermsModal({ open, onClose, template }: {
  open: boolean;
  onClose: () => void;
  template?: TermsTemplate | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', category: 'standard', body: '', is_active: true });

  useEffect(() => {
    if (template) {
      setForm({ name: template.name, category: template.category, body: template.body, is_active: template.is_active });
    } else {
      setForm({ name: '', category: 'standard', body: '', is_active: true });
    }
  }, [template, open]);

  const mutation = useMutation({
    mutationFn: (data: any) => template
      ? termsApi.update(template.id, data)
      : termsApi.create(data),
    onSuccess: () => {
      toast.success(template ? 'Template updated' : 'Template created');
      qc.invalidateQueries({ queryKey: ['terms-templates'] });
      onClose();
    },
    onError: () => toast.error('Failed to save template'),
  });

  const PLACEHOLDERS = ['{{customer_name}}', '{{agent_name}}', '{{ref_number}}', '{{total_amount}}', '{{valid_until}}'];

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{template ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="real_estate">Real Estate</option>
                <option value="legal">Legal</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body *</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {PLACEHOLDERS.map(ph => (
                <button key={ph} type="button"
                  onClick={() => setForm(f => ({ ...f, body: f.body + ph }))}
                  className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
                  {ph}
                </button>
              ))}
            </div>
            <textarea rows={8}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your terms here. Use {{placeholder}} for dynamic values..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : template ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Modal ────────────────────────────────────────────
function ProductModal({ open, onClose, product }: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', description: '', sku: '', category: '',
    pricing_type: 'fixed', base_price: '', unit: 'piece',
    currency: 'EGP', is_active: true,
  });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name, description: product.description,
        sku: product.sku, category: product.category,
        pricing_type: product.pricing_type,
        base_price: String(product.base_price),
        unit: product.unit, currency: product.currency,
        is_active: product.is_active,
      });
    } else {
      setForm({ name: '', description: '', sku: '', category: '', pricing_type: 'fixed', base_price: '', unit: 'piece', currency: 'EGP', is_active: true });
    }
  }, [product, open]);

  const mutation = useMutation({
    mutationFn: (data: any) => product
      ? productsApi.update(product.id, data)
      : productsApi.create(data),
    onSuccess: () => {
      toast.success(product ? 'Product updated' : 'Product created');
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: () => toast.error('Failed to save product'),
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{product ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pricing Type</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.pricing_type} onChange={e => setForm(f => ({ ...f, pricing_type: e.target.value }))}>
                <option value="fixed">Fixed Price</option>
                <option value="per_unit">Per Unit (m², hr…)</option>
                <option value="variants">Has Variants</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.base_price} onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="piece">Piece</option>
                <option value="m2">m²</option>
                <option value="ml">ml</option>
                <option value="kg">kg</option>
                <option value="hour">Hour</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={() => mutation.mutate({ ...form, base_price: parseFloat(form.base_price) || 0 })}
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : product ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────
export default function SalesSettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'general' | 'terms' | 'products'>('general');
  const [termsModal, setTermsModal] = useState(false);
  const [editTerms, setEditTerms] = useState<TermsTemplate | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['sales-settings'],
    queryFn: salesSettingsApi.get,
  });

  const { data: termsData } = useQuery({
    queryKey: ['terms-templates'],
    queryFn: () => termsApi.list(),
    enabled: activeTab === 'terms',
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list({ page_size: 100 } as any),
    enabled: activeTab === 'products',
  });

  const terms    = (termsData as any)?.results ?? termsData ?? [];
  const products = (productsData as any)?.results ?? productsData ?? [];

  const [generalForm, setGeneralForm] = useState({
    enable_price_quotation: true,
    enable_contract: false,
    company_name: '',
    company_address: '',
    default_currency: 'EGP',
    default_tax_rate: '14',
    quotation_prefix: 'QUO',
  });

  useEffect(() => {
    if (settings) {
      setGeneralForm({
        enable_price_quotation: settings.enable_price_quotation,
        enable_contract: settings.enable_contract,
        company_name: settings.company_name,
        company_address: settings.company_address,
        default_currency: settings.default_currency,
        default_tax_rate: String(settings.default_tax_rate),
        quotation_prefix: settings.quotation_prefix,
      });
    }
  }, [settings]);

  const settingsMutation = useMutation({
    mutationFn: (data: any) => salesSettingsApi.update(data),
    onSuccess: () => { toast.success('Settings saved ✅'); qc.invalidateQueries({ queryKey: ['sales-settings'] }); },
    onError: () => toast.error('Failed to save settings'),
  });

  const deleteTermsMutation = useMutation({
    mutationFn: (id: string) => termsApi.delete(id),
    onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey: ['terms-templates'] }); },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => { toast.success('Product deleted'); qc.invalidateQueries({ queryKey: ['products'] }); },
  });

  const TABS = [
    { key: 'general',  label: '⚙ General' },
    { key: 'terms',    label: '📄 Terms Templates' },
    { key: 'products', label: '📦 Products' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">💼 Sales Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure quotation types, products, and terms templates</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Quotation Types</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={generalForm.enable_price_quotation}
                  onChange={e => setGeneralForm(f => ({ ...f, enable_price_quotation: e.target.checked }))}
                  className="w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-gray-800">📄 Price Quotation</p>
                  <p className="text-xs text-gray-500">Line items with quantities, prices, discounts and totals</p>
                </div>
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
              </label>
              <label className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={generalForm.enable_contract}
                  onChange={e => setGeneralForm(f => ({ ...f, enable_contract: e.target.checked }))}
                  className="w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-gray-800">📋 Contract / Agreement</p>
                  <p className="text-xs text-gray-500">Dynamic fields with contractual clauses — for real estate, land, legal</p>
                </div>
              </label>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Company Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={generalForm.company_name}
                  onChange={e => setGeneralForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quotation Prefix</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={generalForm.quotation_prefix}
                  onChange={e => setGeneralForm(f => ({ ...f, quotation_prefix: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={generalForm.default_currency}
                  onChange={e => setGeneralForm(f => ({ ...f, default_currency: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax Rate (%)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={generalForm.default_tax_rate}
                  onChange={e => setGeneralForm(f => ({ ...f, default_tax_rate: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={generalForm.company_address}
                  onChange={e => setGeneralForm(f => ({ ...f, company_address: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => settingsMutation.mutate({ ...generalForm, default_tax_rate: parseFloat(generalForm.default_tax_rate) })}
              disabled={settingsMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {settingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Terms Tab */}
      {activeTab === 'terms' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-700">Terms & Conditions Templates</h2>
            <button onClick={() => { setEditTerms(null); setTermsModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
              + New Template
            </button>
          </div>
          {terms.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📄</div>
              <p>No templates yet. Create your first one.</p>
            </div>
          ) : (
            <div className="divide-y">
              {terms.map((t: TermsTemplate) => (
                <div key={t.id} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.category} · {t.is_active ? '✅ Active' : '⛔ Inactive'} · Updated {new Date(t.updated_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditTerms(t); setTermsModal(true); }}
                      className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">✏ Edit</button>
                    <button onClick={() => { if (confirm('Delete this template?')) deleteTermsMutation.mutate(t.id); }}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-700">Product Catalog</h2>
            <button onClick={() => { setEditProduct(null); setProductModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
              + New Product
            </button>
          </div>
          {products.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📦</div>
              <p>No products yet. Add your first product.</p>
            </div>
          ) : (
            <div className="divide-y">
              {products.map((p: Product) => (
                <div key={p.id} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.pricing_type === 'fixed' ? '🏷 Fixed' : p.pricing_type === 'per_unit' ? '📐 Per Unit' : '🎛 Variants'} ·
                      {' '}{Number(p.base_price).toLocaleString()} {p.currency} / {p.unit} ·
                      {' '}{p.is_active ? '✅ Active' : '⛔ Inactive'}
                      {p.sku && ` · SKU: ${p.sku}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditProduct(p); setProductModal(true); }}
                      className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">✏ Edit</button>
                    <button onClick={() => { if (confirm('Delete this product?')) deleteProductMutation.mutate(p.id); }}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <TermsModal open={termsModal} onClose={() => setTermsModal(false)} template={editTerms} />
      <ProductModal open={productModal} onClose={() => setProductModal(false)} product={editProduct} />
    </div>
  );
}
