'use client';

import { useSearchParams } from 'next/navigation';
import QuotationBuilder from '@/components/sales/QuotationBuilder';

export default function NewQuotationPage() {
  const params     = useSearchParams();
  const customerId = params.get('customer');
  const leadId     = params.get('lead');

  return <QuotationBuilder customerId={customerId} leadId={leadId} />;
}
