'use client';

import { useState }   from 'react';
import { useQuery }   from '@tanstack/react-query';
import { Settings, Phone, Shield, Bell } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button }     from '@/components/ui/Button';
import { Input }      from '@/components/ui/Input';
import clsx           from 'clsx';

type Tab = 'general' | 'telephony' | 'security' | 'notifications';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'general',       label: 'General',       icon: <Settings size={16} /> },
  { id: 'telephony',     label: 'Telephony',     icon: <Phone    size={16} /> },
  { id: 'security',      label: 'Security',      icon: <Shield   size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell     size={16} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  return (
    <div>
      <PageHeader title="Settings" subtitle="System and integration configuration" />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <nav className="w-48 shrink-0 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5',
                'text-sm font-medium transition-colors duration-150',
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          {activeTab === 'general'       && <GeneralSettings />}
          {activeTab === 'telephony'     && <TelephonySettings />}
          {activeTab === 'security'      && <SecuritySettings />}
          {activeTab === 'notifications' && <NotificationSettings />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">General Settings</h2>
      <Input label="Company Name"       defaultValue="My Call Center" />
      <Input label="Default Timezone"   defaultValue="Africa/Cairo" />
      <Input label="Default Language"   defaultValue="en" />
      <div className="pt-2">
        <Button variant="primary">Save Changes</Button>
      </div>
    </div>
  );
}

function TelephonySettings() {
  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">
        Issabel / Asterisk AMI
      </h2>
      <div className="rounded-lg bg-yellow-50 border border-yellow-200
                      px-4 py-3 text-sm text-yellow-800">
        Changes here affect live telephony. Reload required after save.
      </div>
      <Input label="AMI Host"     placeholder="192.168.1.100" />
      <Input label="AMI Port"     placeholder="5038" type="number" />
      <Input label="AMI Username" placeholder="crm_user" />
      <Input label="AMI Secret"   placeholder="••••••••" type="password" />
      <Input label="Recording Base URL" placeholder="http://192.168.1.100/recordings" />
      <div className="pt-2 flex gap-2">
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Test Connection</Button>
      </div>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">Security</h2>
      <Input label="Session Timeout (hours)" defaultValue="8" type="number" />
      <Input label="Max Login Attempts"       defaultValue="5" type="number" />
      <div className="pt-2">
        <Button variant="primary">Save</Button>
      </div>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
      <p className="text-sm text-gray-500">
        Configure in-app and browser notification preferences.
      </p>
      <div className="space-y-3">
        {[
          'Incoming call popup',
          'Follow-up reminders',
          'Campaign completion',
          'Lead assignment',
        ].map((item) => (
          <label key={item} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" defaultChecked
                   className="rounded border-gray-300 text-blue-600
                              focus:ring-blue-500 h-4 w-4" />
            <span className="text-sm text-gray-700">{item}</span>
          </label>
        ))}
      </div>
      <div className="pt-2">
        <Button variant="primary">Save</Button>
      </div>
    </div>
  );
}
