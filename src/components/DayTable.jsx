import { useState } from 'react';
import { recoveryStatus } from '../lib/transform.js';
import { fmtDay, fmtHours, fmtNum } from '../lib/format.js';

const COLS = [
  ['date', 'Datum'],
  ['recovery', 'Recovery %'],
  ['hrv', 'HRV ms'],
  ['rhr', 'Ruhepuls'],
  ['strain', 'Strain'],
  ['asleepH', 'Schlaf h'],
  ['sleepPerf', 'Schlafleistung %'],
  ['sleepEff', 'Effizienz %'],
  ['respRate', 'Atemfrequenz'],
  ['kcal', 'kcal'],
];

function downloadCsv(days) {
  const lines = [COLS.map((c) => c[1]).join(';')];
  days.forEach((d) =>
    lines.push(COLS.map(([k]) => (d[k] == null ? '' : typeof d[k] === 'number' ? String(Math.round(d[k] * 100) / 100) : d[k])).join(';'))
  );
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `whoop-${days[0]?.date}-bis-${days[days.length - 1]?.date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DayTable({ days }) {
  const [open, setOpen] = useState(false);
  const rows = [...days].reverse();
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>Tagesdaten</h3>
          <p className="muted small">Alle Werte als Tabelle – auch zum Export.</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => downloadCsv(days)}>CSV exportieren</button>
          <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Tabelle ausblenden' : 'Tabelle anzeigen'}
          </button>
        </div>
      </header>
      {open && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>{COLS.map(([k, l]) => <th key={k} className={k === 'date' ? '' : 'num'}>{l}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const s = recoveryStatus(d.recovery);
                return (
                  <tr key={d.date}>
                    <td>{fmtDay(d.date)}</td>
                    <td className="num">
                      {s && <i className={`status-dot status-${s.key}`} aria-label={s.label} />} {fmtNum(d.recovery)}
                    </td>
                    <td className="num">{fmtNum(d.hrv)}</td>
                    <td className="num">{fmtNum(d.rhr)}</td>
                    <td className="num">{fmtNum(d.strain, 1)}</td>
                    <td className="num">{fmtHours(d.asleepH)}</td>
                    <td className="num">{fmtNum(d.sleepPerf)}</td>
                    <td className="num">{fmtNum(d.sleepEff, 1)}</td>
                    <td className="num">{fmtNum(d.respRate, 1)}</td>
                    <td className="num">{fmtNum(d.kcal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
