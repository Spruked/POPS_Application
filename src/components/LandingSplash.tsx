'use client';

import { useEffect, useRef, useState } from 'react';

const SPLASH_KEY = 'spruked:u-macron-splash-seen';
const DROP_SOUND_MS = 1680;

function playGlassDrop(delaySeconds = 0) {
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) return;

  const audio = new AudioCtor();
  const now = audio.currentTime;
  const hit = now + Math.max(0, delaySeconds);
  const master = audio.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.exponentialRampToValueAtTime(0.22, hit + 0.012);
  master.gain.exponentialRampToValueAtTime(0.001, hit + 1.15);
  master.connect(audio.destination);

  const plink = audio.createOscillator();
  const plinkGain = audio.createGain();
  plink.type = 'sine';
  plink.frequency.setValueAtTime(1320, hit);
  plink.frequency.exponentialRampToValueAtTime(620, hit + 0.18);
  plinkGain.gain.setValueAtTime(0.001, hit);
  plinkGain.gain.exponentialRampToValueAtTime(0.35, hit + 0.006);
  plinkGain.gain.exponentialRampToValueAtTime(0.001, hit + 0.42);
  plink.connect(plinkGain).connect(master);
  plink.start(hit);
  plink.stop(hit + 0.44);

  [880, 1180, 1760].forEach((frequency, index) => {
    const ring = audio.createOscillator();
    const ringGain = audio.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(frequency, hit + 0.035 + index * 0.018);
    ringGain.gain.setValueAtTime(0.001, hit + 0.03);
    ringGain.gain.exponentialRampToValueAtTime(0.12 / (index + 1), hit + 0.06 + index * 0.018);
    ringGain.gain.exponentialRampToValueAtTime(0.001, hit + 0.86 + index * 0.08);
    ring.connect(ringGain).connect(master);
    ring.start(hit + 0.03 + index * 0.018);
    ring.stop(hit + 0.96 + index * 0.08);
  });

  const splash = audio.createBufferSource();
  const buffer = audio.createBuffer(1, audio.sampleRate * 0.16, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const decay = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  const filter = audio.createBiquadFilter();
  const splashGain = audio.createGain();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1650, hit);
  splashGain.gain.setValueAtTime(0.001, hit + 0.025);
  splashGain.gain.exponentialRampToValueAtTime(0.075, hit + 0.045);
  splashGain.gain.exponentialRampToValueAtTime(0.001, hit + 0.18);
  splash.buffer = buffer;
  splash.connect(filter).connect(splashGain).connect(master);
  splash.start(hit + 0.025);
  splash.stop(hit + 0.2);
}

export default function LandingSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [showEnter, setShowEnter] = useState(false);
  const [animate, setAnimate] = useState(false);
  const soundPlayedRef = useRef(false);
  const soundTimerRef = useRef<number | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const playOnce = () => {
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    try {
      playGlassDrop();
    } catch {}
  };

  useEffect(() => {
    const forceSplash = window.location.search.includes('splash=1');
    const seen = window.sessionStorage.getItem(SPLASH_KEY);
    if (seen && !forceSplash) {
      setVisible(false);
      return;
    }

    startedAtRef.current = window.performance.now();
    const startTimer = window.setTimeout(() => {
      setAnimate(true);
      soundTimerRef.current = window.setTimeout(playOnce, DROP_SOUND_MS);
    }, 80);

    return () => {
      window.clearTimeout(startTimer);
      if (soundTimerRef.current) window.clearTimeout(soundTimerRef.current);
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
    };
  }, []);

  const armSound = () => {
    if (soundPlayedRef.current) return;
    if (soundTimerRef.current) {
      window.clearTimeout(soundTimerRef.current);
      soundTimerRef.current = null;
    }
    soundPlayedRef.current = true;
    const elapsedMs = window.performance.now() - startedAtRef.current;
    const remainingSeconds = Math.max(0, DROP_SOUND_MS - elapsedMs) / 1000;
    try {
      playGlassDrop(remainingSeconds);
    } catch {}
  };

  const enterSite = () => {
    window.sessionStorage.setItem(SPLASH_KEY, '1');
    setExiting(true);
    window.setTimeout(() => setVisible(false), 520);
  };

  const revealEnter = () => {
    if (showEnter) return;
    if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
    enterTimerRef.current = window.setTimeout(() => setShowEnter(true), 160);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center bg-black transition-opacity duration-500 ${
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-label="Spruked splash screen"
      onPointerDown={armSound}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.14),transparent_30%),radial-gradient(circle_at_50%_58%,rgba(255,0,0,0.16),transparent_38%)]" />
      <div className="relative flex min-h-[360px] w-full max-w-xl flex-col items-center justify-center px-6">
        <svg
          className={`spruked-u-splash h-[min(72vw,430px)] w-[min(72vw,430px)] ${
            animate ? 'spruked-u-splash-run' : ''
          }`}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            className="spruked-u-draw"
            d="M 42 62 L 42 120 Q 42 160 72 160 L 128 160 Q 158 160 158 120 L 158 62"
            stroke="#FFFFFF"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            className="spruked-macron-collapse"
            x1="55"
            y1="34"
            x2="145"
            y2="34"
            stroke="#FF0000"
            strokeWidth="13"
            strokeLinecap="round"
          >
            <animate
              attributeName="y1"
              from="34"
              to="145"
              begin={animate ? '0.82s' : 'indefinite'}
              dur="1.08s"
              calcMode="spline"
              keySplines="0.58 0 0.16 1"
              fill="freeze"
            />
            <animate
              attributeName="y2"
              from="34"
              to="55"
              begin={animate ? '0.82s' : 'indefinite'}
              dur="1.08s"
              calcMode="spline"
              keySplines="0.58 0 0.16 1"
              fill="freeze"
            />
          </line>
          <ellipse
            className="spruked-glass-ripple"
            cx="58"
            cy="145"
            rx="24"
            ry="7"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
          <ellipse
            className="spruked-glass-ripple spruked-glass-ripple-red"
            cx="58"
            cy="145"
            rx="15"
            ry="4"
            stroke="#FF0000"
            strokeWidth="2"
          />
        </svg>
        <div className="spruked-enter-sync" onAnimationEnd={revealEnter} />
        <button
          type="button"
          className={`spruked-enter-button absolute bottom-4 rounded-full border border-truth/60 bg-black px-10 py-4 text-sm font-black uppercase tracking-[0.34em] text-white shadow-[0_0_30px_rgba(255,0,0,0.2)] transition hover:border-truth hover:bg-truth hover:text-black ${
            showEnter ? 'spruked-enter-button-ready' : ''
          }`}
          onClick={enterSite}
          disabled={!showEnter}
        >
          Enter
        </button>
      </div>
    </div>
  );
}
