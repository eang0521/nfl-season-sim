// Core scoring model:
//   expected score = 22 + (1 if home else -1) + team's offense FPI - opponent's defense FPI
//   actual score   = nearest-of-10 historical scores to Normal(expected, stdev=8)

import { sampleNormal } from './random.js';
import { resolveOvertime } from './overtime.js';

const HOME_FIELD_ADV = 1;
const SCORE_STDEV = 8;
const BASELINE = 22;

export function expectedScore(offense, opponentDefense, homeAdvantage) {
  return BASELINE + homeAdvantage + offense - opponentDefense;
}

// ratings: { [abbrev]: { off: number, def: number } }
// Pass neutral=true for the Super Bowl, where neither side gets the +1/-1.
export function simulateGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral = false) {
  const home = ratings[homeAbbrev];
  const away = ratings[awayAbbrev];
  const adv = neutral ? 0 : HOME_FIELD_ADV;

  const homeExpected = expectedScore(home.off, away.def, adv);
  const awayExpected = expectedScore(away.off, home.def, -adv);

  const homeTarget = sampleNormal(rng, homeExpected, SCORE_STDEV);
  const awayTarget = sampleNormal(rng, awayExpected, SCORE_STDEV);

  const homeScore = scoreSampler.nearestOfN(homeTarget, rng, 10);
  const awayScore = scoreSampler.nearestOfN(awayTarget, rng, 10);

  return { homeScore, awayScore, homeExpected, awayExpected };
}

// Full game: regulation, then overtime if regulation ends tied.
// allowTie: true for regular season (an OT that's still tied after both
// teams get 2 possessions ends the game in a tie); false for playoffs
// (sudden death keeps going in additional 2-possession blocks).
export function simulateFullGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, { neutral = false, allowTie = true } = {}) {
  const regulation = simulateGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral);
  if (regulation.homeScore !== regulation.awayScore) {
    return { homeScore: regulation.homeScore, awayScore: regulation.awayScore, overtime: false, tied: false };
  }

  const ot = resolveOvertime(
    regulation.homeScore,
    regulation.awayScore,
    regulation.homeExpected,
    regulation.awayExpected,
    rng,
    { allowTie }
  );
  return { homeScore: ot.homeScore, awayScore: ot.awayScore, overtime: true, tied: ot.tied };
}

// ---- Elo-based scoring model, for the "Elo predictor" mode ----
//
// Elo (docs/elo/engine.js) only models win probability directly, not a
// score. To reuse the same score-sampling machinery (and so overtime,
// tiebreakers, etc. all behave identically regardless of rating source),
// an Elo difference is converted to an expected point margin using the
// common sports-analytics rule of thumb of ~25 Elo points per point of
// margin, split evenly around the same league-average baseline the FPI
// model uses. The home-field bonus matches docs/elo/engine.js's HFA so
// the two Elo-facing pieces of the site agree on what "home field" is
// worth.
const ELO_HOME_FIELD_ADV = 65;
const ELO_POINTS_PER_MARGIN = 25;

export function eloExpectedScores(homeElo, awayElo, neutral = false) {
  const adv = neutral ? 0 : ELO_HOME_FIELD_ADV;
  const margin = (homeElo - awayElo + adv) / ELO_POINTS_PER_MARGIN;
  return { homeExpected: BASELINE + margin / 2, awayExpected: BASELINE - margin / 2 };
}

// eloRatings: { [abbrev]: number }
export function simulateGameElo(homeAbbrev, awayAbbrev, eloRatings, scoreSampler, rng, neutral = false) {
  const { homeExpected, awayExpected } = eloExpectedScores(eloRatings[homeAbbrev], eloRatings[awayAbbrev], neutral);

  const homeTarget = sampleNormal(rng, homeExpected, SCORE_STDEV);
  const awayTarget = sampleNormal(rng, awayExpected, SCORE_STDEV);

  const homeScore = scoreSampler.nearestOfN(homeTarget, rng, 10);
  const awayScore = scoreSampler.nearestOfN(awayTarget, rng, 10);

  return { homeScore, awayScore, homeExpected, awayExpected };
}

export function simulateFullGameElo(homeAbbrev, awayAbbrev, eloRatings, scoreSampler, rng, { neutral = false, allowTie = true } = {}) {
  const regulation = simulateGameElo(homeAbbrev, awayAbbrev, eloRatings, scoreSampler, rng, neutral);
  if (regulation.homeScore !== regulation.awayScore) {
    return { homeScore: regulation.homeScore, awayScore: regulation.awayScore, overtime: false, tied: false };
  }

  const ot = resolveOvertime(
    regulation.homeScore,
    regulation.awayScore,
    regulation.homeExpected,
    regulation.awayExpected,
    rng,
    { allowTie }
  );
  return { homeScore: ot.homeScore, awayScore: ot.awayScore, overtime: true, tied: ot.tied };
}
