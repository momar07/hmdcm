'use client';

import { useState, useEffect } from 'react';
import {
  Phone, PhoneOff, PhoneIncoming,
  Mic, MicOff, PauseCircle, PlayCircle,
  Loader2,
} from 'lucide-react';
import { useSip } from '@/lib/sip/useSip';
import { useAuthStore } from '@/store';

export function SoftPhone() {
  const { user }          = useAuthStore();
  const [open, setOpen]   = useState(false);
  const [dialNum, setDialNum] = useState('');

  // Unlock autoplay on first user interaction
  useEffect(() => {
    const unlock = () => {
      const silent = new Audio('/sounds/ringing.mp3');
      silent.volume = 0;
      silent.play().then(() => {
        silent.pause();
        console.log('[SIP] Autoplay unlocked ✅');
      }).catch(() => {});
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // extension is stored as string (extension number) in AuthUser
  const extNumber = user?.extension as string | null;

  const sipConfig = extNumber ? {
    wsUrl:       'ws://192.168.2.222:8088/ws',
    sipUri:      `sip:${extNumber}@192.168.2.222`,
    password:    'sip123456',
    displayName: user?.full_name ?? extNumber,
  } : null;

  const {
    sipStatus, callStatus, incoming,
    isMuted, isOnHold,
    callTimer, formatTime,
    call, answer, hangup,
    toggleMute, toggleHold, sendDtmf,
  } = useSip(sipConfig);

  // Auto-open panel on incoming call
  useEffect(() => {
    if (incoming) setOpen(true);
  }, [incoming]);

  // Status dot color
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

  return (
    <div className="fixed bottom-4 left-4 z-50 w-64 select-none">

      {/* ── Panel ── */}
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
              <span className="text-gray-400 text-xs">
                Ext {extNumber ?? '—'}
              </span>
              {sipStatus === 'connecting' && (
                <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
              )}
            </div>
          </div>

          {/* ── INCOMING CALL ── */}
          {callStatus === 'incoming' && incoming && (
            <div className="p-4 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <PhoneIncoming className="w-4 h-4 text-blue-600 animate-pulse" />
                <span className="text-sm font-semibold text-blue-800">
                  Incoming Call
                </span>
              </div>
              <p className="text-gray-800 font-medium text-sm mb-1">
                {incoming.displayName}
              </p>
              <p className="text-gray-500 text-xs mb-3">{incoming.from}</p>
              <div className="flex gap-2">
                <button
                  onClick={answer}
                  className="flex-1 flex items-center justify-center gap-1
                             bg-green-500 hover:bg-green-600 text-white
                             rounded-lg py-2 text-sm font-medium transition-colors"
                >
                  <Phone className="w-4 h-4" /> Answer
                </button>
                <button
                  onClick={hangup}
                  className="flex-1 flex items-center justify-center gap-1
                             bg-red-500 hover:bg-red-600 text-white
                             rounded-lg py-2 text-sm font-medium transition-colors"
                >
                  <PhoneOff className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          )}

          {/* ── ACTIVE CALL ── */}
          {(callStatus === 'active' || callStatus === 'holding') && (
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {callStatus === 'holding' ? '⏸ On Hold' : '🔴 In Call'}
                </span>
                <span className="text-sm font-mono font-bold text-gray-800">
                  {formatTime(callTimer)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={toggleMute}
                  className={`flex-1 flex items-center justify-center gap-1
                              rounded-lg py-2 text-xs font-medium transition-colors
                              ${isMuted
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {isMuted
                    ? <><MicOff className="w-3 h-3" /> Unmute</>
                    : <><Mic className="w-3 h-3" /> Mute</>}
                </button>
                <button
                  onClick={toggleHold}
                  className={`flex-1 flex items-center justify-center gap-1
                              rounded-lg py-2 text-xs font-medium transition-colors
                              ${isOnHold
                                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {isOnHold
                    ? <><PlayCircle className="w-3 h-3" /> Resume</>
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

          {/* ── OUTGOING RINGING ── */}
          {callStatus === 'ringing' && (
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

          {/* ── DIALPAD ── */}
          {callStatus === 'idle' && (
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
                             focus:ring-blue-300 focus:border-transparent"
                />
                <button
                  onClick={() => dialNum && call(dialNum)}
                  disabled={!dialNum || sipStatus !== 'registered'}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-200
                             text-white disabled:text-gray-400 rounded-lg px-3
                             transition-colors"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-1">
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if ((callStatus as string) === 'active') {
                        sendDtmf(k);
                      } else {
                        setDialNum(p => p + k);
                      }
                    }}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700
                               rounded-lg py-2 text-sm font-medium
                               transition-colors border border-gray-100"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Toggle Button ── */}
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

        {/* Incoming call badge */}
        {callStatus === 'incoming' && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500
                           rounded-full animate-ping" />
        )}
      </button>
    </div>
  );
}
