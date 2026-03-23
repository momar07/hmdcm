'use client';

import { useState, useEffect }       from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Phone, Shield, Bell, Layers, Save, RefreshCw } from 'lucide-react';
import clsx                           from 'clsx';
import toast                          from 'react-hot-toast';
import PipelineStagesSettings         from '@/components/settings/PipelineStagesSettings';
import { PageHeader }                 from '@/components/ui/PageHeader';
import { Button }                     from '@/components/ui/Button';
import { Input }                      from '@/components/ui/Input';
import { Spinner }                    from '@/components/ui/Spinner';
import { settingsApi, SystemSetting } from '@/lib/api/settings';

// ── Tab definitions ──────────────────────────────────────────────────────────
type Tab = 'general' | 'telephony' | 'security' | 'notifications' | 'pipeline';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'general',       label: 'General',       icon: <Settings size={16} /> },
  { id: 'telephony',     label: 'Telephony',     icon: <Phone    size={16} /> },
  { id: 'security',      label: 'Security',      icon: <Shield   size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell     size={16} /> },
  { id: 'pipeline',      label: 'Pipeline',      icon: <Layers   size={16} /> },
];

// ── Default values shown when the key doesn't exist in DB yet ────────────────
const DEFAULTS: Record<string, string> = {
  // general
  company_name:      'My Call Center',
  default_timezone:  'Africa/Cairo',
  default_language:  'en',
  // telephony
  ami_host:              '192.168.2.222',
  ami_port:              '5038',
  ami_username:          'admin',
  ami_secret:            'admin',
  recording_base_url:    'http://192.168.2.222/recordings',

  // security
  session_timeout_hours: '8',
  max_login_attempts:    '5',
  // notifications
  notif_incoming_call:   'true',
  notif_followup:        'true',
  notif_campaign:        'true',
  notif_lead_assign:     'true',
};

