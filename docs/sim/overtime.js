// Overtime model (custom, not a literal NFL-clock simulation):
//
// - Possessions alternate, in blocks of 2 per team (A, B, A, B), with the
//   first-possession team decided by a 50/50 coin flip.
// - Both teams are guaranteed their possessions within a block; there's no
//   sudden-death cutoff on the very first score (matches the current NFL
//   rule - no more "opponent doesn't get the ball if you score a TD first").
// - The game can only actually END right after the 2nd possession of a pair
//   ("checkpoint"), once both teams in that pair have had equal turns. If
//   the score is unequal at a checkpoint, the game is over.
// - A team has an n% chance to score on a possession, where n = 2 * that
//   team's expected point total for the game (the same offense/defense-based
//   expected score used for regulation), clamped to [0, 100].
// - A score is 50/50 TD vs. FG. If the team is trailing by more than a field
//   goal would make up (i.e. needs a TD, not a FG) and the coin flip says
//   FG, nothing is scored on that possession at all.
// - A TD that, on its own (before the extra point), already exceeds the
//   opponent's total is a walk-off: it scores exactly 6, no PAT needed. Any
//   other TD scores 7 (PAT assumed automatic).
// - If the score is still tied after a full block (2 possessions each): a
//   regular season game ends in a tie; a playoff game runs another block
//   (sudden death continues) until it's decided.

const MAX_BLOCKS = 50; // safety net against a pathological infinite tie loop

function possessionProbability(expected) {
  const pct = 2 * expected;
  return Math.min(1, Math.max(0, pct / 100));
}

// marginAgainst: points this team currently trails by (always 0, 3, or 7
// given the scoring values below - 0 entering the first possession of a
// pair, since a new pair/block only starts when the score is level).
function simulatePossession(expected, marginAgainst, rng) {
  const p = possessionProbability(expected);
  if (rng() >= p) return { scored: false, type: null };
  const isTD = rng() < 0.5;
  if (!isTD) {
    if (marginAgainst > 3) return { scored: false, type: null }; // FG wouldn't be enough - not attempted
    return { scored: true, type: 'FG' };
  }
  return { scored: true, type: 'TD' };
}

function pointsFor(result, teamTotalBefore, opponentTotal, isCheckpoint) {
  if (!result.scored) return 0;
  if (result.type === 'FG') return 3;
  if (isCheckpoint && teamTotalBefore + 6 > opponentTotal) return 6; // walk-off, skip the PAT
  return 7;
}

// homeScore/awayScore must already be equal (tied regulation score).
// homeExpected/awayExpected are each team's expected point total for the
// whole game, reused as the OT scoring-probability basis.
export function resolveOvertime(homeScore, awayScore, homeExpected, awayExpected, rng, { allowTie }) {
  let home = homeScore;
  let away = awayScore;

  const firstIsHome = rng() < 0.5;

  for (let block = 0; block < MAX_BLOCKS; block++) {
    for (let round = 0; round < 2; round++) {
      // First-of-pair possession: margin is always 0 entering it.
      if (firstIsHome) home += pointsFor(simulatePossession(homeExpected, 0, rng), home, away, false);
      else away += pointsFor(simulatePossession(awayExpected, 0, rng), away, home, false);

      // Second-of-pair (checkpoint) possession - the game can end here.
      if (firstIsHome) {
        const margin = home - away;
        away += pointsFor(simulatePossession(awayExpected, margin, rng), away, home, true);
      } else {
        const margin = away - home;
        home += pointsFor(simulatePossession(homeExpected, margin, rng), home, away, true);
      }

      if (home !== away) return { homeScore: home, awayScore: away, tied: false };
    }
    if (allowTie) return { homeScore: home, awayScore: away, tied: true };
    // Playoffs: still tied after a full block - sudden death continues.
  }

  // Practically unreachable (repeated exact ties block after block), but
  // guarantees termination: hand the win to whichever team has the better
  // expected score, weighted by a coin flip either way.
  const homeWins = rng() < homeExpected / (homeExpected + awayExpected || 1);
  return homeWins ? { homeScore: home + 3, awayScore: away, tied: false } : { homeScore: home, awayScore: away + 3, tied: false };
}
