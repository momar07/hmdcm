"use client";
import { useState, useEffect, useCallback } from "react";
import { ticketsApi } from "@/lib/api/tickets";
import type { Ticket, TicketFilters, PaginatedResponse } from "@/types/tickets";

export function useTickets(initialFilters: TicketFilters = {}) {
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [total, setTotal]         = useState(0);
  const [filters, setFilters]     = useState<TicketFilters>({ page: 1, page_size: 20, ...initialFilters });

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res: PaginatedResponse<Ticket> = await ticketsApi.list(filters);
      setTickets(res.results);
      setTotal(res.count);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const updateFilter = (key: keyof TicketFilters, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value, page: key === "page" ? value : 1 }));

  return { tickets, loading, error, total, filters, updateFilter, refetch: fetchTickets };
}

export function useDashboardStats() {
  const [stats, setStats]       = useState<any>(null);
  const [workload, setWorkload] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    ticketsApi.getDashboard()
      .then(d => { setStats(d.stats); setWorkload(d.workload ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { stats, workload, loading };
}
