// Reruns the 10,000-simulation predictor only if the number of completed
// real games (or the FPI ratings) has changed since predictions.json was
// last written. Keeps GitHub Actions from redoing the expensive simulation
// on every scheduled data-refresh run when nothing new has actually happened.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { dataDir, scriptsDir } from './lib/paths.mjs';

function readJson(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const schedule = readJson('schedule.json');
const fpi = readJson('fpi.json');
const predictions = readJson('predictions.json');

const completedCount = schedule.games.filter((g) => g.completed).length;

const upToDate = predictions
  && predictions.basedOnCompletedGames === completedCount
  && predictions.fpiUpdatedAt === fpi.updatedAt;

if (upToDate) {
  console.log(`Predictions already reflect ${completedCount} completed games and current FPI - skipping.`);
} else {
  console.log(`Completed games: ${completedCount} (was ${predictions ? predictions.basedOnCompletedGames : 'none'}). Rerunning predictor...`);
  execFileSync(process.execPath, [path.join(scriptsDir, 'run-predictor.mjs')], {
    stdio: 'inherit',
  });
}
