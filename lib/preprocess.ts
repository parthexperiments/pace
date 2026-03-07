import type { StravaActivitySummary, StravaStreams } from "./strava";

const MOVING_THRESHOLD_MPS = 0.55;  // 2 km/h  — below this = stationary
const RUNNING_THRESHOLD_MPS = 1.67; // 6 km/h  — above this = running

export interface PreprocessedRun {
  moving_pace_s: number;
  overall_pace_s: number;
  moving_time_s: number;
  elapsed_time_s: number;
  distance_km: number;
  speed_distribution: {
    running_pct: number;
    shuffling_pct: number;
    stationary_pct: number;
  };
  km_splits: { km: number; pace_s: number }[];
  elevation: { gain_m: number; loss_m: number; flat: boolean };
  pace_gap_s: number;
}

/**
 * Preprocess a run from Strava streams + activity summary.
 *
 * moving_pace_s   — s/km counting only intervals where velocity_smooth > 0.55 m/s
 * overall_pace_s  — elapsed_time_s / distance_km  (wall-clock pace)
 * pace_gap_s      — overall_pace_s − moving_pace_s  (time lost to stops)
 * speed_distribution — fraction of elapsed time in each zone (sums to 1)
 * km_splits       — one entry per completed km, using elapsed (wall-clock) time
 * elevation       — cumulative gain/loss from altitude stream; flat when gain < 50 m
 */
export function preprocessRun(
  streams: StravaStreams | null,
  activity: StravaActivitySummary
): PreprocessedRun {
  const distance_km = activity.distance / 1000;
  const elapsed_time_s = activity.elapsed_time;
  const overall_pace_s = distance_km > 0 ? elapsed_time_s / distance_km : 0;

  const { moving_time_s, moving_distance_m, speed_distribution } =
    computeMovingAndDistribution(streams, elapsed_time_s);

  // If we have no valid stream data, fall back to overall pace
  const moving_pace_s =
    moving_distance_m > 0
      ? moving_time_s / (moving_distance_m / 1000)
      : overall_pace_s;

  // pace_gap_s is how many extra s/km the runner "loses" to stops
  const pace_gap_s = overall_pace_s - moving_pace_s;

  const km_splits = computeKmSplits(streams, activity.distance, elapsed_time_s);
  const elevation = computeElevation(streams);

  return {
    moving_pace_s,
    overall_pace_s,
    moving_time_s,
    elapsed_time_s,
    distance_km,
    speed_distribution,
    km_splits,
    elevation,
    pace_gap_s,
  };
}

// ─── computeMovingAndDistribution ────────────────────────────────────────────

function computeMovingAndDistribution(
  streams: StravaStreams | null,
  elapsed_time_s: number
): {
  moving_time_s: number;
  moving_distance_m: number;
  speed_distribution: {
    running_pct: number;
    shuffling_pct: number;
    stationary_pct: number;
  };
} {
  // FIX: no-stream fallback now returns stationary_pct: 1 (not all zeros)
  // because we genuinely don't know the distribution — treat as untracked.
  if (!streams?.velocity_smooth?.data?.length || !streams?.time?.data?.length) {
    return {
      moving_time_s: elapsed_time_s,
      moving_distance_m: 0,
      speed_distribution: { running_pct: 0, shuffling_pct: 0, stationary_pct: 1 },
    };
  }

  const speeds = streams.velocity_smooth.data;
  const times = streams.time.data;
  const n = Math.min(speeds.length, times.length);

  let moving_time_s = 0;
  let moving_distance_m = 0;
  let runningTime = 0;
  let shufflingTime = 0;
  let stationaryTime = 0;

  for (let i = 1; i < n; i++) {
    const dt = times[i] - times[i - 1];
    if (dt <= 0) continue;

    const v = speeds[i];

    if (v > RUNNING_THRESHOLD_MPS) {
      runningTime += dt;
      moving_time_s += dt;
      moving_distance_m += v * dt;
    } else if (v > MOVING_THRESHOLD_MPS) {
      shufflingTime += dt;
      moving_time_s += dt;
      moving_distance_m += v * dt;
    } else {
      stationaryTime += dt;
    }
  }

  const totalTime = runningTime + shufflingTime + stationaryTime || 1;

  return {
    moving_time_s,
    moving_distance_m,
    speed_distribution: {
      running_pct: runningTime / totalTime,
      shuffling_pct: shufflingTime / totalTime,
      stationary_pct: stationaryTime / totalTime,
    },
  };
}

