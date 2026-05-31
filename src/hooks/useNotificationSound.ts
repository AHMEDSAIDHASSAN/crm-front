/**
 * Plays Web Audio API tones for CRM notification events.
 * No audio files required — tones are generated in-browser.
 * Respects a user-controlled mute preference stored in localStorage.
 */
import { useCallback, useRef } from 'react';

const STORAGE_KEY = 'sira_notif_sound';

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

// Shared AudioContext — created once, resumed on user interaction
let sharedCtx: AudioContext | null = null;

function getOrCreateCtx(): AudioContext | null {
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedCtx;
  } catch { return null; }
}

// Unlock audio on first user interaction (browsers block autoplay)
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getOrCreateCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
  };
  window.addEventListener('click', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
}

/** Play a sequence of [freq, startTime, duration, gain] notes. */
async function playNotes(notes: [number, number, number, number][]) {
  const ctx = getOrCreateCtx();
  if (!ctx) return;
  // Resume if suspended (autoplay policy)
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return; }
  }
  if (ctx.state !== 'running') return;

  const master = ctx.createGain();
  master.gain.value = 0.25;
  master.connect(ctx.destination);

  for (const [freq, start, dur, gain] of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, ctx.currentTime + start);
    env.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }
}

/** Ascending chime — lead assigned ✓ */
function playAssigned() {
  playNotes([
    [880,  0,    0.15, 1],
    [1108, 0.12, 0.15, 0.85],
    [1320, 0.24, 0.30, 0.7],
  ]);
}

/** Descending alert — lead retracted ✗ */
function playRetracted() {
  playNotes([
    [660, 0,    0.18, 1],
    [494, 0.15, 0.18, 0.85],
    [370, 0.30, 0.30, 0.7],
  ]);
}

export function useNotificationSound() {
  const lastPlayedRef = useRef<Record<string, number>>({});

  const play = useCallback((type: 'assigned' | 'retracted') => {
    if (!isSoundEnabled()) return;
    // Debounce same sound type to avoid stacking
    const now = Date.now();
    if (now - (lastPlayedRef.current[type] ?? 0) < 1200) return;
    lastPlayedRef.current[type] = now;
    if (type === 'assigned') playAssigned();
    else playRetracted();
  }, []);

  return { play };
}
