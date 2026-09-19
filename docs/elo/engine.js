// All-time NFL Elo engine. Methodology mirrors FiveThirtyEight's published
// NFL Elo model (github.com/fivethirtyeight/nfl-elo-game/blob/master/forecast.py):
//   - Win probability from the rating difference (plus a home-field bonus),
//     via the standard logistic Elo formula.
//   - Margin-of-victory multiplier: ln(pointDiff + 1) * (2.2 / (eloDiffOfWinner * 0.001 + 2.2))
//     so blowouts move ratings more, dampened when a big favorite wins big
//     (already "expected") and amplified when a big underdog wins big.
//   - Between seasons, each team's rating reverts partway back toward a
//     league-average value, once per season gap the team has been away.
//
// Differences from 538's reference implementation (by request):
//   - Every team's first-ever appearance starts at 1300 (their historical
//     data uses individually hand-tuned 1920 starting values instead).
//   - Season reversion targets 1500 (538 targets 1505).
//   - One explicit special case: the Cleveland Browns' 1999 return (after
//     the 1996-98 gap when the franchise's roster/identity relocated to
//     Baltimore and became the Ravens) is a legally distinct expansion team,
//     not a continuation - it resets to 1300 rather than reverting.

export const HFA = 65; // Elo points added to the home team (0 for neutral-site games)
export const K = 20; // base rating-change speed
export const REVERT_TARGET = 1500;
export const REVERT_FRACTION = 1 / 3; // fraction reverted toward REVERT_TARGET per missed/new season
export const START_ELO = 1300;

const EXPANSION_RESETS = new Set(['CLE1999']); // team+season pairs treated as fresh expansions, not continuations

function winProbability(eloDiff) {
  return 1 / (Math.pow(10, -eloDiff / 400) + 1);
}

function movMultiplier(pointDiff, eloDiffOfWinner) {
  return Math.log(Math.max(pointDiff, 1) + 1) * (2.2 / (eloDiffOfWinner * 0.001 + 2.2));
}

// games: chronologically sorted array of
//   { date, season, neutral, playoff, team1, team2, score1, score2 }
// Returns { ratings: {code: currentElo}, history: [...] } where history has
// one entry per game with pre/post ratings and win probability for charting.
export function computeEloHistory(games) {
  const elo = {};
  const lastSeason = {};
  const history = [];

  function ensureSeason(code, season) {
    if (!(code in elo)) {
      elo[code] = START_ELO;
      lastSeason[code] = season;
      return;
    }
    while (lastSeason[code] < season) {
      const nextSeason = lastSeason[code] + 1;
      if (EXPANSION_RESETS.has(`${code}${season}`) && nextSeason === season) {
        elo[code] = START_ELO;
      } else {
        elo[code] = REVERT_TARGET * REVERT_FRACTION + elo[code] * (1 - REVERT_FRACTION);
      }
      lastSeason[code] = nextSeason;
    }
  }

  for (const g of games) {
    ensureSeason(g.team1, g.season);
    ensureSeason(g.team2, g.season);

    const eloDiff = elo[g.team1] - elo[g.team2] + (g.neutral ? 0 : HFA);
    const prob1 = winProbability(eloDiff);

    const result1 = g.score1 > g.score2 ? 1 : g.score1 < g.score2 ? 0 : 0.5;
    const pointDiff = Math.abs(g.score1 - g.score2);
    const eloDiffOfWinner = result1 === 0.5 ? 0 : result1 === 1 ? eloDiff : -eloDiff;
    const mult = result1 === 0.5 ? movMultiplier(pointDiff, 0) : movMultiplier(pointDiff, eloDiffOfWinner);

    const shift = K * mult * (result1 - prob1);

    const elo1Pre = elo[g.team1];
    const elo2Pre = elo[g.team2];
    elo[g.team1] += shift;
    elo[g.team2] -= shift;

    history.push({
      date: g.date,
      season: g.season,
      playoff: g.playoff,
      neutral: g.neutral,
      team1: g.team1,
      team2: g.team2,
      score1: g.score1,
      score2: g.score2,
      elo1Pre,
      elo2Pre,
      elo1Post: elo[g.team1],
      elo2Post: elo[g.team2],
      prob1,
    });
  }

  return { ratings: { ...elo }, history };
}
