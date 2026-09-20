// Reruns each 10,000-simulation predictor (FPI and Elo) only if the number
// of completed real games or that predictor's ratings have changed since it
// last ran. Keeps GitHub Actions from redoing the expensive simulation on
// every scheduled data-refresh run when nothing new has actually happened.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { dataDir, scriptsDir } from './lib/paths.mjs';

const CODE_TO_TEAMS_KEY = { OAK: 'LV' };

function readJson(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runScript(name) {
  execFileSync(process.execPath, [path.join(scriptsDir, name)], { stdio: 'inherit' });
}

const schedule = readJson('schedule.json');
const completedCount = schedule.games.filter((g) => g.completed).length;

// --- FPI predictor ---
{
  const fpi = readJson('fpi.json');
  const predictions = readJson('predictions.json');

  // Compare actual rating values, not fpi.updatedAt - that timestamp changes
  // on every fetch even when the ratings themselves haven't moved.
  const ratingsUnchanged = predictions
    && predictions.fpiRatings
    && JSON.stringify(predictions.fpiRatings) === JSON.stringify(fpi.ratings);

  const upToDate = predictions && predictions.basedOnCompletedGames === completedCount && ratingsUnchanged;

  if (upToDate) {
    console.log(`FPI predictions already reflect ${completedCount} completed games and current FPI - skipping.`);
  } else {
    console.log(`Completed games: ${completedCount} (was ${predictions ? predictions.basedOnCompletedGames : 'none'}). Rerunning FPI predictor...`);
    runScript('run-predictor.mjs');
  }
}

// --- Elo predictor ---
{
  const eloData = readJson('elo/ratings.json');
  const teams = readJson('teams.json');
  const predictionsElo = readJson('predictions-elo.json');

  const currentEloRatings = {};
  for (const [code, info] of Object.entries(eloData.current)) {
    const teamsKey = CODE_TO_TEAMS_KEY[code] || code;
    if (teams[teamsKey]) currentEloRatings[teamsKey] = info.elo;
  }

  const ratingsUnchanged = predictionsElo
    && predictionsElo.eloRatings
    && JSON.stringify(predictionsElo.eloRatings) === JSON.stringify(currentEloRatings);

  const upToDate = predictionsElo && predictionsElo.basedOnCompletedGames === completedCount && ratingsUnchanged;

  if (upToDate) {
    console.log(`Elo predictions already reflect ${completedCount} completed games and current Elo - skipping.`);
  } else {
    console.log(`Completed games: ${completedCount} (was ${predictionsElo ? predictionsElo.basedOnCompletedGames : 'none'}). Rerunning Elo predictor...`);
    runScript('run-predictor-elo.mjs');
  }
}
