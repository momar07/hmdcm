"use client";

import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  productsApi,
  type Product,
  type ProductDimensionField,
  type ProductVariant,
  type PricingType,
  type ProductUnit,
} from '@/lib/api/products';

interface Props {
  open: boolean;
  product?: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

const PRICING_TYPES: { value: PricingType; label: string; desc: string }[] = [
  { value: 'fixed',    label: 'Fixed price',    desc: 'A single base price for the product' },
  { value: 'per_unit', label: 'Per unit',       desc: 'Price is multiplied by dimensions (e.g. m², ml, kg)' },
  { value: 'variants', label: 'Variants',       desc: 'Predefined options with different prices' },
];

const UNITS: ProductUnit[] = ['piece', 'm2', 'ml', 'kg', 'hour', 'other'];

export default function ProductModal({ open, product, onClose, onSaved }: Props) {
  const editing = !!product;

  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [sku,          setSku]          = useState('');
  const [category,     setCategory]     = useState('');
  const [pricingType,  setPricingType]  = useState<PricingType>('fixed');
  const [basePrice,    setBasePrice]    = useState<string>('0');
  const [unit,         setUnit]         = useState<ProductUnit>('piece');
  const [currency,     setCurrency]     = useState('EGP');
  const [isActive,     setIsActive]     = useState(true);

  const [dims, setDims]         = useState<ProductDimensionField[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name ?? '');
      setDescription(product.description ?? '');
      setSku(product.sku ?? '');
      setCategory(product.category ?? '');
      setPricingType(product.pricing_type);
      setBasePrice(String(product.base_price ?? '0'));
      setUnit(product.unit ?? 'piece');
      setCurrency(product.currency ?? 'EGP');
      setIsActive(product.is_active);
      setDims(product.dimension_fields ?? []);
      setVariants(product.variants ?? []);
    } else {
      setName(''); setDescription(''); setSku(''); setCategory('');
      setPricingType('fixed'); setBasePrice('0'); setUnit('piece');
      setCurrency('EGP'); setIsActive(true); setDims([]); setVariants([]);
    }
  }, [open, product]);

  if (!open) return null;

  const addDim = () =>
    setDims((d) => [...d, { label: '', unit: 'm', order: d.length }]);
  const updateDim = (i: number, patch: Partial<ProductDimensionField>) =>
    setDims((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeDim = (i: number) =>
    setDims((d) => d.filter((_, idx) => idx !== i));

  const addVariant = () =>
    setVariants((v) => [...v, { name: '', price: '0', is_active: true }]);
  const updateVariant = (i: number, patch: Partial<ProductVariant>) =>
    setVariants((v) => v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeVariant = (i: number) =>
    setVariants((v) => v.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (pricingType === 'per_unit' && dims.length === 0) {
      toast.error('Add at least one dimension field for per-unit pricing'); return;
    }
    if (pricingType === 'variants' && variants.length === 0) {
      toast.error('Add at least one variant'); return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      sku: sku.trim(),
      category: category.trim(),
      pricing_type: pricingType,
      base_price: basePrice || '0',
      unit,
      currency,
      is_active: isActive,
      dimension_fields: pricingType === 'per_unit'
        ? dims.map((d, i) => ({ label: d.label, unit: d.unit, order: i }))
        : [],
      variants: pricingType === 'variants'
        ? variants.map((v) => ({ name: v.name, price: v.price, is_active: v.is_active }))
        : [],
    };

    setSaving(true);
    try {
      if (editing && product) {
        await productsApi.update(product.id, payload);
        toast.success('Product updated');
      } else {
        await productsApi.create(payload);
        toast.success('Product created');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.detail
        || JSON.stringify(e?.response?.data ?? {})
        || e?.message || 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Edit product' : 'New product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Premium aluminum window"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
              <input
                type="text" value={sku} onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g. Windows"
              />
            </div>
          </div>

          {/* Pricing type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Pricing type *</label>
            <div className="grid grid-cols-3 gap-2">
              {PRICING_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPricingType(pt.value)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-xs transition ${
                    pricingType === pt.value
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/30'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{pt.label}</div>
                  <div className="text-gray-500 mt-0.5">{pt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Price + unit + currency */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {pricingType === 'variants' ? 'Base price (optional)' : 'Base price *'}
              </label>
              <input
                type="number" step="0.01" value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
              <input
                type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-full px-3 py-2 border rounded-lg text-sm uppercase"
              />
            </div>
          </div>

          {/* Per-unit dimension fields */}
          {pricingType === 'per_unit' && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Dimension fields</h3>
                <button
                  type="button" onClick={addDim}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={14} /> Add field
                </button>
              </div>
              {dims.length === 0 ? (
                <p className="text-xs text-gray-500">No dimensions yet. Click "Add field".</p>
              ) : (
                <div className="space-y-2">
                  {dims.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text" placeholder="Label (e.g. Width)" value={d.label}
                        onChange={(e) => updateDim(i, { label: e.target.value })}
                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                      />
                      <input
                        type="text" placeholder="Unit (e.g. m)" value={d.unit}
                        onChange={(e) => updateDim(i, { unit: e.target.value })}
                        className="w-28 px-2 py-1.5 border rounded text-sm"
                      />
                      <button
                        type="button" onClick={() => removeDim(i)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Variants */}
          {pricingType === 'variants' && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Variants</h3>
                <button
                  type="button" onClick={addVariant}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={14} /> Add variant
                </button>
              </div>
              {variants.length === 0 ? (
                <p className="text-xs text-gray-500">No variants yet. Click "Add variant".</p>
              ) : (
                <div className="space-y-2">
                  {variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text" placeholder="Name (e.g. Small 60×60)" value={v.name}
                        onChange={(e) => updateVariant(i, { name: e.target.value })}
                        className="flex-1 px-2 py-1.5 border rounded text-sm"
                      />
                      <input
                        type="number" step="0.01" placeholder="Price" value={String(v.price)}
                        onChange={(e) => updateVariant(i, { price: e.target.value })}
                        className="w-32 px-2 py-1.5 border rounded text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox" checked={v.is_active}
                          onChange={(e) => updateVariant(i, { is_active: e.target.checked })}
                        />
                        Active
                      </label>
                      <button
                        type="button" onClick={() => removeVariant(i)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox" checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active (visible in quotation builder)
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>
    </div>
  );
}
