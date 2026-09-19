import { makeRng, randomSeed } from '../sim/random.js';
import { buildScoreSampler } from '../sim/scoreDistribution.js';
import { simulateSeason } from '../sim/season.js';
import { initThemeToggle } from './theme.js';

initThemeToggle(document.getElementById('theme-toggle'));

const DIVISIONS = ['East', 'North', 'South', 'West'];
const CONFS = ['AFC', 'NFC'];

let teams, ratings, schedule, scoreSampler;

async function loadData() {
  const [teamsRes, fpiRes, scheduleRes, scoreDistRes] = await Promise.all([
    fetch('data/teams.json'), fetch('data/fpi.json'), fetch('data/schedule.json'), fetch('data/score-distribution.json'),
  ]);
  teams = await teamsRes.json();
  const fpi = await fpiRes.json();
  schedule = await scheduleRes.json();
  const scoreDist = await scoreDistRes.json();
  ratings = fpi.ratings;
  scoreSampler = buildScoreSampler(scoreDist.counts);
  return { fpi, schedule };
}

function teamCell(abbrev) {
  const t = teams[abbrev];
  return `<div class="team-cell"><img src="${t.logo}" alt=""><span>${t.name}</span></div>`;
}

function renderStandings(standings, seedByAbbrev) {
  let html = '';
  for (const conf of CONFS) {
    html += `<h3>${conf}</h3><div class="divisions-grid">`;
    for (const div of DIVISIONS) {
      const divTeams = Object.keys(teams).filter((a) => teams[a].conf === conf && teams[a].div === div);
      divTeams.sort((a, b) => standings[b].pct - standings[a].pct);
      html += `<div><h3>${conf} ${div}</h3><table><thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th><th>Seed</th></tr></thead><tbody>`;
      divTeams.forEach((abbrev, idx) => {
        const rec = standings[abbrev];
        const seed = seedByAbbrev[abbrev];
        const rowClass = seed ? (idx === 0 ? 'playoff-team division-winner' : 'playoff-team') : '';
        html += `<tr class="${rowClass}"><td>${teamCell(abbrev)}</td><td>${rec.wins}</td><td>${rec.losses}</td><td>${rec.ties}</td><td>${rec.pf}</td><td>${rec.pa}</td><td>${seed ? '#' + seed : ''}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
  }
  return html;
}

function gameRow(label, homeAbbrev, awayAbbrev, homeScore, awayScore, homeSeed, awaySeed) {
  const homeWon = homeScore > awayScore;
  return `
    <div class="bracket-game">
      <div class="muted" style="margin-bottom:4px">${label}</div>
      <div class="row"><span class="${homeWon ? 'winner' : 'loser'}">#${homeSeed} ${teams[homeAbbrev].name}</span><span>${homeScore}</span></div>
      <div class="row"><span class="${!homeWon ? 'winner' : 'loser'}">#${awaySeed} ${teams[awayAbbrev].name}</span><span>${awayScore}</span></div>
    </div>`;
}

function runSimulation() {
  const rng = makeRng(randomSeed());
  const { standings, playoffs } = simulateSeason(schedule, ratings, scoreSampler, rng, teams);

  const seedByAbbrev = {};
  playoffs.afcSeeds.forEach((a, idx) => { seedByAbbrev[a] = idx + 1; });
  playoffs.nfcSeeds.forEach((a, idx) => { seedByAbbrev[a] = idx + 1; });

  document.getElementById('champion-banner').innerHTML =
    `🏆 Super Bowl Champion: ${teams[playoffs.champion].name}`;
  document.getElementById('standings').innerHTML = renderStandings(standings, seedByAbbrev);
  document.getElementById('bracket').innerHTML = renderSimpleBracket(playoffs);
  document.getElementById('results').style.display = '';
}

// Simpler, correct-by-construction bracket renderer (avoids the score-lookup
// ambiguity of trying to re-derive home/away scores from the winner name).
function renderSimpleBracket(playoffs) {
  const round = (label, games, seeds) => {
    let html = `<div class="bracket-col"><h3>${label}</h3>`;
    for (const g of games) {
      const homeAbbrev = seeds[g.homeSeed - 1];
      const awayAbbrev = seeds[g.awaySeed - 1];
      html += gameRow('', homeAbbrev, awayAbbrev, g.homeScore, g.awayScore, g.homeSeed, g.awaySeed);
    }
    return html + '</div>';
  };

  let html = '<div class="bracket">';
  html += round('AFC Wild Card', playoffs.afc.wildcard, playoffs.afcSeeds);
  html += round('AFC Divisional', playoffs.afc.divisional, playoffs.afcSeeds);
  html += round('AFC Championship', [playoffs.afc.championship], playoffs.afcSeeds);
  html += '</div><div class="bracket" style="margin-top:16px">';
  html += round('NFC Wild Card', playoffs.nfc.wildcard, playoffs.nfcSeeds);
  html += round('NFC Divisional', playoffs.nfc.divisional, playoffs.nfcSeeds);
  html += round('NFC Championship', [playoffs.nfc.championship], playoffs.nfcSeeds);
  html += '</div>';

  const sb = playoffs.superBowl;
  html += `<div style="margin-top:20px"><h3>Super Bowl</h3><div class="bracket-game" style="max-width:280px">
    <div class="row"><span class="${sb.winner === playoffs.afc.champion ? 'winner' : 'loser'}">${teams[playoffs.afc.champion].name} (AFC)</span><span>${sb.homeScore}</span></div>
    <div class="row"><span class="${sb.winner === playoffs.nfc.champion ? 'winner' : 'loser'}">${teams[playoffs.nfc.champion].name} (NFC)</span><span>${sb.awayScore}</span></div>
  </div></div>`;
  return html;
}

async function main() {
  const { schedule: sched } = await loadData();
  const completed = sched.games.filter((g) => g.completed).length;
  document.getElementById('intro-text').textContent =
    `${completed} of ${sched.games.length} ${sched.season} regular season games are already final; the rest will be simulated using ESPN FPI ratings.`;
  const btn = document.getElementById('simulate-btn');
  btn.disabled = false;
  btn.textContent = 'Simulate season';
  btn.addEventListener('click', () => {
    btn.textContent = 'Re-roll';
    runSimulation();
  });
}

main().catch((err) => {
  document.getElementById('intro-text').textContent = 'Failed to load data: ' + err.message;
});
