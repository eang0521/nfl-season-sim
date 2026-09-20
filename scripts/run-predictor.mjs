// Runs N full season simulations using ESPN FPI ratings and aggregates
// playoff odds per team. Writes docs/data/predictions.json, which the
// predictor page reads directly (no client-side simulation needed).

import fs from 'fs';
import path from 'path';
import { dataDir } from './lib/paths.mjs';
import { buildScoreSampler } from '../docs/sim/scoreDistribution.js';
import { runSimulations } from './lib/predictor-core.mjs';

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

  const results = runSimulations({ schedule, ratings: fpi.ratings, scoreSampler, teams, simCount: SIMULATIONS });

  const out = {
    updatedAt: new Date().toISOString(),
    simCount: SIMULATIONS,
    basedOnCompletedGames: completedCount,
    fpiRatings: fpi.ratings,
    teams: results,
  };
  fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(out, null, 2));
  console.log(`Ran ${SIMULATIONS} simulations based on ${completedCount} completed games.`);
}

main();
