import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AgentStatus } from '@/types';

interface AgentStatusState {
  status:    AgentStatus;
  setStatus: (s: AgentStatus) => void;
}

export const useAgentStatusStore = create<AgentStatusState>()(
  persist(
    (set) => ({
      status:    'offline',
      setStatus: (s) => set({ status: s }),
    }),
    {
      name:    'crm-agent-status',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem: () => null, setItem: () => {}, removeItem: () => {},
        }
      ),
    }
  )
);
