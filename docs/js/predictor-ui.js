import { initThemeToggle } from './theme.js';

initThemeToggle(document.getElementById('theme-toggle'));

const DIVISIONS = ['East', 'North', 'South', 'West'];
const CONFS_FOR_TAB = { ALL: ['AFC', 'NFC'], AFC: ['AFC'], NFC: ['NFC'] };

const BASE_COLUMNS = [
  { key: 'name', label: 'Team', width: 19 },
  { key: 'division', label: 'Division', width: 11 },
];
const ELO_COLUMN = { key: 'elo', label: 'Elo' };
const REST_COLUMNS = [
  { key: 'record', label: 'Proj. Record' },
  { key: 'wonDivisionPct', label: 'Win Division', pct: true },
  { key: 'madePlayoffsPct', label: 'Make Playoffs', pct: true },
  { key: 'madeDivisionalPct', label: 'Make Divisional Rd', pct: true },
  { key: 'madeConfChampPct', label: 'Make Conf. Champ.', pct: true },
  { key: 'madeSuperBowlPct', label: 'Make Super Bowl', pct: true },
  { key: 'wonSuperBowlPct', label: 'Win Super Bowl', pct: true },
];

function columnsForSource(src) {
  const cols = src === 'ELO' ? [...BASE_COLUMNS, ELO_COLUMN, ...REST_COLUMNS] : [...BASE_COLUMNS, ...REST_COLUMNS];
  const restCount = cols.length - BASE_COLUMNS.length;
  const restWidth = (70 / restCount).toFixed(2);
  return cols.map((c) => ({ ...c, width: c.width ?? Number(restWidth) }));
}

let teams, predictionsFpi, predictionsElo, predictions;
let source = 'FPI';
let currentTab = 'ALL';
let sort = null; // { key, dir: 1 | -1 } - null means "grouped by division" (default view)

function formatRecord(p) {
  const w = Math.round(p.projectedWins * 10) / 10;
  const l = Math.round(p.projectedLosses * 10) / 10;
  const t = Math.round(p.projectedTies * 10) / 10;
  return t >= 0.1 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

// Heat-map fill: white at 0% to dark blue at 100%, with text color flipped
// to stay readable once the background gets dark.
function pctColor(pct) {
  const t = Math.min(1, Math.max(0, pct));
  const from = [255, 255, 255];
  const to = [8, 48, 107]; // dark blue
  const rgb = from.map((c, i) => Math.round(c + t * (to[i] - c)));
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return { bg: `rgb(${rgb.join(',')})`, fg: luminance > 140 ? '#0b0e14' : '#ffffff' };
}

function pctCell(pct) {
  const p = Math.round(pct * 1000) / 10; // one decimal
  const { bg, fg } = pctColor(pct);
  return `<td class="pct-cell" style="background-color:${bg};color:${fg}">${p}%</td>`;
}

function divisionLabel(abbrev) {
  const t = teams[abbrev];
  return `${t.conf} ${t.div}`;
}

function cellForColumn(abbrev, col) {
  const t = teams[abbrev];
  const p = predictions.teams[abbrev];
  if (col.key === 'name') return `<td><div class="team-cell"><img src="${t.logo}" alt=""><span>${t.name}</span></div></td>`;
  if (col.key === 'division') return `<td>${divisionLabel(abbrev)}</td>`;
  if (col.key === 'record') return `<td>${formatRecord(p)}</td>`;
  if (col.key === 'elo') return `<td class="leaderboard-cell">${p.elo}</td>`;
  if (col.pct) return pctCell(p[col.key]);
  return '<td></td>';
}

function teamRow(abbrev) {
  const cols = columnsForSource(source);
  return `<tr>${cols.map((c) => cellForColumn(abbrev, c)).join('')}</tr>`;
}

function teamsForCurrentTab() {
  const confs = CONFS_FOR_TAB[currentTab];
  return Object.keys(teams).filter((a) => confs.includes(teams[a].conf));
}

function sortValue(abbrev, key) {
  const p = predictions.teams[abbrev];
  if (key === 'name') return teams[abbrev].name;
  if (key === 'division') return divisionLabel(abbrev);
  if (key === 'record') return p.projectedWins - p.projectedLosses;
  return p[key];
}

function renderHeader() {
  const headerRow = document.getElementById('odds-header');
  const cols = columnsForSource(source);
  headerRow.innerHTML = cols.map((c) => {
    let label = c.label;
    if (sort && sort.key === c.key) label += sort.dir === 1 ? ' ▲' : ' ▼';
    const sortedClass = sort && sort.key === c.key ? ' sorted' : '';
    return `<th data-key="${c.key}" style="width:${c.width}%; cursor:pointer" class="${sortedClass}">${label}</th>`;
  }).join('');

  headerRow.querySelectorAll('th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sort && sort.key === key) {
        sort.dir *= -1;
      } else {
        // Percentages/records/elo default to descending (best first); name/division default ascending.
        sort = { key, dir: key === 'name' || key === 'division' ? 1 : -1 };
      }
      render();
    });
  });
}

function render() {
  renderHeader();

  const tbody = document.getElementById('odds-body');
  const list = teamsForCurrentTab();

  if (!sort) {
    // Default view: grouped by conference/division, ranked by playoff odds within each.
    let html = '';
    for (const conf of CONFS_FOR_TAB[currentTab]) {
      for (const div of DIVISIONS) {
        const divTeams = list.filter((a) => teams[a].conf === conf && teams[a].div === div);
        divTeams.sort((a, b) => predictions.teams[b].madePlayoffsPct - predictions.teams[a].madePlayoffsPct);
        html += divTeams.map(teamRow).join('');
      }
    }
    tbody.innerHTML = html;
  } else {
    const sorted = [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const primary = typeof va === 'string' ? sort.dir * va.localeCompare(vb) : sort.dir * (va - vb);
      if (primary !== 0) return primary;
      if (sort.key === 'division') {
        // Tiebreaker within a division: best playoff odds first, regardless of sort direction.
        return predictions.teams[b].madePlayoffsPct - predictions.teams[a].madePlayoffsPct;
      }
      return 0;
    });
    tbody.innerHTML = sorted.map(teamRow).join('');
  }
}

function updateMetaText() {
  const meta = document.getElementById('meta-text');
  const base = `Based on ${predictions.simCount.toLocaleString()} simulations after ${predictions.basedOnCompletedGames} completed games. ` +
    `Last locked in ${new Date(predictions.updatedAt).toLocaleString()}.`;
  meta.textContent = source === 'ELO' ? `${base} Uses all-time Elo ratings instead of ESPN FPI.` : base;
}

async function main() {
  [teams, predictionsFpi, predictionsElo] = await Promise.all([
    fetch('data/teams.json').then((r) => r.json()),
    fetch('data/predictions.json').then((r) => r.json()),
    fetch('data/predictions-elo.json').then((r) => r.json()),
  ]);

  predictions = predictionsFpi;
  updateMetaText();
  render();

  document.querySelectorAll('#source-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#source-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      source = btn.dataset.source;
      predictions = source === 'ELO' ? predictionsElo : predictionsFpi;
      sort = null;
      updateMetaText();
      render();
    });
  });

  document.querySelectorAll('#conf-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#conf-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.conf;
      sort = null;
      render();
    });
  });
}

main().catch((err) => {
  document.getElementById('meta-text').textContent = 'Failed to load predictions: ' + err.message;
});
