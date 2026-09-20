// Shared core for both the FPI and Elo predictors: runs N full season
// simulations and aggregates playoff odds + projected record per team.
// The two predictors differ only in what `ratings` shape and `gameSimFn`
// they pass in (see docs/sim/season.js).

import { makeRng, randomSeed } from '../../docs/sim/random.js';
import { simulateSeason } from '../../docs/sim/season.js';

export function runSimulations({ schedule, ratings, scoreSampler, teams, simCount, gameSimFn }) {
  const tally = {};
  for (const abbrev of Object.keys(teams)) {
    tally[abbrev] = {
      madePlayoffs: 0,
      wonDivision: 0,
      madeDivisional: 0,
      madeConfChamp: 0,
      madeSuperBowl: 0,
      wonSuperBowl: 0,
      seedSum: 0,
      winsSum: 0,
      lossesSum: 0,
      tiesSum: 0,
    };
  }

  for (let i = 0; i < simCount; i++) {
    const rng = makeRng(randomSeed());
    const { standings, playoffs } = simulateSeason(schedule, ratings, scoreSampler, rng, teams, gameSimFn);

    for (const abbrev of Object.keys(teams)) {
      const rec = standings[abbrev];
      tally[abbrev].winsSum += rec.wins;
      tally[abbrev].lossesSum += rec.losses;
      tally[abbrev].tiesSum += rec.ties;
    }

    const seedByAbbrev = {};
    playoffs.afcSeeds.forEach((a, idx) => { seedByAbbrev[a] = idx + 1; });
    playoffs.nfcSeeds.forEach((a, idx) => { seedByAbbrev[a] = idx + 1; });
    // seedConference always places the 4 division winners in seeds 1-4.
    const divisionWinners = new Set([...playoffs.afcSeeds.slice(0, 4), ...playoffs.nfcSeeds.slice(0, 4)]);

    for (const abbrev of Object.keys(teams)) {
      const t = tally[abbrev];
      const seed = seedByAbbrev[abbrev];
      if (seed) {
        t.madePlayoffs++;
        t.seedSum += seed;
        if (divisionWinners.has(abbrev)) t.wonDivision++;
      }
    }

    const advanced = (conf) => {
      const seeds = conf === 'AFC' ? playoffs.afcSeeds : playoffs.nfcSeeds;
      const result = conf === 'AFC' ? playoffs.afc : playoffs.nfc;
      // #1 seed always reaches divisional round via the bye.
      tally[seeds[0]].madeDivisional++;
      for (const game of result.wildcard) {
        tally[game.winner].madeDivisional++;
      }
      for (const game of result.divisional) {
        tally[game.winner].madeConfChamp++;
      }
      tally[result.championship.winner].madeSuperBowl++;
    };
    advanced('AFC');
    advanced('NFC');
    tally[playoffs.champion].wonSuperBowl++;
  }

  const results = {};
  for (const abbrev of Object.keys(teams)) {
    const t = tally[abbrev];
    results[abbrev] = {
      madePlayoffsPct: t.madePlayoffs / simCount,
      wonDivisionPct: t.wonDivision / simCount,
      madeDivisionalPct: t.madeDivisional / simCount,
      madeConfChampPct: t.madeConfChamp / simCount,
      madeSuperBowlPct: t.madeSuperBowl / simCount,
      wonSuperBowlPct: t.wonSuperBowl / simCount,
      avgSeedIfMadePlayoffs: t.madePlayoffs ? t.seedSum / t.madePlayoffs : null,
      projectedWins: t.winsSum / simCount,
      projectedLosses: t.lossesSum / simCount,
      projectedTies: t.tiesSum / simCount,
    };
  }
  return results;
}
