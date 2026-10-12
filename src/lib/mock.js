// Erzeugt realistische Demo-Daten im exakt gleichen Format wie die WHOOP API v2,
// damit Demo- und Live-Modus denselben Code-Pfad nutzen.

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const SPORTS = ['Running', 'Cycling', 'Functional Fitness', 'Weightlifting', 'Tennis', 'Hiking', 'Yoga', 'Swimming'];
const H = 3600000;

export function generateMockData(days) {
  const rand = rng(42);
  const n = (min, max) => min + rand() * (max - min);
  const cycles = [];
  const recoveries = [];
  const sleeps = [];
  const workouts = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let fatigue = 0.3;

  for (let d = days; d >= 0; d--) {
    const day = new Date(today.getTime() - d * 86400000);
    const bed = new Date(day.getTime() - n(1, 2.5) * H); // ca. 21:30–23:00 am Vorabend
    const asleepH = n(5.6, 8.6) - fatigue * 0.8;
    const wake = new Date(bed.getTime() + (asleepH + n(0.3, 0.8)) * H);
    const id = `demo-${d}`;
    const isToday = d === 0;

    const sleepPerf = Math.round(Math.min(100, (asleepH / 8) * 100 - n(0, 6)));
    const recovery = Math.round(
      Math.max(5, Math.min(99, 40 + sleepPerf * 0.45 - fatigue * 45 + n(-15, 20)))
    );
    const hrv = Math.round((48 + recovery * 0.42 + n(-6, 6)) * 10) / 10;
    const rhr = Math.round(62 - recovery * 0.12 + n(-2, 2));

    const inBed = (wake - bed);
    const awake = inBed * n(0.05, 0.11);
    const asleep = inBed - awake;
    const deep = asleep * n(0.17, 0.24);
    const rem = asleep * n(0.2, 0.27);
    const light = asleep - deep - rem;

    sleeps.push({
      id: `sleep-${id}`,
      cycle_id: id,
      start: bed.toISOString(),
      end: wake.toISOString(),
      nap: false,
      score_state: 'SCORED',
      score: {
        stage_summary: {
          total_in_bed_time_milli: Math.round(inBed),
          total_awake_time_milli: Math.round(awake),
          total_no_data_time_milli: 0,
          total_light_sleep_time_milli: Math.round(light),
          total_slow_wave_sleep_time_milli: Math.round(deep),
          total_rem_sleep_time_milli: Math.round(rem),
          sleep_cycle_count: Math.round(n(3, 6)),
          disturbance_count: Math.round(n(2, 14)),
        },
        sleep_needed: {
          baseline_milli: 7.8 * H,
          need_from_sleep_debt_milli: n(0, 0.8) * H,
          need_from_recent_strain_milli: n(0, 0.5) * H,
          need_from_recent_nap_milli: 0,
        },
        respiratory_rate: Math.round(n(14.2, 15.6) * 10) / 10,
        sleep_performance_percentage: sleepPerf,
        sleep_consistency_percentage: Math.round(n(60, 92)),
        sleep_efficiency_percentage: Math.round((asleep / inBed) * 1000) / 10,
      },
    });

    recoveries.push({
      cycle_id: id,
      sleep_id: `sleep-${id}`,
      created_at: wake.toISOString(),
      score_state: 'SCORED',
      score: {
        user_calibrating: false,
        recovery_score: recovery,
        resting_heart_rate: rhr,
        hrv_rmssd_milli: hrv,
        spo2_percentage: Math.round(n(95, 98.5) * 10) / 10,
        skin_temp_celsius: Math.round(n(33.1, 34.2) * 100) / 100,
      },
    });

    // Workouts
    let dayStrain = n(4, 8);
    const workoutCount = rand() < 0.68 ? (rand() < 0.15 ? 2 : 1) : 0;
    for (let w = 0; w < workoutCount; w++) {
      if (isToday && w > 0) break;
      const sport = SPORTS[Math.floor(rand() * SPORTS.length)];
      const ws = new Date(day.getTime() + n(7, 18) * H);
      const dur = n(0.5, 1.6) * H;
      const strain = Math.round(n(7, 16.5) * 10) / 10;
      const z = [n(0, 3), n(5, 15), n(15, 30), n(15, 35), n(5, 20), n(0, 8)];
      const zsum = z.reduce((a, b) => a + b, 0);
      dayStrain += strain * 0.55;
      workouts.push({
        id: `wo-${id}-${w}`,
        start: ws.toISOString(),
        end: new Date(ws.getTime() + dur).toISOString(),
        sport_name: sport,
        score_state: 'SCORED',
        score: {
          strain,
          average_heart_rate: Math.round(n(118, 152)),
          max_heart_rate: Math.round(n(160, 188)),
          kilojoule: Math.round((dur / H) * n(1500, 3200)),
          percent_recorded: 100,
          distance_meter: ['Running', 'Cycling', 'Hiking', 'Swimming'].includes(sport) ? Math.round(n(3000, 30000)) : null,
          zone_durations: {
            zone_zero_milli: Math.round((z[0] / zsum) * dur),
            zone_one_milli: Math.round((z[1] / zsum) * dur),
            zone_two_milli: Math.round((z[2] / zsum) * dur),
            zone_three_milli: Math.round((z[3] / zsum) * dur),
            zone_four_milli: Math.round((z[4] / zsum) * dur),
            zone_five_milli: Math.round((z[5] / zsum) * dur),
          },
        },
      });
    }
    const strain = Math.round(Math.min(20.5, dayStrain) * 10) / 10;
    fatigue = Math.max(0, Math.min(1, fatigue * 0.55 + (strain - 9) / 18));

    cycles.push({
      id,
      start: bed.toISOString(),
      end: isToday ? null : new Date(bed.getTime() + 24 * H).toISOString(),
      score_state: 'SCORED',
      score: {
        strain: isToday ? Math.round(strain * 0.6 * 10) / 10 : strain,
        kilojoule: Math.round(n(8500, 13500) + strain * 300),
        average_heart_rate: Math.round(n(64, 78)),
        max_heart_rate: Math.round(n(150, 185)),
      },
    });
  }

  return {
    profile: { user_id: 0, first_name: 'Demo', last_name: 'User', email: 'demo@example.com' },
    body: { height_meter: 1.8, weight_kilogram: 76, max_heart_rate: 192 },
    cycles: cycles.reverse(),
    recoveries: recoveries.reverse(),
    sleeps: sleeps.reverse(),
    workouts: workouts.reverse(),
  };
}
