import TimeChart from './TimeChart.jsx';
import { average, recoveryStatus } from '../lib/transform.js';
import { fmtHours, fmtNum } from '../lib/format.js';

const STAGES = [
  { key: 'deep', label: 'Tiefschlaf', color: 'var(--series-1)' },
  { key: 'rem', label: 'REM', color: 'var(--series-2)' },
  { key: 'light', label: 'Leichtschlaf', color: 'var(--series-3)' },
  { key: 'awake', label: 'Wach', color: 'var(--neutral-mark)' },
];

const Row = ({ label, children, swatch }) => (
  <div className="tt-row">
    <span className="tt-label">
      {swatch && <i className="swatch" style={{ background: swatch }} />}
      {label}
    </span>
    <span className="tt-value">{children}</span>
  </div>
);

function Card({ title, stat, statLabel, legend, children, className = '' }) {
  return (
    <section className={`card chart-card ${className}`}>
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {legend}
        </div>
        {stat != null && (
          <div className="card-stat">
            <div className="card-stat-value">{stat}</div>
            <div className="card-stat-label">{statLabel}</div>
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

const Legend = ({ items }) => (
  <ul className="legend">
    {items.map((i) => (
      <li key={i.label}>
        <i className="swatch" style={{ background: i.color }} />
        {i.label}
      </li>
    ))}
  </ul>
);

export default function Trends({ days }) {
  const avgRec = average(days, 'recovery');
  const avgHrv = average(days, 'hrv');
  const avgRhr = average(days, 'rhr');
  const avgStrain = average(days.filter((d) => !d.open), 'strain');
  const avgSleep = average(days, 'asleepH');
  const avgNeed = average(days, 'needH');

  const counts = { good: 0, warning: 0, critical: 0 };
  days.forEach((d) => {
    const s = recoveryStatus(d.recovery);
    if (s) counts[s.key]++;
  });

  return (
    <div className="grid">
      <Card
        className="span-2"
        title="Recovery"
        stat={avgRec != null ? `${fmtNum(avgRec)}%` : '–'}
        statLabel="Durchschnitt"
        legend={
          <Legend
            items={[
              { label: `Grün ≥ 67 % (${counts.good} Tage)`, color: 'var(--good)' },
              { label: `Gelb 34–66 % (${counts.warning})`, color: 'var(--warning)' },
              { label: `Rot ≤ 33 % (${counts.critical})`, color: 'var(--critical)' },
            ]}
          />
        }
      >
        <TimeChart
          rows={days}
          value={(d) => d.recovery}
          domain={[0, 100]}
          color={(d) => `var(--${recoveryStatus(d.recovery)?.key})`}
          formatY={(v) => `${v}%`}
          ariaLabel="Recovery pro Tag in Prozent"
          tooltip={(d) => (
            <>
              <Row label="Recovery" swatch={`var(--${recoveryStatus(d.recovery)?.key})`}>
                {d.recovery != null ? `${d.recovery}% · ${recoveryStatus(d.recovery).label}` : '–'}
              </Row>
              <Row label="HRV">{fmtNum(d.hrv)} ms</Row>
              <Row label="Ruhepuls">{fmtNum(d.rhr)} bpm</Row>
            </>
          )}
        />
      </Card>

      <Card title="Herzfrequenzvariabilität" stat={`${fmtNum(avgHrv)} ms`} statLabel="Ø HRV (RMSSD)">
        <TimeChart
          type="line"
          rows={days}
          value={(d) => d.hrv}
          reference={avgHrv}
          formatY={(v) => fmtNum(v)}
          height={180}
          ariaLabel="HRV-Verlauf in Millisekunden"
          tooltip={(d) => <Row label="HRV">{fmtNum(d.hrv, 1)} ms</Row>}
        />
      </Card>

      <Card title="Ruhepuls" stat={`${fmtNum(avgRhr)} bpm`} statLabel="Ø Ruhepuls">
        <TimeChart
          type="line"
          rows={days}
          value={(d) => d.rhr}
          reference={avgRhr}
          formatY={(v) => fmtNum(v)}
          height={180}
          ariaLabel="Ruhepuls-Verlauf in Schlägen pro Minute"
          tooltip={(d) => <Row label="Ruhepuls">{fmtNum(d.rhr)} bpm</Row>}
        />
      </Card>

      <Card title="Day Strain" stat={fmtNum(avgStrain, 1)} statLabel="Ø abgeschlossene Tage">
        <TimeChart
          rows={days}
          value={(d) => d.strain}
          domain={[0, 21]}
          color={() => 'var(--strain)'}
          formatY={(v) => v}
          height={180}
          ariaLabel="Day Strain pro Tag, Skala 0 bis 21"
          tooltip={(d) => (
            <>
              <Row label="Strain" swatch="var(--strain)">
                {fmtNum(d.strain, 1)}
                {d.open ? ' (läuft)' : ''}
              </Row>
              <Row label="Kalorien">{fmtNum(d.kcal)} kcal</Row>
              <Row label="Ø / Max Puls">
                {fmtNum(d.avgHr)} / {fmtNum(d.maxHr)} bpm
              </Row>
            </>
          )}
        />
      </Card>

      <Card
        title="Schlaf"
        stat={fmtHours(avgSleep)}
        statLabel={`Ø Schlaf · Bedarf ${fmtHours(avgNeed)}`}
        legend={<Legend items={STAGES} />}
      >
        <TimeChart
          type="stack"
          rows={days}
          series={STAGES}
          stackValue={(d, k) => d.stages?.[k]}
          reference={avgNeed}
          formatY={(v) => `${v} h`}
          height={180}
          ariaLabel="Schlafdauer pro Nacht nach Schlafphase in Stunden"
          tooltip={(d) =>
            d.stages ? (
              <>
                {STAGES.map((s) => (
                  <Row key={s.key} label={s.label} swatch={s.color}>
                    {fmtHours(d.stages[s.key])}
                  </Row>
                ))}
                <Row label="Leistung">{fmtNum(d.sleepPerf)}%</Row>
                <Row label="Bedarf">{fmtHours(d.needH)}</Row>
              </>
            ) : (
              <Row label="Schlaf">keine Daten</Row>
            )
          }
        />
        <p className="chart-note">Gestrichelte Linie: durchschnittlicher Schlafbedarf</p>
      </Card>
    </div>
  );
}
