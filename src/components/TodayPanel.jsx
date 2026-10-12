import Ring from './Ring.jsx';
import { average, recoveryStatus } from '../lib/transform.js';
import { fmtDay, fmtHours, fmtNum, fmtTime } from '../lib/format.js';

function Delta({ value, avg, invert = false, neutral = false, unit = '' }) {
  if (value == null || avg == null) return null;
  const diff = value - avg;
  if (Math.abs(diff) < 0.05) return <span className="delta">≈ Ø</span>;
  const better = invert ? diff < 0 : diff > 0;
  return (
    <span className={`delta ${neutral ? '' : better ? 'up' : 'down'}`}>
      {diff > 0 ? '▲' : '▼'} {fmtNum(Math.abs(diff), Math.abs(diff) < 10 ? 1 : 0)}
      {unit} vs. Ø
    </span>
  );
}

function Vital({ label, value, unit, digits = 0, avg, invert, neutral }) {
  return (
    <div className="vital">
      <div className="vital-label">{label}</div>
      <div className="vital-value">
        {fmtNum(value, digits)}
        {value != null && <span className="unit"> {unit}</span>}
      </div>
      <Delta value={value} avg={avg} invert={invert} neutral={neutral} />
    </div>
  );
}

export default function TodayPanel({ days }) {
  // Neuester Tag mit Recovery (heutiger Cycle kann noch offen sein)
  const today = days[days.length - 1];
  const latest = [...days].reverse().find((d) => d.recovery != null) || today;
  const status = recoveryStatus(latest?.recovery);
  const history = days.slice(0, -1);

  if (!today) return null;

  return (
    <section className="card today">
      <div className="today-head">
        <div>
          <div className="eyebrow">Heute</div>
          <h2>{fmtDay(today.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        </div>
        {status && (
          <div className={`status-pill status-${status.key}`}>
            <span className="status-dot" aria-hidden="true" />
            {status.label} · {status.text}
          </div>
        )}
      </div>

      <div className="rings">
        <Ring
          value={latest.recovery}
          color={status ? `var(--${status.key})` : 'var(--text-muted)'}
          display={latest.recovery != null ? `${latest.recovery}%` : '–'}
          label="Recovery"
          pending={latest.calibrating}
          sub={latest.calibrating ? 'Kalibriert noch' : null}
        />
        <Ring
          value={today.strain}
          max={21}
          color="var(--strain)"
          display={fmtNum(today.strain, 1)}
          label="Strain"
          sub={today.open ? 'Tag läuft noch' : null}
        />
        <Ring
          value={latest.sleepPerf}
          color="var(--sleep)"
          display={latest.sleepPerf != null ? `${latest.sleepPerf}%` : '–'}
          label="Schlaf"
          sub={latest.asleepH != null ? `${fmtHours(latest.asleepH)} · ${fmtTime(latest.bedtime)}–${fmtTime(latest.waketime)}` : null}
        />
      </div>

      <div className="vitals">
        <Vital label="HRV" value={latest.hrv} unit="ms" digits={0} avg={average(history, 'hrv')} />
        <Vital label="Ruhepuls" value={latest.rhr} unit="bpm" avg={average(history, 'rhr')} invert />
        <Vital label="SpO₂" value={latest.spo2} unit="%" digits={1} avg={average(history, 'spo2')} />
        <Vital label="Hauttemp." value={latest.skinTemp} unit="°C" digits={1} avg={average(history, 'skinTemp')} neutral />
        <Vital label="Atemfrequenz" value={latest.respRate} unit="/min" digits={1} avg={average(history, 'respRate')} neutral />
        <Vital label="Kalorien" value={today.kcal} unit="kcal" />
      </div>
    </section>
  );
}
