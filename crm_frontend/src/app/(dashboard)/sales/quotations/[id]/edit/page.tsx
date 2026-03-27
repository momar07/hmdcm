'use client';

import { useParams } from 'next/navigation';
import { useQuery }  from '@tanstack/react-query';
import { quotationsApi } from '@/lib/api/sales';
import QuotationBuilder from '@/components/sales/QuotationBuilder';

export default function EditQuotationPage() {
  const { id } = useParams<{ id: string }>();

  const { data: quotation, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn:  () => quotationsApi.get(id),
    enabled:  !!id,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  if (!quotation) return <div className="flex items-center justify-center h-64 text-gray-400">Not found</div>;

  return <QuotationBuilder quotation={quotation} />;
}
