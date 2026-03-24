'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SipClient, SipStatus, CallStatus, IncomingCallInfo, SipConfig } from './sipClient';

export function useSip(config: SipConfig | null) {
  const clientRef                     = useRef<SipClient | null>(null);
  const [sipStatus,  setSipStatus]    = useState<SipStatus>('disconnected');
  const [callStatus, setCallStatus]   = useState<CallStatus>('idle');
  const [incoming,   setIncoming]     = useState<IncomingCallInfo | null>(null);
  const [isMuted,    setIsMuted]      = useState(false);
  const [isOnHold,   setIsOnHold]     = useState(false);
  const [callTimer,  setCallTimer]    = useState(0);
  const timerRef                      = useRef<NodeJS.Timeout | null>(null);

  // Call timer
  useEffect(() => {
    if (callStatus === 'active') {
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallTimer(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  // Connect SIP
  useEffect(() => {
    if (!config) return;

    ;(window as any).__sipClient = null;   // reset before creating new
    const client = new SipClient(
      config,
      setSipStatus,
      setCallStatus,
      (info) => setIncoming(info),
      (cause) => {
        window.dispatchEvent(new CustomEvent('sip:endcause', { detail: cause }));
      },
    );

    clientRef.current = client;
    ;(window as any).__sipClient = client;   // expose for preload
    client.connect();

    return () => { client.disconnect(); };
  }, [config?.sipUri]);

  const call = useCallback((target: string) => {
    clientRef.current?.call(target);
  }, []);

  const answer = useCallback(() => {
    clientRef.current?.answer();
    setIncoming(null);
  }, []);

  const hangup = useCallback(() => {
    clientRef.current?.hangup();
    setIncoming(null);
    setIsMuted(false);
    setIsOnHold(false);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    clientRef.current?.mute(next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    const next = !isOnHold;
    clientRef.current?.hold(next);
    setIsOnHold(next);
  }, [isOnHold]);

  const sendDtmf = useCallback((tone: string) => {
    clientRef.current?.sendDtmf(tone);
  }, []);

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return {
    sipStatus, callStatus, incoming,
    isMuted, isOnHold,
    callTimer, formatTime,
    call, answer, hangup,
    toggleMute, toggleHold, sendDtmf,
  };
}
