'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Phone, PhoneOff,
  Mic, MicOff, PauseCircle, PlayCircle,
  Loader2,
} from 'lucide-react';
import { useSip }       from '@/lib/sip/useSip';
import { useAuthStore } from '@/store';
import { useSipStore }  from '@/store/sipStore';

export function SoftPhone() {
  const { user }        = useAuthStore();
  const [open, setOpen] = useState(false);
  const [dialNum, setDialNum] = useState('');

  const {
    setSipStatus, setCallStatus,
    setMuted, setOnHold, setCallTimer,
    registerActions,
    callStatus, isMuted, isOnHold, callTimer,
  } = useSipStore();

  // Unlock autoplay on first user interaction
  useEffect(() => {
    const unlock = () => {
      const silent = new Audio('/sounds/ringing.mp3');
      silent.volume = 0;
      silent.play().then(() => {
        silent.pause();
        console.log('[SIP] Autoplay unlocked ✅');
      }).catch(() => {});
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  const extNumber   = user?.extension?.number   ?? null;
  const sipSecret   = user?.extension?.secret   ?? null;

  // Only connect if both extension number AND sip secret are set
  const sipConfig = (extNumber && sipSecret) ? {
    wsUrl:       'ws://192.168.2.222:8088/ws',
    sipUri:      `sip:${extNumber}@192.168.2.222`,
    password:    sipSecret,
    displayName: user?.full_name ?? extNumber,
  } : null;

  const {
    sipStatus, callStatus: localCallStatus, incoming,
    isMuted: localMuted, isOnHold: localHold,
    callTimer: localTimer, formatTime,
    call, answer, hangup,
    toggleMute, toggleHold, sendDtmf,
  } = useSip(sipConfig);

  // Sync local SIP state → global store
  useEffect(() => { setSipStatus(sipStatus); },           [sipStatus]);
  useEffect(() => { setCallStatus(localCallStatus); },    [localCallStatus]);
  useEffect(() => { setMuted(localMuted); },              [localMuted]);
  useEffect(() => { setOnHold(localHold); },              [localHold]);
  useEffect(() => { setCallTimer(localTimer); },          [localTimer]);

  // Register actions in store so IncomingCallPopup can call them
  useEffect(() => {
    registerActions({ answer, hangup, toggleMute, toggleHold });
  }, [answer, hangup, toggleMute, toggleHold]);

  // Status colours
  const statusDot: Record<string, string> = {
    disconnected: 'bg-gray-400',
    connecting:   'bg-yellow-400 animate-pulse',
    registered:   'bg-green-500',
    error:        'bg-red-500',
  };
  const statusLabel: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting:   'Connecting...',
    registered:   'Ready',
    error:        'Error',
  };

  const formatTimeFn = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 w-64 select-none">

      {open && (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200
                        overflow-hidden mb-2 transition-all">

          {/* Header */}
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot[sipStatus]}`} />
              <span className="text-white text-sm font-medium">
                {statusLabel[sipStatus]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs">Ext {extNumber ?? '—'}</span>
              {sipStatus === 'connecting' && (
                <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
              )}
            </div>
          </div>

          {/* ACTIVE CALL controls */}
          {(localCallStatus === 'active' || localCallStatus === 'holding') && (
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {localCallStatus === 'holding' ? '⏸ On Hold' : '🔴 In Call'}
                </span>
                <span className="text-sm font-mono font-bold text-gray-800">
                  {formatTimeFn(localTimer)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={toggleMute}
                  className={`flex-1 flex items-center justify-center gap-1
                              rounded-lg py-2 text-xs font-medium transition-colors
                              ${localMuted
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {localMuted
                    ? <><MicOff className="w-3 h-3" /> Unmute</>
                    : <><Mic    className="w-3 h-3" /> Mute</>}
                </button>
                <button
                  onClick={toggleHold}
                  className={`flex-1 flex items-center justify-center gap-1
                              rounded-lg py-2 text-xs font-medium transition-colors
                              ${localHold
                                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {localHold
                    ? <><PlayCircle  className="w-3 h-3" /> Resume</>
                    : <><PauseCircle className="w-3 h-3" /> Hold</>}
                </button>
              </div>
              <button
                onClick={hangup}
                className="w-full mt-2 flex items-center justify-center gap-2
                           bg-red-500 hover:bg-red-600 text-white
                           rounded-lg py-2 text-sm font-medium transition-colors"
              >
                <PhoneOff className="w-4 h-4" /> Hang Up
              </button>
            </div>
          )}

          {/* OUTGOING RINGING */}
          {localCallStatus === 'ringing' && (
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="w-4 h-4 text-green-600 animate-pulse" />
                <span className="text-sm font-medium text-gray-700">
                  Calling {dialNum}...
                </span>
              </div>
              <button
                onClick={hangup}
                className="w-full flex items-center justify-center gap-2
                           bg-red-500 hover:bg-red-600 text-white
                           rounded-lg py-2 text-sm font-medium transition-colors"
              >
                <PhoneOff className="w-4 h-4" /> Cancel
              </button>
            </div>
          )}

          {/* DIALPAD — only when idle */}
          {localCallStatus === 'idle' && (
            <div className="p-4">
              <div className="flex gap-2 mb-3">
                <input
                  type="tel"
                  value={dialNum}
                  onChange={e => setDialNum(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && dialNum && call(dialNum)}
                  placeholder="Enter number..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2
                             text-sm focus:outline-none focus:ring-2
                             focus:ring-blue-300"
                />
                <button
                  onClick={() => dialNum && call(dialNum)}
                  disabled={!dialNum || sipStatus !== 'registered'}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-200
                             text-white disabled:text-gray-400 rounded-lg px-3"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if ((localCallStatus as string) === 'active') sendDtmf(k);
                      else setDialNum(p => p + k);
                    }}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700
                               rounded-lg py-2 text-sm font-medium
                               border border-gray-100"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center
                    justify-center transition-all relative
                    ${sipStatus === 'registered'
                      ? 'bg-green-500 hover:bg-green-600'
                      : sipStatus === 'connecting'
                      ? 'bg-yellow-500 hover:bg-yellow-600'
                      : 'bg-gray-500 hover:bg-gray-600'
                    }`}
      >
        <Phone className="w-5 h-5 text-white" />
        {(localCallStatus === 'active' || localCallStatus === 'holding') && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
        )}
      </button>
    </div>
  );
}
