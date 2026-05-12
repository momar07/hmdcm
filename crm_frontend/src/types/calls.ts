export interface CallDetail {
  id: string;
  started_at: string | null;
  duration: number;
  direction: 'inbound' | 'outbound' | 'internal' | '';
  status: string;
  agent_name: string;
  caller_number: string;
  callee_number: string;
  disposition_name: string;
  disposition_color: string;
  completion_note: string;
  recording_url: string | null;
  can_listen: boolean;
}
