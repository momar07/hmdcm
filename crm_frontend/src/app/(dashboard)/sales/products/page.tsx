"use client";

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Package as PackageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store';
import { productsApi, type Product, type PricingType } from '@/lib/api/products';
import ProductModal from './ProductModal';

const PRICING_LABEL: Record<PricingType, { text: string; cls: string }> = {
  fixed:    { text: 'Fixed',    cls: 'bg-gray-100 text-gray-700' },
  per_unit: { text: 'Per unit', cls: 'bg-blue-100 text-blue-700' },
  variants: { text: 'Variants', cls: 'bg-purple-100 text-purple-700' },
};

export default function ProductsPage() {
  const { user } = useAuthStore();
  const canManage = user?.role === 'admin' || user?.role === 'supervisor';

  const [items, setItems]       = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeF, setTypeF]       = useState<'' | PricingType>('');
  const [activeF, setActiveF]   = useState<'all' | 'active' | 'inactive'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Product | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim())         params.search = search.trim();
      if (typeF)                 params.pricing_type = typeF;
      if (activeF !== 'all')     params.is_active = activeF === 'active';
      const data = await productsApi.list(params);
      const rows = Array.isArray(data) ? data : (data?.results ?? []);
      setItems(rows);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  // Debounced refetch when filters change
  useEffect(() => {
    const t = setTimeout(fetchData, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search, typeF, activeF]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setModalOpen(true); };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete product "${p.name}"? This cannot be undone.`)) return;
    try {
      await productsApi.remove(p.id);
      toast.success('Product deleted');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Delete failed');
    }
  };

  const stats = useMemo(() => ({
    total:    items.length,
    active:   items.filter((p) => p.is_active).length,
    inactive: items.filter((p) => !p.is_active).length,
  }), [items]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <PackageIcon size={22} /> Products
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Catalog used when building quotations
          </p>
        </div>
        {canManage && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            <Plus size={16} /> New product
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500">Active</p>
          <p className="text-xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs text-gray-500">Inactive</p>
          <p className="text-xl font-bold text-gray-400">{stats.inactive}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white border rounded-lg p-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={16} className="text-gray-400" />
          <input
            type="text" placeholder="Search name / SKU / category…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 outline-none text-sm"
          />
        </div>
        <select
          value={typeF} onChange={(e) => setTypeF(e.target.value as any)}
          className="px-2 py-1.5 border rounded text-sm bg-white"
        >
          <option value="">All types</option>
          <option value="fixed">Fixed</option>
          <option value="per_unit">Per unit</option>
          <option value="variants">Variants</option>
        </select>
        <select
          value={activeF} onChange={(e) => setActiveF(e.target.value as any)}
          className="px-2 py-1.5 border rounded text-sm bg-white"
        >
          <option value="all">All</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">SKU</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Pricing</th>
              <th className="px-4 py-2 text-right">Base price</th>
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-center">Status</th>
              {canManage && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                No products found.{canManage && ' Click "New product" to add one.'}
              </td></tr>
            ) : items.map((p) => {
              const badge = PRICING_LABEL[p.pricing_type];
              return (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.sku || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.category || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {Number(p.base_price).toLocaleString(undefined, { minimumFractionDigits: 2 })} {p.currency}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.unit}</td>
                  <td className="px-4 py-2.5 text-center">
                    {p.is_active
                      ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Active</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Inactive</span>}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {canManage && (
        <ProductModal
          open={modalOpen}
          product={editing}
          onClose={() => setModalOpen(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
