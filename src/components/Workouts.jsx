import { useState } from 'react';
import { fmtDay, fmtDuration, fmtNum, fmtTime, sportName } from '../lib/format.js';

const ZONES = [
  ['zone_zero_milli', 'Zone 0'],
  ['zone_one_milli', 'Zone 1'],
  ['zone_two_milli', 'Zone 2'],
  ['zone_three_milli', 'Zone 3'],
  ['zone_four_milli', 'Zone 4'],
  ['zone_five_milli', 'Zone 5'],
];

function ZoneBar({ zones }) {
  if (!zones) return <span className="muted">–</span>;
  const total = ZONES.reduce((s, [k]) => s + (zones[k] || 0), 0) || 1;
  return (
    <div className="zonebar" role="img" aria-label={ZONES.map(([k, l]) => `${l} ${fmtDuration(zones[k] || 0)}`).join(', ')}>
      {ZONES.map(([k, l], i) =>
        zones[k] > 0 ? (
          <span
            key={k}
            title={`${l}: ${fmtDuration(zones[k])}`}
            style={{ flexGrow: zones[k] / total, background: `var(--zone-${i})` }}
          />
        ) : null
      )}
    </div>
  );
}

export default function Workouts({ workouts }) {
  const [showAll, setShowAll] = useState(false);
  const list = [...workouts].filter((w) => w.score_state === 'SCORED').sort((a, b) => b.start.localeCompare(a.start));
  const shown = showAll ? list : list.slice(0, 8);

  const totalMs = list.reduce((s, w) => s + (new Date(w.end) - new Date(w.start)), 0);
  const avgStrain = list.length ? list.reduce((s, w) => s + w.score.strain, 0) / list.length : null;
  const bySport = list.reduce((acc, w) => ({ ...acc, [w.sport_name]: (acc[w.sport_name] || 0) + 1 }), {});
  const topSport = Object.entries(bySport).sort((a, b) => b[1] - a[1])[0];

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>Workouts</h3>
          <ul className="legend">
            <li>Herzfrequenzzonen:</li>
            {ZONES.map(([, l], i) => (
              <li key={l}>
                <i className="swatch" style={{ background: `var(--zone-${i})` }} />
                {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="mini-stats">
          <div><b>{list.length}</b><span>Workouts</span></div>
          <div><b>{fmtDuration(totalMs)}</b><span>Gesamtzeit</span></div>
          <div><b>{fmtNum(avgStrain, 1)}</b><span>Ø Strain</span></div>
          {topSport && <div><b>{sportName(topSport[0])}</b><span>Häufigste Sportart</span></div>}
        </div>
      </header>

      {list.length === 0 ? (
        <p className="muted">Keine Workouts im gewählten Zeitraum.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sportart</th>
                <th>Datum</th>
                <th className="num">Dauer</th>
                <th className="num">Strain</th>
                <th className="num">Ø / Max Puls</th>
                <th className="num">kcal</th>
                <th className="num">Distanz</th>
                <th className="zones-col">Zonen</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.id}>
                  <td className="strong">{sportName(w.sport_name)}</td>
                  <td>{fmtDay(w.start)} · {fmtTime(w.start)}</td>
                  <td className="num">{fmtDuration(new Date(w.end) - new Date(w.start))}</td>
                  <td className="num"><span className="strain-chip">{fmtNum(w.score.strain, 1)}</span></td>
                  <td className="num">{fmtNum(w.score.average_heart_rate)} / {fmtNum(w.score.max_heart_rate)}</td>
                  <td className="num">{fmtNum(w.score.kilojoule / 4.184)}</td>
                  <td className="num">{w.score.distance_meter ? `${fmtNum(w.score.distance_meter / 1000, 1)} km` : '–'}</td>
                  <td className="zones-col"><ZoneBar zones={w.score.zone_durations} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 8 && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Weniger anzeigen' : `Alle ${list.length} Workouts anzeigen`}
        </button>
      )}
    </section>
  );
}
