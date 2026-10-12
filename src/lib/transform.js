// Führt Cycles, Recovery und Schlaf zu einer Zeile pro Tag zusammen.

const H = 3600000;

/** Ein WHOOP-Cycle beginnt beim Einschlafen am Vorabend – +12 h ergibt den „Tag“. */
function dayKey(iso) {
  const d = new Date(new Date(iso).getTime() + 12 * H);
  return d.toISOString().slice(0, 10);
}

const scored = (r) => r && r.score_state === 'SCORED' && r.score;

export function buildDays(data) {
  const recByCycle = new Map(data.recoveries.filter(scored).map((r) => [r.cycle_id, r]));
  const sleepById = new Map(data.sleeps.filter((s) => !s.nap).map((s) => [s.id, s]));

  const days = data.cycles
    .map((c) => {
      const rec = recByCycle.get(c.id);
      const sleep = rec ? sleepById.get(rec.sleep_id) : null;
      const ss = scored(sleep) ? sleep.score.stage_summary : null;
      return {
        date: dayKey(c.start),
        cycleId: c.id,
        open: !c.end,
        strain: scored(c) ? c.score.strain : null,
        kcal: scored(c) ? Math.round(c.score.kilojoule / 4.184) : null,
        avgHr: scored(c) ? c.score.average_heart_rate : null,
        maxHr: scored(c) ? c.score.max_heart_rate : null,
        recovery: rec ? rec.score.recovery_score : null,
        calibrating: rec ? rec.score.user_calibrating : false,
        hrv: rec ? rec.score.hrv_rmssd_milli : null,
        rhr: rec ? rec.score.resting_heart_rate : null,
        spo2: rec ? rec.score.spo2_percentage ?? null : null,
        skinTemp: rec ? rec.score.skin_temp_celsius ?? null : null,
        sleepPerf: scored(sleep) ? sleep.score.sleep_performance_percentage : null,
        sleepEff: scored(sleep) ? sleep.score.sleep_efficiency_percentage : null,
        sleepCons: scored(sleep) ? sleep.score.sleep_consistency_percentage : null,
        respRate: scored(sleep) ? sleep.score.respiratory_rate : null,
        disturbances: ss ? ss.disturbance_count : null,
        bedtime: sleep ? sleep.start : null,
        waketime: sleep ? sleep.end : null,
        stages: ss
          ? {
              deep: ss.total_slow_wave_sleep_time_milli / H,
              rem: ss.total_rem_sleep_time_milli / H,
              light: ss.total_light_sleep_time_milli / H,
              awake: ss.total_awake_time_milli / H,
            }
          : null,
        asleepH: ss
          ? (ss.total_slow_wave_sleep_time_milli + ss.total_rem_sleep_time_milli + ss.total_light_sleep_time_milli) / H
          : null,
        needH: scored(sleep)
          ? Object.values(sleep.score.sleep_needed).reduce((a, b) => a + b, 0) / H
          : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Doppelte Tage (selten, z. B. Zeitzonenwechsel) zusammenfassen: letzter gewinnt
  const byDate = new Map();
  days.forEach((d) => byDate.set(d.date, d));
  return [...byDate.values()];
}

export function average(rows, key) {
  const v = rows.map((r) => r[key]).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function recoveryStatus(score) {
  if (score == null) return null;
  if (score >= 67) return { key: 'good', label: 'Grün', text: 'Bereit für Belastung' };
  if (score >= 34) return { key: 'warning', label: 'Gelb', text: 'Moderat belasten' };
  return { key: 'critical', label: 'Rot', text: 'Erholung priorisieren' };
}
