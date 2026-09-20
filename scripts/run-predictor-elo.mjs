// Runs N full season simulations using all-time Elo ratings instead of ESPN
// FPI, and aggregates playoff odds per team. Writes
// docs/data/predictions-elo.json, which the predictor page reads directly
// when the user switches to "Elo" mode (no client-side simulation needed).
//
// Elo only gives a single overall rating per team (no separate offense/
// defense), so game scores come from docs/sim/engine.js's
// simulateFullGameElo, which converts an Elo difference into an expected
// point margin - see that file for the conversion and its caveats.

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';
import { buildScoreSampler } from '../docs/sim/scoreDistribution.js';
import { simulateFullGameElo } from '../docs/sim/engine.js';
import { runSimulations } from './lib/predictor-core.mjs';

const SIMULATIONS = Number(process.env.SIM_COUNT) || 10000;

// The Elo dataset's team code for the same franchise the current
// docs/data/teams.json calls LV (see scripts/fetch-elo-games.mjs).
const CODE_TO_TEAMS_KEY = { OAK: 'LV' };

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

function eloGameSim(homeAbbrev, awayAbbrev, eloRatings, scoreSampler, rng, neutral, allowTie) {
  return simulateFullGameElo(homeAbbrev, awayAbbrev, eloRatings, scoreSampler, rng, { neutral, allowTie });
}

function main() {
  const teams = readJson('teams.json');
  const eloData = readJson('elo/ratings.json');
  const schedule = readJson('schedule.json');
  const scoreDist = readJson('score-distribution.json');
  const scoreSampler = buildScoreSampler(scoreDist.counts);

  const completedCount = schedule.games.filter((g) => g.completed).length;

  // Restrict to the 32 current teams, remapped to docs/data/teams.json's keys.
  const eloRatings = {};
  for (const [code, info] of Object.entries(eloData.current)) {
    const teamsKey = CODE_TO_TEAMS_KEY[code] || code;
    if (teams[teamsKey]) eloRatings[teamsKey] = info.elo;
  }

  const results = runSimulations({ schedule, ratings: eloRatings, scoreSampler, teams, simCount: SIMULATIONS, gameSimFn: eloGameSim });

  for (const abbrev of Object.keys(results)) {
    results[abbrev].elo = Math.round(eloRatings[abbrev]);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    simCount: SIMULATIONS,
    basedOnCompletedGames: completedCount,
    eloUpdatedAt: eloData.updatedAt,
    eloRatings,
    teams: results,
  };
  fs.writeFileSync(path.join(dataDir, 'predictions-elo.json'), JSON.stringify(out, null, 2));
  console.log(`Ran ${SIMULATIONS} Elo-based simulations based on ${completedCount} completed games.`);
}

main();
