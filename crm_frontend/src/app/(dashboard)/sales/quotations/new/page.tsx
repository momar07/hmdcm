'use client';

import { useSearchParams } from 'next/navigation';
import QuotationBuilder from '@/components/sales/QuotationBuilder';

export default function NewQuotationPage() {
  const params     = useSearchParams();
  const leadId     = params.get('lead');

  return <QuotationBuilder leadId={leadId} />;
}
