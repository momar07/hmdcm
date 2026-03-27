import api from './axios';
import type {
  SalesSettings, TermsTemplate,
  Product, ProductDimensionField, ProductVariant,
  Quotation, QuotationItem, QuotationField,
  PaginatedResponse,
} from '@/types';

export const salesSettingsApi = {
  get: () =>
    api.get<SalesSettings>('/sales/settings/').then((r: any) => r.data),
  update: (data: Partial<SalesSettings>) =>
    api.patch<SalesSettings>('/sales/settings/update/', data).then((r: any) => r.data),
};

export const termsApi = {
  list: (params?: { active_only?: boolean; search?: string }) =>
    api.get<PaginatedResponse<TermsTemplate>>('/sales/terms-templates/', { params }).then((r: any) => r.data),
  get: (id: string) =>
    api.get<TermsTemplate>(`/sales/terms-templates/${id}/`).then((r: any) => r.data),
  create: (data: Partial<TermsTemplate>) =>
    api.post<TermsTemplate>('/sales/terms-templates/', data).then((r: any) => r.data),
  update: (id: string, data: Partial<TermsTemplate>) =>
    api.patch<TermsTemplate>(`/sales/terms-templates/${id}/`, data).then((r: any) => r.data),
  delete: (id: string) =>
    api.delete(`/sales/terms-templates/${id}/`),
};

export const productsApi = {
  list: (params?: { pricing_type?: string; category?: string; is_active?: boolean; search?: string; page?: number }) =>
    api.get<PaginatedResponse<Product>>('/sales/products/', { params }).then((r: any) => r.data),
  get: (id: string) =>
    api.get<Product>(`/sales/products/${id}/`).then((r: any) => r.data),
  create: (data: Partial<Product>) =>
    api.post<Product>('/sales/products/', data).then((r: any) => r.data),
  update: (id: string, data: Partial<Product>) =>
    api.patch<Product>(`/sales/products/${id}/`, data).then((r: any) => r.data),
  delete: (id: string) =>
    api.delete(`/sales/products/${id}/`),
  addDimensionField: (productId: string, data: Partial<ProductDimensionField>) =>
    api.post(`/sales/products/${productId}/dimension-fields/`, data).then((r: any) => r.data),
  addVariant: (productId: string, data: Partial<ProductVariant>) =>
    api.post(`/sales/products/${productId}/variants/`, data).then((r: any) => r.data),
};

export interface QuotationCreatePayload {
  quotation_type: string;
  title?:         string;
  customer?:      string | null;
  lead?:          string | null;
  currency?:      string;
  tax_rate?:      number;
  valid_until?:   string | null;
  terms_body?:    string;
  internal_note?: string;
  items?:         Partial<QuotationItem>[];
  fields_data?:   Partial<QuotationField>[];
}

export const quotationsApi = {
  list: (params?: { status?: string; quotation_type?: string; customer?: string; search?: string; page?: number; page_size?: number }) =>
    api.get<PaginatedResponse<Quotation>>('/sales/quotations/', { params }).then((r: any) => r.data),
  get: (id: string) =>
    api.get<Quotation>(`/sales/quotations/${id}/`).then((r: any) => r.data),
  create: (data: QuotationCreatePayload) =>
    api.post<Quotation>('/sales/quotations/', data).then((r: any) => r.data),
  update: (id: string, data: Partial<QuotationCreatePayload>) =>
    api.patch<Quotation>(`/sales/quotations/${id}/`, data).then((r: any) => r.data),
  delete: (id: string) =>
    api.delete(`/sales/quotations/${id}/`),
  submit: (id: string) =>
    api.post<Quotation>(`/sales/quotations/${id}/submit/`).then((r: any) => r.data),
  approve: (id: string, comment?: string) =>
    api.post<Quotation>(`/sales/quotations/${id}/approve/`, { comment }).then((r: any) => r.data),
  reject: (id: string, comment: string) =>
    api.post<Quotation>(`/sales/quotations/${id}/reject/`, { comment }).then((r: any) => r.data),
  requestRevision: (id: string, comment: string) =>
    api.post<Quotation>(`/sales/quotations/${id}/request-revision/`, { comment }).then((r: any) => r.data),
  markSent: (id: string) =>
    api.post<Quotation>(`/sales/quotations/${id}/mark-sent/`).then((r: any) => r.data),
  whatsappLink: (id: string) =>
    api.get<{ url: string; phone: string }>(`/sales/quotations/${id}/whatsapp-link/`).then((r: any) => r.data),
  renderTerms: (id: string) =>
    api.get<{ rendered: string }>(`/sales/quotations/${id}/render-terms/`).then((r: any) => r.data),
};
