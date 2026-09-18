// Seedable PRNG (mulberry32) + Box-Muller normal sampler.
// Used both in the browser (season simulator) and in Node (predictor script)
// so a given seed reproduces identical results in either environment.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

// Standard normal via Box-Muller, scaled to mean/stdev.
export function sampleNormal(rng, mean, stdev) {
  let u1 = 0;
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdev;
}

// Picks a random index from a cumulative weight array using rng() in [0,1).
export function weightedPick(cumulativeWeights, totalWeight, rng) {
  const target = rng() * totalWeight;
  let lo = 0, hi = cumulativeWeights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeWeights[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
