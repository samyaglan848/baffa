'use client';

import { useCallback, useEffect } from 'react';

export type SoundType =
  | 'click'
  | 'tile'
  | 'knock'
  | 'pass'
  | 'shuffle'
  | 'invalid'
  | 'win'
  | 'defeat'
  | 'turn'
  | 'pop'
  | 'warning'
  | 'alarm';

// Global singleton AudioContext maintained across the entire application lifecycle
let sharedAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }
  } catch (err) {
    console.warn('AudioContext initialization failed:', err);
  }

  return sharedAudioCtx;
}

// Global unlock mechanism to comply with modern browser autoplay policies
export function unlockAudio(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  // iOS Safari unlock buffer trick
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Silent fail for buffer unlock
  }
}

// Attach capture-phase listeners on window to guarantee audio unlocks on first user interaction
if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];
  const handleUserInteraction = () => {
    unlockAudio();
    if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
      unlockEvents.forEach((ev) => window.removeEventListener(ev, handleUserInteraction, true));
    }
  };

  unlockEvents.forEach((ev) => {
    window.addEventListener(ev, handleUserInteraction, { capture: true, passive: true });
  });
}

export function useGameAudio(enabled: boolean = true) {
  useEffect(() => {
    // Keep context alive and resume if suspended
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;

      if (typeof window !== 'undefined') {
        const soundSetting = localStorage.getItem('baffa_sound_enabled');
        if (soundSetting === 'false') return;
      }

      const ctx = getOrCreateAudioContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      try {
        const t = ctx.currentTime;

        // 1. Tile Placement / Crisp Domino Clack (Heavy resin on felt table: "تَـكْ!")
        if (type === 'tile' || type === 'click') {
          // Sharp snappy attack (crisp resin click)
          const snapOsc = ctx.createOscillator();
          const snapGain = ctx.createGain();
          snapOsc.type = 'triangle';
          snapOsc.frequency.setValueAtTime(1600, t);
          snapOsc.frequency.exponentialRampToValueAtTime(350, t + 0.028);
          snapGain.gain.setValueAtTime(0.55, t);
          snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
          snapOsc.connect(snapGain);
          snapGain.connect(ctx.destination);
          snapOsc.start(t);
          snapOsc.stop(t + 0.028);

          // High click burst
          const clickOsc = ctx.createOscillator();
          const clickGain = ctx.createGain();
          clickOsc.type = 'square';
          clickOsc.frequency.setValueAtTime(2400, t);
          clickOsc.frequency.exponentialRampToValueAtTime(800, t + 0.012);
          clickGain.gain.setValueAtTime(0.35, t);
          clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
          clickOsc.connect(clickGain);
          clickGain.connect(ctx.destination);
          clickOsc.start(t);
          clickOsc.stop(t + 0.012);

          // Solid table felt thud
          const thumpOsc = ctx.createOscillator();
          const thumpGain = ctx.createGain();
          thumpOsc.type = 'sine';
          thumpOsc.frequency.setValueAtTime(310, t);
          thumpOsc.frequency.exponentialRampToValueAtTime(110, t + 0.06);
          thumpGain.gain.setValueAtTime(0.42, t);
          thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          thumpOsc.connect(thumpGain);
          thumpGain.connect(ctx.destination);
          thumpOsc.start(t);
          thumpOsc.stop(t + 0.06);
        }

        // 2. Pass / Knock (Iconic Egyptian cafe domino double-knock on hollow table: "طَقْ... طَقْ")
        else if (type === 'pass' || type === 'knock') {
          const playWoodKnock = (offset: number, baseFreq: number, vol: number) => {
            const kt = t + offset;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(baseFreq, kt);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, kt + 0.045);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(baseFreq, kt);
            filter.Q.setValueAtTime(4.0, kt);

            gain.gain.setValueAtTime(vol, kt);
            gain.gain.exponentialRampToValueAtTime(0.001, kt + 0.045);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(kt);
            osc.stop(kt + 0.045);
          };
          // Double hollow knock
          playWoodKnock(0, 440, 0.52);
          playWoodKnock(0.12, 350, 0.44);
        }

        // 3. Shuffle / Deal (Tiles scrambling across the felt)
        else if (type === 'shuffle') {
          for (let i = 0; i < 7; i++) {
            const st = t + i * 0.045;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = i % 2 === 0 ? 'triangle' : 'square';
            const freq = 550 + Math.sin(i * 1.7) * 260;
            osc.frequency.setValueAtTime(freq, st);
            osc.frequency.exponentialRampToValueAtTime(140, st + 0.035);
            gain.gain.setValueAtTime(0.16, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.035);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(st);
            osc.stop(st + 0.035);
          }
        }

        // 4. Your Turn Reminder (Gentle, pleasing chime)
        else if (type === 'turn') {
          const notes = [
            { freq: 659.25, time: 0, dur: 0.16 }, // E5
            { freq: 987.77, time: 0.07, dur: 0.28 }, // B5
          ];
          notes.forEach(({ freq, time, dur }) => {
            const nt = t + time;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, nt);
            gain.gain.setValueAtTime(0, nt);
            gain.gain.linearRampToValueAtTime(0.24, nt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, nt + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(nt);
            osc.stop(nt + dur);
          });
        }

        // 5. Win / Victory Fanfare (Rich major chord arpeggio)
        else if (type === 'win') {
          const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          freqs.forEach((freq, i) => {
            const wt = t + i * 0.085;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, wt);
            gain.gain.setValueAtTime(0, wt);
            gain.gain.linearRampToValueAtTime(0.28, wt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, wt + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(wt);
            osc.stop(wt + 0.45);
          });
        }

        // 6. Defeat / Loss (Soft minor descending tone)
        else if (type === 'defeat') {
          const freqs = [392.0, 311.13, 261.63]; // G4, Eb4, C4
          freqs.forEach((freq, i) => {
            const dt = t + i * 0.13;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, dt);
            gain.gain.setValueAtTime(0, dt);
            gain.gain.linearRampToValueAtTime(0.22, dt + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.001, dt + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(dt);
            osc.stop(dt + 0.35);
          });
        }

        // 7. Pop / Chat / Emoji Bubble (Bubbly frequency sweep)
        else if (type === 'pop') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.exponentialRampToValueAtTime(1150, t + 0.04);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.05);
        }

        // 8. Invalid Move / Blocked Move (Dull wooden rejection thud)
        else if (type === 'invalid') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.13);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.13);
        }

        // 9. Warning / Anti-cheat alert tone (Two crisp alternating alert pulses)
        else if (type === 'warning' || type === 'alarm') {
          const beeps = [
            { freq: 880, start: 0, dur: 0.09 },
            { freq: 659.25, start: 0.11, dur: 0.12 },
          ];
          beeps.forEach(({ freq, start, dur }) => {
            const bt = t + start;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, bt);
            gain.gain.setValueAtTime(0, bt);
            gain.gain.linearRampToValueAtTime(0.24, bt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, bt + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(bt);
            osc.stop(bt + dur);
          });
        }
      } catch (e) {
        console.warn('Audio synthesis failed:', e);
      }
    },
    [enabled]
  );

  return { playSound };
}
