// Builds per-team regular-season records (overall, division, conference,
// points, and head-to-head tables) from a flat list of completed games.
// `teams` is the docs/data/teams.json map: { [abbrev]: { conf, div } }.

function emptyRecord(abbrev, meta) {
  return {
    abbrev,
    conf: meta.conf,
    div: meta.div,
    wins: 0, losses: 0, ties: 0,
    divWins: 0, divLosses: 0, divTies: 0,
    confWins: 0, confLosses: 0, confTies: 0,
    pf: 0, pa: 0,
    // abbrev -> { w, l, t } restricted to games against that opponent
    vs: {},
  };
}

function recordResult(rec, oppAbbrev, outcome) {
  if (!rec.vs[oppAbbrev]) rec.vs[oppAbbrev] = { w: 0, l: 0, t: 0 };
  if (outcome === 'W') { rec.wins++; rec.vs[oppAbbrev].w++; }
  else if (outcome === 'L') { rec.losses++; rec.vs[oppAbbrev].l++; }
  else { rec.ties++; rec.vs[oppAbbrev].t++; }
}

export function buildStandings(games, teams) {
  const standings = {};
  for (const abbrev of Object.keys(teams)) {
    standings[abbrev] = emptyRecord(abbrev, teams[abbrev]);
  }

  for (const g of games) {
    if (!g.completed || g.seasonType !== 'REG') continue;
    const home = standings[g.home];
    const away = standings[g.away];
    if (!home || !away) continue;

    home.pf += g.homeScore; home.pa += g.awayScore;
    away.pf += g.awayScore; away.pa += g.homeScore;

    const sameDiv = teams[g.home].div === teams[g.away].div && teams[g.home].conf === teams[g.away].conf;
    const sameConf = teams[g.home].conf === teams[g.away].conf;

    let homeOutcome, awayOutcome;
    if (g.homeScore > g.awayScore) { homeOutcome = 'W'; awayOutcome = 'L'; }
    else if (g.homeScore < g.awayScore) { homeOutcome = 'L'; awayOutcome = 'W'; }
    else { homeOutcome = 'T'; awayOutcome = 'T'; }

    recordResult(home, g.away, homeOutcome);
    recordResult(away, g.home, awayOutcome);

    if (sameDiv) {
      if (homeOutcome === 'W') { home.divWins++; away.divLosses++; }
      else if (homeOutcome === 'L') { home.divLosses++; away.divWins++; }
      else { home.divTies++; away.divTies++; }
    }
    if (sameConf) {
      if (homeOutcome === 'W') { home.confWins++; away.confLosses++; }
      else if (homeOutcome === 'L') { home.confLosses++; away.confWins++; }
      else { home.confTies++; away.confTies++; }
    }
  }

  for (const rec of Object.values(standings)) {
    rec.pct = winPct(rec.wins, rec.losses, rec.ties);
    rec.divPct = winPct(rec.divWins, rec.divLosses, rec.divTies);
    rec.confPct = winPct(rec.confWins, rec.confLosses, rec.confTies);
    rec.net = rec.pf - rec.pa;
  }

  return standings;
}

export function winPct(w, l, t) {
  const g = w + l + t;
  if (g === 0) return 0;
  return (w + 0.5 * t) / g;
}
