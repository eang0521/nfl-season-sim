// Playoff seeding (7 teams/conference: 4 division winners + 3 wild cards)
// and bracket simulation with re-seeding, per the current NFL format.

import { sortWithTiebreaks } from './tiebreakers.js';
import { simulateFullGame } from './engine.js';

const DIVISIONS = ['East', 'North', 'South', 'West'];

export function seedConference(conf, standings, teams, rng) {
  const confTeams = Object.keys(teams).filter((t) => teams[t].conf === conf);

  const divisionWinners = [];
  const nonWinners = [];
  for (const div of DIVISIONS) {
    const divTeams = confTeams.filter((t) => teams[t].div === div);
    const ordered = sortWithTiebreaks(divTeams, standings, teams, 'division', rng);
    divisionWinners.push(ordered[0]);
    nonWinners.push(...ordered.slice(1));
  }

  const seededWinners = sortWithTiebreaks(divisionWinners, standings, teams, 'wildcard', rng);
  const seededWildcards = sortWithTiebreaks(nonWinners, standings, teams, 'wildcard', rng).slice(0, 3);

  return [...seededWinners, ...seededWildcards]; // index 0 = #1 seed ... index 6 = #7 seed
}

function playGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, neutral = false) {
  // Playoff games can't end in a tie: allowTie=false keeps overtime going
  // (additional 2-possession sudden-death blocks) until someone wins.
  const { homeScore, awayScore } = simulateFullGame(homeAbbrev, awayAbbrev, ratings, scoreSampler, rng, { neutral, allowTie: false });
  return homeScore > awayScore
    ? { winner: homeAbbrev, loser: awayAbbrev, homeScore, awayScore }
    : { winner: awayAbbrev, loser: homeAbbrev, homeScore, awayScore };
}

// Re-seeds remaining teams: highest seed hosts lowest seed, etc.
function reseed(remainingSeeds) {
  const sorted = [...remainingSeeds].sort((a, b) => a.seed - b.seed);
  const matchups = [];
  for (let i = 0; i < sorted.length / 2; i++) {
    matchups.push([sorted[i], sorted[sorted.length - 1 - i]]);
  }
  return matchups;
}

// seeds: array of 7 abbrevs, index 0 = #1 seed ... index 6 = #7 seed.
// Returns the full bracket result for one conference through the championship.
export function simulateConferencePlayoffs(seeds, ratings, scoreSampler, rng) {
  const withSeed = seeds.map((abbrev, i) => ({ abbrev, seed: i + 1 }));
  const results = { wildcard: [], divisional: [], championship: null };

  // Wild card round: #1 has a bye. 2v7, 3v6, 4v5.
  const wcMatchups = [[withSeed[1], withSeed[6]], [withSeed[2], withSeed[5]], [withSeed[3], withSeed[4]]];
  const wcWinners = [withSeed[0]];
  for (const [home, away] of wcMatchups) {
    const res = playGame(home.abbrev, away.abbrev, ratings, scoreSampler, rng);
    results.wildcard.push({ homeSeed: home.seed, awaySeed: away.seed, ...res });
    wcWinners.push(withSeed.find((s) => s.abbrev === res.winner));
  }

  // Divisional round: re-seed the 4 remaining teams.
  const divMatchups = reseed(wcWinners);
  const divWinners = [];
  for (const [higher, lower] of divMatchups) {
    const res = playGame(higher.abbrev, lower.abbrev, ratings, scoreSampler, rng);
    results.divisional.push({ homeSeed: higher.seed, awaySeed: lower.seed, ...res });
    divWinners.push(withSeed.find((s) => s.abbrev === res.winner));
  }

  // Conference championship: higher remaining seed hosts.
  const [a, b] = divWinners.sort((x, y) => x.seed - y.seed);
  const champRes = playGame(a.abbrev, b.abbrev, ratings, scoreSampler, rng);
  results.championship = { homeSeed: a.seed, awaySeed: b.seed, ...champRes };

  return { ...results, champion: champRes.winner };
}

export function simulateSuperBowl(afcChampion, nfcChampion, ratings, scoreSampler, rng) {
  const res = playGame(afcChampion, nfcChampion, ratings, scoreSampler, rng, true);
  return res;
}

export function simulatePlayoffs(standings, teams, ratings, scoreSampler, rng) {
  const afcSeeds = seedConference('AFC', standings, teams, rng);
  const nfcSeeds = seedConference('NFC', standings, teams, rng);

  const afc = simulateConferencePlayoffs(afcSeeds, ratings, scoreSampler, rng);
  const nfc = simulateConferencePlayoffs(nfcSeeds, ratings, scoreSampler, rng);

  const superBowl = simulateSuperBowl(afc.champion, nfc.champion, ratings, scoreSampler, rng);

  return {
    afcSeeds, nfcSeeds, afc, nfc, superBowl,
    champion: superBowl.winner,
  };
}
