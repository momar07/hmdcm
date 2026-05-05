'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SipClient, SipStatus, CallStatus, IncomingCallInfo, SipConfig } from './sipClient';
import { useSipStore } from '@/store/sipStore';

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
    let disconnected  = false;
    let retryCount    = 0;
    const MAX_RETRIES = 10;

    const client = new SipClient(
      config,
      (status) => {
        setSipStatus(status);
        if (status === 'error' || status === 'disconnected') {
          if (disconnected) return;
          if (retryCount >= MAX_RETRIES) {
            console.error('[useSip] Max retries reached — giving up');
            return;
          }
          const delay = Math.min(5000 * Math.pow(1.5, retryCount), 60000);
          retryCount++;
          console.log(`[useSip] SIP disconnected/error — retry ${retryCount}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
          setTimeout(() => {
            if (disconnected) return;
            if (clientRef.current === client) {
              console.log('[useSip] Retrying SIP connection...');
              try { client.disconnect(); } catch (_) {}
              try { client.connect(); } catch (e) { console.error('[useSip] Retry failed:', e); }
            }
          }, delay);
        } else if (status === 'registered') {
          retryCount = 0;
        }
      },
      setCallStatus,
      (info) => {
        setIncoming(info);
        useSipStore.getState().setIncoming(info ? { from: info.from, displayName: info.displayName } : null);
      },
      (cause) => {
        window.dispatchEvent(new CustomEvent('sip:endcause', { detail: cause }));
      },
    );

    clientRef.current = client;
    ;(window as any).__sipClient = client;   // expose for preload
    client.connect();

    return () => {
      disconnected = true;
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [config?.sipUri]);

  const call = useCallback((target: string) => {
    clientRef.current?.call(target);
  }, []);

  const answer = useCallback(() => {
    console.log('[useSip] answer() called, client exists:', !!clientRef.current);
    if (!clientRef.current) {
      console.error('[useSip] answer() called but SipClient is null!');
      return;
    }
    clientRef.current.answer();
    setIncoming(null);
    useSipStore.getState().setIncoming(null);
  }, []);

  const hangup = useCallback(() => {
    clientRef.current?.hangup();
    setIncoming(null);
    useSipStore.getState().setIncoming(null);
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