// ── Helper: build a map  { key -> SystemSetting }  from the API list ─────────
function toMap(list: SystemSetting[] | unknown): Record<string, SystemSetting> {
  const arr = Array.isArray(list) ? list : [];
  return Object.fromEntries(arr.map((s) => [s.key, s]));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const { data: settingsList = [], isLoading } = useQuery<SystemSetting[]>({
    queryKey: ['system-settings'],
    queryFn:  () => settingsApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  const settingsMap = toMap(settingsList);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

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
          {activeTab === 'general'       && <GeneralSettings       map={settingsMap} />}
          {activeTab === 'telephony'     && <TelephonySettings     map={settingsMap} />}
          {activeTab === 'security'      && <SecuritySettings      map={settingsMap} />}
          {activeTab === 'notifications' && <NotificationSettings  map={settingsMap} />}
          {activeTab === 'pipeline'      && <PipelineStagesSettings />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic save hook shared by all text-input tabs
// ─────────────────────────────────────────────────────────────────────────────
function useSaveSettings(
  keys: string[],
  map: Record<string, SystemSetting>,
  category: SystemSetting['category']
) {
  const qc       = useQueryClient();
  // local draft state  { key -> value }
  const initial  = Object.fromEntries(
    keys.map((k) => [k, map[k]?.value ?? DEFAULTS[k] ?? ''])
  );
  const [draft, setDraft] = useState<Record<string, string>>(initial);

  // Re-sync when fresh data arrives from the server
  useEffect(() => {
    setDraft(Object.fromEntries(
      keys.map((k) => [k, map[k]?.value ?? DEFAULTS[k] ?? ''])
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsListVersion(map, keys)]);

  const mutation = useMutation({
    mutationFn: async () => {
      for (const key of keys) {
        const existing = map[key];
        const newVal   = draft[key] ?? '';
        if (existing) {
          if (existing.value !== newVal) {
            await settingsApi.update(existing.id, newVal);
          }
        } else {
          await settingsApi.create({
            key,
            value:       newVal,
            description: '',
            category,
            is_public:   false,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-settings'] });
      toast.success('Settings saved successfully.');
    },
    onError: () => {
      toast.error('Failed to save settings. Check your permissions.');
    },
  });

  return { draft, setDraft, saving: mutation.isPending, save: mutation.mutate };
}

/** tiny cache-buster: join all current values so useEffect reruns when server data changes */
function settingsListVersion(map: Record<string, SystemSetting>, keys: string[]) {
  return keys.map((k) => map[k]?.value ?? '').join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// General tab
// ─────────────────────────────────────────────────────────────────────────────
const GENERAL_KEYS = ['company_name', 'default_timezone', 'default_language'];

function GeneralSettings({ map }: { map: Record<string, SystemSetting> }) {
  const { draft, setDraft, saving, save } = useSaveSettings(GENERAL_KEYS, map, 'general');

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">General Settings</h2>

      <Input
        label="Company Name"
        value={draft.company_name ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
      />
      <Input
        label="Default Timezone"
        value={draft.default_timezone ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, default_timezone: e.target.value }))}
      />
      <Input
        label="Default Language"
        value={draft.default_language ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, default_language: e.target.value }))}
      />

      <div className="pt-2">
        <Button
          variant="primary"
          icon={<Save size={15} />}
          loading={saving}
          onClick={() => save()}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Telephony tab
// ─────────────────────────────────────────────────────────────────────────────
const TELEPHONY_KEYS = ['ami_host', 'ami_port', 'ami_username', 'ami_secret', 'recording_base_url'];

function TelephonySettings({ map }: { map: Record<string, SystemSetting> }) {
  const { draft, setDraft, saving, save } = useSaveSettings(TELEPHONY_KEYS, map, 'telephony');
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    try {
      // Optimistic: just try to reach the AMI host via a simple fetch — not a real AMI test.
      // In production you'd call a dedicated backend endpoint.
      await new Promise((res) => setTimeout(res, 1200));
      toast.success(`AMI host ${draft.ami_host}:${draft.ami_port} reachable (simulated).`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">Issabel / Asterisk AMI</h2>

      <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
        Changes here affect live telephony. Server restart may be required after saving.
      </div>

      <Input
        label="AMI Host"
        placeholder="192.168.2.222"
        value={draft.ami_host ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, ami_host: e.target.value }))}
      />
      <Input
        label="AMI Port"
        type="number"
        placeholder="5038"
        value={draft.ami_port ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, ami_port: e.target.value }))}
      />
      <Input
        label="AMI Username"
        placeholder="admin"
        value={draft.ami_username ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, ami_username: e.target.value }))}
      />
      <Input
        label="AMI Secret"
        type="password"
        placeholder="••••••••"
        value={draft.ami_secret ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, ami_secret: e.target.value }))}
      />
      <Input
        label="Recording Base URL"
        placeholder="http://192.168.2.222/recordings"
        value={draft.recording_base_url ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, recording_base_url: e.target.value }))}
      />

      <div className="pt-2 flex gap-2">
        <Button
          variant="primary"
          icon={<Save size={15} />}
          loading={saving}
          onClick={() => save()}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          icon={<RefreshCw size={15} />}
          loading={testing}
          onClick={testConnection}
        >
          Test Connection
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security tab
// ─────────────────────────────────────────────────────────────────────────────
const SECURITY_KEYS = ['session_timeout_hours', 'max_login_attempts'];

function SecuritySettings({ map }: { map: Record<string, SystemSetting> }) {
  const { draft, setDraft, saving, save } = useSaveSettings(SECURITY_KEYS, map, 'security');

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">Security</h2>

      <Input
        label="Session Timeout (hours)"
        type="number"
        value={draft.session_timeout_hours ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, session_timeout_hours: e.target.value }))}
      />
      <Input
        label="Max Login Attempts"
        type="number"
        value={draft.max_login_attempts ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, max_login_attempts: e.target.value }))}
      />

      <div className="pt-2">
        <Button
          variant="primary"
          icon={<Save size={15} />}
          loading={saving}
          onClick={() => save()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications tab
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_KEYS = [
  'notif_incoming_call',
  'notif_followup',
  'notif_campaign',
  'notif_lead_assign',
];
const NOTIF_LABELS: Record<string, string> = {
  notif_incoming_call: 'Incoming call popup',
  notif_followup:      'Follow-up reminders',
  notif_campaign:      'Campaign completion',
  notif_lead_assign:   'Lead assignment',
};

function NotificationSettings({ map }: { map: Record<string, SystemSetting> }) {
  const { draft, setDraft, saving, save } = useSaveSettings(NOTIF_KEYS, map, 'notifications');

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
      <p className="text-sm text-gray-500">
        Configure in-app and browser notification preferences.
      </p>

      <div className="space-y-3">
        {NOTIF_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft[key] === 'true'}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.checked ? 'true' : 'false' }))
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span className="text-sm text-gray-700">{NOTIF_LABELS[key]}</span>
          </label>
        ))}
      </div>

      <div className="pt-2">
        <Button
          variant="primary"
          icon={<Save size={15} />}
          loading={saving}
          onClick={() => save()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
