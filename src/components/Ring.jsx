/** Kreisförmige Anzeige für Recovery, Strain und Schlaf. */
export default function Ring({ value, max = 100, color, label, display, sub, size = 132, pending }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ stroke: color, transition: 'stroke-dasharray .8s ease' }}
          fill="none"
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">{pending ? '…' : display}</div>
        <div className="ring-label">{label}</div>
      </div>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}
