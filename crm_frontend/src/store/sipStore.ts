import { create } from 'zustand';
import type { CallStatus, SipStatus } from '@/lib/sip/sipClient';

interface SipActions {
  answer:     () => void;
  hangup:     () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  call:       (target: string) => void;
}

interface SipStore {
  sipStatus:   SipStatus;
  callStatus:  CallStatus;
  isMuted:     boolean;
  isOnHold:    boolean;
  callTimer:   number;
  actions:     SipActions | null;
  lastEndCause: string | null;

  setSipStatus:    (s: SipStatus)  => void;
  setCallStatus:   (s: CallStatus) => void;
  setMuted:        (v: boolean)    => void;
  setOnHold:       (v: boolean)    => void;
  setCallTimer:    (v: number)     => void;
  registerActions: (a: SipActions) => void;
  setLastEndCause: (c: string | null) => void;
}

export const useSipStore = create<SipStore>()((set) => ({
  sipStatus:    'disconnected',
  callStatus:   'idle',
  isMuted:      false,
  isOnHold:     false,
  callTimer:    0,
  actions:      null,
  lastEndCause: null,

  setSipStatus:    (s) => set({ sipStatus: s }),
  setCallStatus:   (s) => set({ callStatus: s }),
  setMuted:        (v) => set({ isMuted: v }),
  setOnHold:       (v) => set({ isOnHold: v }),
  setCallTimer:    (v) => set({ callTimer: v }),
  registerActions: (a) => set({ actions: a }),
  setLastEndCause: (c) => set({ lastEndCause: c }),
}));
