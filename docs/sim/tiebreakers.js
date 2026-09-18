// Approximation of the NFL's official tiebreaking procedures
// (https://www.nfl.com/standings/tie-breaking-procedures).
//
// Simplification: for 3+ team ties we narrow the tied group step-by-step
// through the official criteria in order (division procedure for same-division
// ties, wild-card procedure otherwise), and we omit the rarely-reached
// "net touchdowns" step. Teams eliminated at a given step are recursively
// re-resolved among themselves (restarting the whole procedure, as the NFL's
// rule does) and ranked below whichever teams survive that step - so a group
// of N tied teams always resolves to a full ordering of all N, never a
// shrunken subset. Anything left tied after every step is broken by a coin
// toss using the supplied rng, exactly as the NFL does.

import { winPct } from './standings.js';

function pctVsOpponents(rec, opponentAbbrevs) {
  let w = 0, l = 0, t = 0;
  for (const opp of opponentAbbrevs) {
    const v = rec.vs[opp];
    if (!v) continue;
    w += v.w; l += v.l; t += v.t;
  }
  return { w, l, t, pct: winPct(w, l, t), games: w + l + t };
}

function strengthOfVictory(rec, standings) {
  let w = 0, l = 0, t = 0;
  for (const [opp, record] of Object.entries(rec.vs)) {
    const oppRec = standings[opp];
    if (!oppRec || record.w === 0) continue;
    w += oppRec.wins * record.w;
    l += oppRec.losses * record.w;
    t += oppRec.ties * record.w;
  }
  return winPct(w, l, t);
}

function strengthOfSchedule(rec, standings) {
  let w = 0, l = 0, t = 0;
  for (const [opp, record] of Object.entries(rec.vs)) {
    const oppRec = standings[opp];
    if (!oppRec) continue;
    const played = record.w + record.l + record.t;
    w += oppRec.wins * played;
    l += oppRec.losses * played;
    t += oppRec.ties * played;
  }
  return winPct(w, l, t);
}

function combinedRank(group, standings, universe, key) {
  // key: 'pf' (higher is better) or 'pa' (lower is better)
  const sorted = [...universe].sort((a, b) =>
    key === 'pf' ? standings[b].pf - standings[a].pf : standings[a].pa - standings[b].pa
  );
  const rankOf = {};
  sorted.forEach((abbrev, i) => { rankOf[abbrev] = i + 1; });
  return Object.fromEntries(group.map((a) => [a, rankOf[a]]));
}

