// Runs N full season simulations and aggregates playoff odds per team.
// Writes docs/data/predictions.json, which the predictor page reads
// directly (no client-side simulation needed).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';
import { makeRng, randomSeed } from '../docs/sim/random.js';
import { buildScoreSampler } from '../docs/sim/scoreDistribution.js';
import { simulateSeason } from '../docs/sim/season.js';

const SIMULATIONS = Number(process.env.SIM_COUNT) || 10000;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function main() {
  const teams = readJson('teams.json');
  const fpi = readJson('fpi.json');
  const schedule = readJson('schedule.json');
  const scoreDist = readJson('score-distribution.json');
  const scoreSampler = buildScoreSampler(scoreDist.counts);

  const completedCount = schedule.games.filter((g) => g.completed).length;

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
      missedPlayoffsCount: 0,
    };
  }

  for (let i = 0; i < SIMULATIONS; i++) {
    const rng = makeRng(randomSeed());
    const { playoffs } = simulateSeason(schedule, fpi.ratings, scoreSampler, rng, teams);

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
      } else {
        t.missedPlayoffsCount++;
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
      madePlayoffsPct: t.madePlayoffs / SIMULATIONS,
      wonDivisionPct: t.wonDivision / SIMULATIONS,
      madeDivisionalPct: t.madeDivisional / SIMULATIONS,
      madeConfChampPct: t.madeConfChamp / SIMULATIONS,
      madeSuperBowlPct: t.madeSuperBowl / SIMULATIONS,
      wonSuperBowlPct: t.wonSuperBowl / SIMULATIONS,
      avgSeedIfMadePlayoffs: t.madePlayoffs ? t.seedSum / t.madePlayoffs : null,
    };
  }

  const out = {
    updatedAt: new Date().toISOString(),
    simCount: SIMULATIONS,
    basedOnCompletedGames: completedCount,
    fpiUpdatedAt: fpi.updatedAt,
    teams: results,
  };
  fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(out, null, 2));
  console.log(`Ran ${SIMULATIONS} simulations based on ${completedCount} completed games.`);
}

main();