// ─── computeKmSplits ─────────────────────────────────────────────────────────

function computeKmSplits(
  streams: StravaStreams | null,
  distance_m: number,
  elapsed_time_s: number
): { km: number; pace_s: number }[] {
  const distance_km = distance_m / 1000;
  if (distance_km <= 0) return [];

  const maxKm = Math.floor(distance_km);

  // FIX: no-stream fallback now generates one entry per completed km (not just km:1)
  // using the uniform elapsed pace, which is the best estimate available.
  if (!streams?.distance?.data?.length || !streams?.time?.data?.length) {
    const uniformPace = elapsed_time_s / distance_km;
    return Array.from({ length: maxKm }, (_, i) => ({
      km: i + 1,
      pace_s: uniformPace,
    }));
  }

  const distances = streams.distance.data;
  const times = streams.time.data;
  const n = Math.min(distances.length, times.length);

  const splits: { km: number; pace_s: number }[] = [];

  let prevBoundaryM = 0;
  let prevBoundaryTime = 0;
  // FIX: streamIdx cursor — O(n) total instead of O(n²), and correctly
  // advances forward so boundaries are never missed or double-counted.
  let streamIdx = 1;

  for (let km = 1; km <= maxKm; km++) {
    const boundaryM = km * 1000;
    let boundaryTime: number | null = null;

    while (streamIdx < n) {
      const dPrev = distances[streamIdx - 1];
      const dCurr = distances[streamIdx];

      if (dCurr < boundaryM) {
        // Haven't reached the boundary yet — keep scanning
        streamIdx++;
        continue;
      }

      // dCurr >= boundaryM — interpolate crossing time
      if (dPrev <= boundaryM) {
        const ratio =
          dCurr === dPrev ? 0 : (boundaryM - dPrev) / (dCurr - dPrev);
        boundaryTime =
          times[streamIdx - 1] + ratio * (times[streamIdx] - times[streamIdx - 1]);
      }
      // Don't advance streamIdx here — the same segment may span the next km too
      break;
    }

    if (boundaryTime == null) break; // stream ended before this km boundary

    const segmentTime = boundaryTime - prevBoundaryTime;
    const segmentKm = (boundaryM - prevBoundaryM) / 1000; // always 1.0

    if (segmentKm > 0 && segmentTime > 0) {
      splits.push({ km, pace_s: segmentTime / segmentKm });
    }

    prevBoundaryM = boundaryM;
    prevBoundaryTime = boundaryTime;
  }

  // If interpolation yielded nothing (e.g. corrupted stream), fall back
  if (splits.length === 0) {
    const uniformPace = elapsed_time_s / distance_km;
    return Array.from({ length: maxKm }, (_, i) => ({
      km: i + 1,
      pace_s: uniformPace,
    }));
  }

  return splits;
}

// ─── computeElevation ────────────────────────────────────────────────────────

// FIX: removed unused `distance_m` parameter
function computeElevation(
  streams: StravaStreams | null
): { gain_m: number; loss_m: number; flat: boolean } {
  if (!streams?.altitude?.data?.length) {
    return { gain_m: 0, loss_m: 0, flat: true };
  }

  const altitude = streams.altitude.data;
  let gain_m = 0;
  let loss_m = 0;

  for (let i = 1; i < altitude.length; i++) {
    const delta = altitude[i] - altitude[i - 1];
    if (delta > 0) gain_m += delta;
    else if (delta < 0) loss_m += Math.abs(delta);
  }

  return { gain_m, loss_m, flat: gain_m < 50 };
}