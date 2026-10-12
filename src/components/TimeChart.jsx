import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fmtDay, fmtShortDay } from '../lib/format.js';

/** Misst die Breite des Containers (für responsive SVG-Charts). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Balken mit 4px abgerundetem Ende, an der Basislinie verankert. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Generischer Zeitreihen-Chart.
 * type: 'bar' | 'line' | 'stack'
 * rows: Array von Tageszeilen (mit .date)
 * value: (row) => Zahl | null            (bar/line)
 * series: [{ key, label, color }] + stackValue(row, key)   (stack)
 * color: (row) => CSS-Farbe              (bar, optional)
 * tooltip: (row) => ReactNode
 */
export default function TimeChart({
  type = 'bar',
  rows,
  value,
  series,
  stackValue,
  color,
  domain,
  formatY = (v) => v,
  tooltip,
  reference,
  height = 200,
  ariaLabel,
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const m = { top: 12, right: type === 'line' ? 44 : 8, bottom: 26, left: 36 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const n = rows.length;
  const band = iw / Math.max(1, n);

  const totals = useMemo(
    () =>
      rows.map((r) =>
        type === 'stack'
          ? series.reduce((s, ser) => s + (stackValue(r, ser.key) || 0), 0)
          : value(r)
      ),
    [rows, type, series, stackValue, value]
  );

  const vals = totals.filter((v) => v != null);
  let [dMin, dMax] = domain || [
    type === 'line' ? Math.min(...vals) : 0,
    Math.max(...vals, reference ?? -Infinity),
  ];
  if (!domain && type === 'line') {
    const pad = (dMax - dMin) * 0.15 || 1;
    dMin -= pad;
    dMax += pad;
  }
  const ticks = domain ? niceTicks(dMin, dMax, 4).filter((t) => t >= dMin && t <= dMax) : niceTicks(dMin, dMax, 4);
  const yMin = domain ? dMin : ticks[0];
  const yMax = domain ? dMax : ticks[ticks.length - 1];
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const cx = (i) => m.left + band * i + band / 2;

  const barW = Math.max(2, Math.min(22, band - Math.max(2, band * 0.35)));

  // X-Achse: ca. 6 Beschriftungen gleichmässig verteilt
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const xLabels = rows
    .map((r, i) => ({ i, r }))
    .filter(({ i }) => (n - 1 - i) % labelEvery === 0);

  const linePts = type === 'line' ? rows.map((r, i) => (value(r) == null ? null : [cx(i), y(value(r))])) : [];
  const linePath = linePts.reduce((acc, p, i) => {
    if (!p) return acc;
    const prev = linePts[i - 1];
    return acc + `${prev ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }, '');
  const lastIdx = linePts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();

  const pointAt = (clientX, el) => {
    const box = el.getBoundingClientRect();
    const px = clientX - box.left - m.left;
    const i = Math.floor(px / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  const hoverRow = hover != null ? rows[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max(cx(hover), 90), width - 90) : 0;

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={(e) => pointAt(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => e.touches[0] && pointAt(e.touches[0].clientX, e.currentTarget)}
      >
        {/* Raster & Y-Achse */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={m.left - 8} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">
              {formatY(t)}
            </text>
          </g>
        ))}

        {/* Referenzlinie (z. B. Durchschnitt oder Schlafbedarf) */}
        {reference != null && (
          <line x1={m.left} x2={width - m.right} y1={y(reference)} y2={y(reference)} className="ref" />
        )}

        {/* Hover-Band */}
        {hover != null && (
          <rect x={cx(hover) - band / 2} y={m.top} width={band} height={ih} className="hover-band" />
        )}

        {type === 'bar' &&
          rows.map((r, i) => {
            const v = value(r);
            if (v == null) return null;
            return (
              <path
                key={r.date}
                d={barPath(cx(i) - barW / 2, y(Math.max(v, yMin)), barW, y(yMin) - y(Math.max(v, yMin)))}
                style={{ fill: color ? color(r) : 'var(--series-1)', opacity: hover == null || hover === i ? 1 : 0.55 }}
              />
            );
          })}

        {type === 'stack' &&
          rows.map((r, i) => {
            let acc = 0;
            const segs = series.map((s) => {
              const v = stackValue(r, s.key) || 0;
              const seg = { s, from: acc, to: acc + v };
              acc += v;
              return seg;
            });
            const top = segs.filter((sg) => sg.to > sg.from).pop();
            return (
              <g key={r.date} style={{ opacity: hover == null || hover === i ? 1 : 0.55 }}>
                {segs.map(({ s, from, to }) => {
                  if (to <= from) return null;
                  const y0 = y(from);
                  const y1 = y(to);
                  const gap = from > 0 ? 2 : 0; // 2px Oberflächen-Abstand zwischen Segmenten
                  const h = Math.max(0, y0 - y1 - gap);
                  return (
                    <path
                      key={s.key}
                      d={top && top.s.key === s.key ? barPath(cx(i) - barW / 2, y1, barW, h) : `M${cx(i) - barW / 2},${y1}h${barW}v${h}h${-barW}Z`}
                      style={{ fill: s.color }}
                    />
                  );
                })}
              </g>
            );
          })}

        {type === 'line' && (
          <>
            <path d={linePath} className="line" />
            {lastIdx != null && (
              <>
                <circle cx={linePts[lastIdx][0]} cy={linePts[lastIdx][1]} r={4} className="dot" />
                <text x={linePts[lastIdx][0] + 8} y={linePts[lastIdx][1]} className="direct-label" dominantBaseline="middle">
                  {formatY(value(rows[lastIdx]))}
                </text>
              </>
            )}
            {hover != null && linePts[hover] && (
              <>
                <line x1={cx(hover)} x2={cx(hover)} y1={m.top} y2={m.top + ih} className="crosshair" />
                <circle cx={linePts[hover][0]} cy={linePts[hover][1]} r={5} className="dot dot-hover" />
              </>
            )}
          </>
        )}

        {/* X-Achse */}
        {xLabels.map(({ i, r }) => (
          <text key={r.date} x={cx(i)} y={height - 8} className="axis" textAnchor="middle">
            {fmtShortDay(r.date)}
          </text>
        ))}
      </svg>

      {hoverRow && tooltip && (
        <div className="tooltip" style={{ left: tipLeft, top: 0 }}>
          <div className="tooltip-date">{fmtDay(hoverRow.date)}</div>
          {tooltip(hoverRow)}
        </div>
      )}
    </div>
  );
}
