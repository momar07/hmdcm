import { create } from 'zustand';
import type { IncomingCallEvent, Call } from '@/types';

interface CallState {
  // Active incoming call popup
  incomingCall:    IncomingCallEvent | null;
  // Current active call
  activeCall:      Call | null;
  // Recent calls list (last 20)
  recentCalls:     Call[];
  // Screen pop customer info
  screenPopOpen:   boolean;

  setIncomingCall: (call: IncomingCallEvent | null) => void;
  setActiveCall:   (call: Call | null)               => void;
  addRecentCall:   (call: Call)                      => void;
  openScreenPop:   ()                                => void;
  closeScreenPop:  ()                                => void;
  clearIncoming:   ()                                => void;
}

export const useCallStore = create<CallState>()((set) => ({
  incomingCall:   null,
  activeCall:     null,
  recentCalls:    [],
  screenPopOpen:  false,

  setIncomingCall: (call) =>
    set({
      incomingCall:  call,
      screenPopOpen: !!call,
      // keep activeCall if already on call
    }),

  setActiveCall:   (call) => set({ activeCall: call }),

  addRecentCall:   (call) =>
    set((state) => ({
      recentCalls: [call, ...state.recentCalls].slice(0, 20),
    })),

  openScreenPop:  () => set({ screenPopOpen: true }),
  closeScreenPop: () => set({ screenPopOpen: false }),
  clearIncoming:  () => set({ incomingCall: null, screenPopOpen: false }),
}));
