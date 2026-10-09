import { useEffect, useState } from "react";
import "../styles/startup-splash.css";

export default function StartupSplash({ onComplete }: { onComplete: () => void }) {
  const [complete, setComplete] = useState(false);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const timer = window.setTimeout(() => setComplete(true), reduced ? 900 : 3600);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  useEffect(() => { if (complete) onComplete(); }, [complete, onComplete]);
  return <div className={`pops-startup-splash ${reduced ? "pops-startup-reduced" : ""}`} role="dialog" aria-label="P.O.P.S. startup splash">
    <div className="pops-startup-field" />
    <div className="pops-startup-content">
      <div className="pops-startup-signatures" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <div className="pops-startup-guardian" aria-hidden="true"><i /><i /><i /><i /><i /><i /><b /></div>
      <h1>P.O.P.S.</h1><p className="pops-startup-subtitle">Proof of Presence System</p><p className="pops-startup-tagline">Preserve. Protect. Prove.</p>
    </div>
  </div>;
}
