import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar:    ()            => void;
  setSidebar:       (v: boolean)  => void;
  theme:            'light' | 'dark';
  toggleTheme:      ()            => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar:   () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebar:      (v) => set({ sidebarCollapsed: v }),
  theme:           'light',
  toggleTheme:     () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
