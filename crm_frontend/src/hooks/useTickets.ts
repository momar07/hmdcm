"use client";
import { useState, useEffect, useCallback } from "react";
import { ticketsApi } from "@/lib/api/tickets";
import type {
  TicketListItem,
  TicketFilters,
  PaginatedTickets,
  TicketDashboard,
  TicketStats,
  AgentWorkload,
} from "@/types/tickets";

export function useTickets(initialFilters: TicketFilters = {}) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [total,   setTotal]   = useState(0);
  const [filters, setFilters] = useState<TicketFilters>({
    page: 1, page_size: 20, ...initialFilters,
  });

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await ticketsApi.list(filters);
      const data = res?.data ?? res as unknown as PaginatedTickets;
      setTickets(data.results ?? []);
      setTotal(data.count ?? 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load tickets";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const updateFilter = (key: keyof TicketFilters, value: unknown) =>
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));

  return { tickets, loading, error, total, filters, updateFilter, refetch: fetchTickets };
}

export function useDashboardStats() {
  const [stats,    setStats]    = useState<TicketStats | null>(null);
  const [workload, setWorkload] = useState<AgentWorkload[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    ticketsApi
      .dashboard()
      .then((res: { data: TicketDashboard }) => {
        setStats(res.data.stats);
        setWorkload(res.data.workload ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { stats, workload, loading };
}
