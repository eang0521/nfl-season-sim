// Empirical distribution of individual team final scores, built from
// historical NFL games (data/score-distribution.json is {"score": count}).
// Used to convert a continuous target value into a realistic final score:
// draw 10 candidate scores from history and keep the one nearest the target.

import { weightedPick } from './random.js';

export function buildScoreSampler(scoreCounts) {
  const scores = [];
  const cumWeights = [];
  let total = 0;
  for (const key of Object.keys(scoreCounts).sort((a, b) => Number(a) - Number(b))) {
    total += scoreCounts[key];
    scores.push(Number(key));
    cumWeights.push(total);
  }

  function drawOne(rng) {
    const idx = weightedPick(cumWeights, total, rng);
    return scores[idx];
  }

  // Draws `n` candidate historical scores and returns the one closest to target.
  function nearestOfN(target, rng, n = 10) {
    let best = drawOne(rng);
    let bestDist = Math.abs(best - target);
    for (let i = 1; i < n; i++) {
      const candidate = drawOne(rng);
      const dist = Math.abs(candidate - target);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return best;
  }

  return { drawOne, nearestOfN };
}
