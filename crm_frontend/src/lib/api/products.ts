import api from './axios';

export type PricingType = 'fixed' | 'per_unit' | 'variants';
export type ProductUnit = 'piece' | 'm2' | 'ml' | 'kg' | 'hour' | 'other';

export interface ProductDimensionField {
  id?: string;
  label: string;
  unit: string;
  order: number;
}

export interface ProductVariant {
  id?: string;
  name: string;
  price: string | number;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  category: string;
  pricing_type: PricingType;
  base_price: string;
  unit: ProductUnit;
  currency: string;
  is_active: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
  dimension_fields: ProductDimensionField[];
  variants: ProductVariant[];
}

export interface ProductWriteInput {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  pricing_type: PricingType;
  base_price: string | number;
  unit: ProductUnit;
  currency?: string;
  is_active?: boolean;
  dimension_fields?: ProductDimensionField[];
  variants?: ProductVariant[];
}

export const productsApi = {
  list: async (params?: {
    search?: string;
    pricing_type?: PricingType;
    category?: string;
    is_active?: boolean;
    ordering?: string;
    page?: number;
  }) => {
    const { data } = await api.get('/sales/products/', { params });
    return data as { results: Product[]; count: number } | Product[];
  },
  get: async (id: string) => {
    const { data } = await api.get(`/sales/products/${id}/`);
    return data as Product;
  },
  create: async (payload: ProductWriteInput) => {
    const { data } = await api.post('/sales/products/', payload);
    return data as Product;
  },
  update: async (id: string, payload: Partial<ProductWriteInput>) => {
    const { data } = await api.patch(`/sales/products/${id}/`, payload);
    return data as Product;
  },
  remove: async (id: string) => {
    await api.delete(`/sales/products/${id}/`);
  },
  addDimensionField: async (
    productId: string,
    payload: Omit<ProductDimensionField, 'id'>
  ) => {
    const { data } = await api.post(
      `/sales/products/${productId}/dimension-fields/`,
      payload
    );
    return data as ProductDimensionField;
  },
  addVariant: async (productId: string, payload: Omit<ProductVariant, 'id'>) => {
    const { data } = await api.post(
      `/sales/products/${productId}/variants/`,
      payload
    );
    return data as ProductVariant;
  },
};
