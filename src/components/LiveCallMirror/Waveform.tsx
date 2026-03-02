'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  GSAP Animated Waveform
//
//  Renders N vertical bars animated via GSAP:
//    Idle:   Gentle sine-wave undulation (low energy, gray)
//    Active: Amplitude-reactive bars that scale per-frame
//
//  Props:
//    amplitude  — 0.0–1.0 value (real or synthetic)
//    isActive   — true during live call
//    bars       — number of bars (default 48)
//    height     — pixel height of the container (default 72)
//    hue        — base HSL hue for bar color (default 185 = cyan)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface WaveformProps {
  amplitude: number;
  isActive:  boolean;
  bars?:     number;
  height?:   number;
  hue?:      number;
}

export function Waveform({ amplitude, isActive, bars = 48, height = 72, hue }: WaveformProps) {
  const barRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const tweensRef = useRef<gsap.core.Tween[]>([]);

  // ── Mount: start idle animation ────────────────────────────────────────────
  useEffect(() => {
    startIdleAnimation();
    return () => killAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars]);

  // ── Toggle idle/active ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) startIdleAnimation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Amplitude changes (active call) ────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    killAll();

    barRefs.current.forEach((bar, i) => {
      if (!bar) return;

      const center      = bars / 2;
      const distRatio   = Math.abs(i - center) / center;       // 0=center, 1=edge
      const peakScale   = amplitude * (1 - distRatio * 0.55);
      const jitter      = 0.85 + Math.random() * 0.3;
      const targetScale = Math.max(0.04, peakScale * jitter);

      const tween = gsap.to(bar, {
        scaleY:    targetScale,
        duration:  0.08 + Math.random() * 0.04,
        ease:      'power2.out',
        overwrite: true,
      });
      tweensRef.current.push(tween);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amplitude, isActive]);

  function killAll() {
    tweensRef.current.forEach((t) => t.kill());
    tweensRef.current = [];
  }

  function startIdleAnimation() {
    killAll();
    barRefs.current.forEach((bar, i) => {
      if (!bar) return;
      const tween = gsap.to(bar, {
        scaleY:    0.04 + Math.sin((i / bars) * Math.PI) * 0.08 + Math.random() * 0.03,
        duration:  1.2 + Math.random() * 1.0,
        repeat:    -1,
        yoyo:      true,
        ease:      'sine.inOut',
        delay:     i * 0.025,
        overwrite: true,
      });
      tweensRef.current.push(tween);
    });
  }

  // Bar width: thinner if many bars
  const barWidth = bars > 48 ? 2.5 : 3;

  return (
    <div
      className="flex items-center justify-center gap-[2px] px-6 select-none"
      style={{ height: `${height}px` }}
      aria-label="Audio waveform visualiser"
      role="img"
    >
      {Array.from({ length: bars }).map((_, i) => {
        // Color gradient: base hue at center, shifts toward edges
        const baseHue = hue ?? (isActive ? 185 : 220);
        const hueShift = (Math.abs(i - bars / 2) / (bars / 2)) * 25;
        const barHue = baseHue + hueShift;
        const sat = isActive ? 70 : 12;
        const lig = isActive ? 58 : 32;

        return (
          <div
            key={i}
            ref={(el) => { barRefs.current[i] = el; }}
            className="rounded-full origin-center"
            style={{
              width:           `${barWidth}px`,
              height:          `${height * 0.75}px`,
              backgroundColor: `hsl(${barHue}, ${sat}%, ${lig}%)`,
              transform:       'scaleY(0.05)',
              transition:      'background-color 400ms ease',
              willChange:      'transform',
            }}
          />
        );
      })}
    </div>
  );
}
