import { create } from 'zustand';
import { notificationsApi, type Notification } from '@/lib/api/notifications';

interface NotificationsState {
  items:        Notification[];
  unreadCount:  number;
  loading:      boolean;
  open:         boolean;

  // actions
  setOpen:        (v: boolean) => void;
  toggleOpen:     () => void;
  fetchAll:       () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  addRealtime:    (n: Notification) => void;   // called from WS
  markRead:       (id: string) => Promise<void>;
  markAllRead:    () => Promise<void>;
  remove:         (id: string) => Promise<void>;
  reset:          () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items:       [],
  unreadCount: 0,
  loading:     false,
  open:        false,

  setOpen:    (v) => set({ open: v }),
  toggleOpen: () => set((s) => ({ open: !s.open })),

  fetchAll: async () => {
    set({ loading: true });
    try {
      const { data } = await notificationsApi.list();
      set({
        items:       data.results,
        unreadCount: data.results.filter((n) => !n.is_read).length,
      });
    } catch (e) {
      console.error('[notifications] fetchAll failed', e);
    } finally {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await notificationsApi.unreadCount();
      set({ unreadCount: data.count });
    } catch (e) {
      console.error('[notifications] unreadCount failed', e);
    }
  },

  addRealtime: (n) => {
    const cur = get().items;
    if (cur.find((x) => x.id === n.id)) return; // dedupe
    set({
      items:       [n, ...cur].slice(0, 50),
      unreadCount: get().unreadCount + (n.is_read ? 0 : 1),
    });
  },

  markRead: async (id) => {
    try {
      await notificationsApi.markRead(id);
      set((s) => ({
        items: s.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch (e) {
      console.error('[notifications] markRead failed', e);
    }
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead();
      set((s) => ({
        items: s.items.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      console.error('[notifications] markAllRead failed', e);
    }
  },

  remove: async (id) => {
    try {
      await notificationsApi.remove(id);
      set((s) => {
        const removed = s.items.find((n) => n.id === id);
        return {
          items:       s.items.filter((n) => n.id !== id),
          unreadCount: removed && !removed.is_read
            ? Math.max(0, s.unreadCount - 1)
            : s.unreadCount,
        };
      });
    } catch (e) {
      console.error('[notifications] remove failed', e);
    }
  },

  reset: () => set({ items: [], unreadCount: 0, loading: false, open: false }),
}));
