/**
 * Deterministic run type classification based on distance and pace.
 * NOT AI-generated — uses fixed rules from CLAUDE.md
 */

export type RunType = 'long' | 'tempo' | 'easy' | 'short' | 'race_effort';

export function classifyRun(
  distanceKm: number,
  overallPaceS: number,
  goalDistanceKm: number,
  goalPaceS: number | null,
  goalType: 'finish' | 'time' | 'pace'
): RunType {
  // For 'finish' goal: classify by distance only
  if (goalType === 'finish') {
    if (distanceKm >= goalDistanceKm * 0.7 && distanceKm >= 8) {
      return 'long';
    }
    if (distanceKm >= goalDistanceKm * 0.3 && distanceKm >= 4) {
      return 'easy';
    }
    if (distanceKm < goalDistanceKm * 0.25 || distanceKm < 5) {
      return 'short';
    }
    return 'easy';
  }

  // For 'time' or 'pace' goal: classify by distance + pace
  // Long run is defined by distance only (regardless of pace)
  if (distanceKm >= goalDistanceKm * 0.7 && distanceKm >= 8) {
    return 'long';
  }

  // Race effort: significantly faster than goal pace
  if (goalPaceS && overallPaceS < goalPaceS - 20 && distanceKm >= 3) {
    return 'race_effort';
  }

  // Medium distance runs: classify by pace
  if (distanceKm >= goalDistanceKm * 0.3 && distanceKm >= 4) {
    if (goalPaceS && overallPaceS <= goalPaceS + 45) {
      return 'tempo';
    }
    return 'easy';
  }

  // Short runs
  if (distanceKm < goalDistanceKm * 0.25 || distanceKm < 5) {
    return 'short';
  }

  // Default to easy
  return 'easy';
}
