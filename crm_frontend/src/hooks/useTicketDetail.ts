"use client";
import { useState, useEffect, useCallback } from "react";
import { ticketsApi } from "@/lib/api/tickets";
import type { TicketDetail, TicketUpdatePayload } from "@/types/tickets";

export function useTicketDetail(id: string) {
  const [ticket,  setTicket]  = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  const fetch = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await ticketsApi.get(id);
      setTicket(res.data);
    } catch {
      setError("Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (payload: TicketUpdatePayload) => {
    if (!id) return;
    try {
      setSaving(true);
      const res = await ticketsApi.update(id, payload);
      setTicket(res.data);
      return res.data;
    } catch {
      throw new Error("Failed to update ticket");
    } finally {
      setSaving(false);
    }
  };

  const addNote = async (content: string, visibility: "internal" | "public") => {
    const res = await ticketsApi.addNote(id, { content, visibility });
    await fetch();
    return res.data;
  };

  return { ticket, loading, error, saving, refetch: fetch, update, addNote };
}
