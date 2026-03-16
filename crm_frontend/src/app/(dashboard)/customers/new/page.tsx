'use client';

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import toast           from 'react-hot-toast';
import { customersApi } from '@/lib/api/customers';
import { PageHeader }   from '@/components/ui/PageHeader';
import { Button }       from '@/components/ui/Button';
import { Input }        from '@/components/ui/Input';

interface PhoneRow { number: string; phone_type: string; is_primary: boolean }

export default function NewCustomerPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    company: '', city: '', country: 'Egypt',
    address: '', notes: '',
  });
  const [phones, setPhones] = useState<PhoneRow[]>([
    { number: '', phone_type: 'mobile', is_primary: true },
  ]);

  const mutation = useMutation({
    mutationFn: () => customersApi.create({ ...form, phones } as any),
    onSuccess:  (res) => {
      toast.success('Customer created!');
      router.push(`/customers/${res.data.id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data
        ? JSON.stringify(err.response.data)
        : 'Failed to create customer';
      toast.error(msg);
    },
  });

  const addPhone = () =>
    setPhones((p) => [...p, { number: '', phone_type: 'mobile', is_primary: false }]);

  const removePhone = (i: number) =>
    setPhones((p) => p.filter((_, idx) => idx !== i));

  const setPrimary = (i: number) =>
    setPhones((p) => p.map((ph, idx) => ({ ...ph, is_primary: idx === i })));

  const updatePhone = (i: number, field: keyof PhoneRow, value: string | boolean) =>
    setPhones((p) => p.map((ph, idx) => idx === i ? { ...ph, [field]: value } : ph));

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="New Customer"
        subtitle="Add a new customer to the CRM"
        actions={
          <Button variant="secondary" icon={<ArrowLeft size={16}/>}
                  onClick={() => router.back()}>
            Back
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name *" value={form.first_name}
                   onChange={(e) => setForm({...form, first_name: e.target.value})}
                   placeholder="Ahmed" />
            <Input label="Last Name *" value={form.last_name}
                   onChange={(e) => setForm({...form, last_name: e.target.value})}
                   placeholder="Hassan" />
            <Input label="Email" type="email" value={form.email}
                   onChange={(e) => setForm({...form, email: e.target.value})}
                   placeholder="ahmed@example.com" />
            <Input label="Company" value={form.company}
                   onChange={(e) => setForm({...form, company: e.target.value})}
                   placeholder="Company name" />
            <Input label="City" value={form.city}
                   onChange={(e) => setForm({...form, city: e.target.value})}
                   placeholder="Cairo" />
            <Input label="Country" value={form.country}
                   onChange={(e) => setForm({...form, country: e.target.value})}
                   placeholder="Egypt" />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {/* Phone Numbers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Phone Numbers</h3>
            <Button variant="secondary" size="sm" icon={<Plus size={14}/>}
                    onClick={addPhone}>
              Add Phone
            </Button>
          </div>
          <div className="space-y-3">
            {phones.map((ph, i) => (
              <div key={i} className="flex items-center gap-3">
                <Input
                  placeholder="01012345678"
                  value={ph.number}
                  onChange={(e) => updatePhone(i, 'number', e.target.value)}
                  className="flex-1"
                />
                <select
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={ph.phone_type}
                  onChange={(e) => updatePhone(i, 'phone_type', e.target.value)}
                >
                  <option value="mobile">Mobile</option>
                  <option value="home">Home</option>
                  <option value="work">Work</option>
                  <option value="fax">Fax</option>
                  <option value="other">Other</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="radio" name="primary_phone"
                         checked={ph.is_primary}
                         onChange={() => setPrimary(i)}
                         className="accent-blue-600" />
                  Primary
                </label>
                {phones.length > 1 && (
                  <button onClick={() => removePhone(i)}
                          className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            disabled={!form.first_name || !form.last_name}
          >
            Create Customer
          </Button>
        </div>
      </div>
    </div>
  );
}