function coinToss(group, rng) {
  const arr = [...group];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Splits `remaining` into { winners, losers } using a numeric criterion.
// Teams the criterion doesn't apply to (score === null) stay with the
// winners (still tied, judged by the next criterion instead).
function numericSplit(remaining, scoreFn, higherIsBetter) {
  const scored = remaining.map((abbrev) => ({ abbrev, score: scoreFn(abbrev) }));
  const valid = scored.filter((s) => s.score !== null);
  if (valid.length === 0) return { winners: remaining, losers: [] };
  const best = valid.reduce(
    (acc, s) => (higherIsBetter ? Math.max(acc, s.score) : Math.min(acc, s.score)),
    higherIsBetter ? -Infinity : Infinity
  );
  const winners = scored.filter((s) => s.score === null || s.score === best).map((s) => s.abbrev);
  const losers = scored.filter((s) => s.score !== null && s.score !== best).map((s) => s.abbrev);
  return { winners, losers };
}

// Head-to-head split. Division ties always compare full aggregate pct among
// the remaining group. Wild-card ties only resolve on a 2-way head-to-head
// record, or a clean sweep (one team beat, or lost to, every other team in
// a 3+ way tie) - otherwise the step is a no-op and everyone stays tied.
function headToHeadSplit(remaining, standings, mode) {
  if (mode === 'division') {
    return numericSplit(remaining, (a) => {
      const others = remaining.filter((x) => x !== a);
      const stat = pctVsOpponents(standings[a], others);
      return stat.games > 0 ? stat.pct : null;
    }, true);
  }
  if (remaining.length === 2) {
    return numericSplit(remaining, (a) => {
      const other = remaining.find((x) => x !== a);
      const stat = pctVsOpponents(standings[a], [other]);
      return stat.games > 0 ? stat.pct : null;
    }, true);
  }
  // 3+ way wild-card tie: only a clean sweep counts.
  const stats = remaining.map((a) => ({
    abbrev: a,
    ...pctVsOpponents(standings[a], remaining.filter((x) => x !== a)),
  }));
  const sweptAll = stats.find((s) => s.games === remaining.length - 1 && s.pct === 1);
  if (sweptAll) {
    return { winners: [sweptAll.abbrev], losers: remaining.filter((a) => a !== sweptAll.abbrev) };
  }
  const lostAll = stats.find((s) => s.games === remaining.length - 1 && s.pct === 0);
  if (lostAll) {
    return { winners: remaining.filter((a) => a !== lostAll.abbrev), losers: [lostAll.abbrev] };
  }
  return { winners: remaining, losers: [] };
}

function commonGamesSplit(remaining, standings) {
  return numericSplit(remaining, (a) => {
    const rec = standings[a];
    const others = remaining.filter((x) => x !== a);
    const commonOpponents = Object.keys(rec.vs).filter((opp) =>
      others.every((other) => standings[other].vs[opp])
    );
    const stat = pctVsOpponents(rec, commonOpponents);
    return stat.games >= 4 ? stat.pct : null;
  }, true);
}

function buildSteps(mode, standings, teams) {
  const steps = [
    (remaining) => headToHeadSplit(remaining, standings, mode),
  ];
  if (mode === 'division') {
    steps.push((remaining) => numericSplit(remaining, (a) => standings[a].divPct, true));
  }
  steps.push(
    (remaining) => commonGamesSplit(remaining, standings),
    (remaining) => numericSplit(remaining, (a) => standings[a].confPct, true),
    (remaining) => numericSplit(remaining, (a) => strengthOfVictory(standings[a], standings), true),
    (remaining) => numericSplit(remaining, (a) => strengthOfSchedule(standings[a], standings), true),
    (remaining) => {
      const conf = teams[remaining[0]].conf;
      const confTeams = Object.keys(teams).filter((t) => teams[t].conf === conf);
      const pfRank = combinedRank(remaining, standings, confTeams, 'pf');
      const paRank = combinedRank(remaining, standings, confTeams, 'pa');
      return numericSplit(remaining, (a) => pfRank[a] + paRank[a], false);
    },
    (remaining) => {
      const allTeams = Object.keys(teams);
      const pfRank = combinedRank(remaining, standings, allTeams, 'pf');
      const paRank = combinedRank(remaining, standings, allTeams, 'pa');
      return numericSplit(remaining, (a) => pfRank[a] + paRank[a], false);
    },
    // Net points in common games is skipped in favor of net points overall.
    (remaining) => numericSplit(remaining, (a) => standings[a].net, true)
  );
  return steps;
}

// Resolves a tied group into a full best-to-worst ordering (same length as
// the input). `mode` is 'division' or 'wildcard'.
export function resolveTieGroup(group, standings, teams, mode, rng) {
  if (group.length <= 1) return group;

  const steps = buildSteps(mode, standings, teams);
  let remaining = group;
  const eliminatedStack = [];

  for (const step of steps) {
    if (remaining.length <= 1) break;
    const { winners, losers } = step(remaining);
    if (losers.length > 0) eliminatedStack.push(losers);
    remaining = winners;
  }

  let order = remaining.length > 1 ? coinToss(remaining, rng) : remaining;
  for (let i = eliminatedStack.length - 1; i >= 0; i--) {
    const grp = eliminatedStack[i];
    const resolvedGrp = grp.length > 1 ? resolveTieGroup(grp, standings, teams, mode, rng) : grp;
    order = [...order, ...resolvedGrp];
  }
  return order;
}

// Sorts a full set of teams best-to-worst, resolving ties as they arise.
export function sortWithTiebreaks(abbrevs, standings, teams, mode, rng) {
  const sorted = [...abbrevs].sort((a, b) => standings[b].pct - standings[a].pct);
  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && standings[sorted[j]].pct === standings[sorted[i]].pct) j++;
    const group = sorted.slice(i, j);
    const ordered = group.length > 1
      ? resolveTieGroup(group, standings, teams, mode, rng)
      : group;
    result.push(...ordered);
    i = j;
  }
  return result;
}
