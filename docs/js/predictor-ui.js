const DIVISIONS = ['East', 'North', 'South', 'West'];
const CONFS_FOR_TAB = { ALL: ['AFC', 'NFC'], AFC: ['AFC'], NFC: ['NFC'] };

let teams, predictions;
let currentTab = 'ALL';
let sort = null; // { key, dir: 1 | -1 } - null means "grouped by division" (default view)

function formatRecord(p) {
  const w = Math.round(p.projectedWins * 10) / 10;
  const l = Math.round(p.projectedLosses * 10) / 10;
  const t = Math.round(p.projectedTies * 10) / 10;
  return t >= 0.1 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function pctCell(pct) {
  const p = Math.round(pct * 1000) / 10; // one decimal
  return `<td data-sort-value="${pct}"><div class="pct-bar-wrap"><div class="pct-bar"><span style="width:${p}%"></span></div><span class="pct-num">${p}%</span></div></td>`;
}

function teamRow(abbrev) {
  const t = teams[abbrev];
  const p = predictions.teams[abbrev];
  return `<tr>
    <td><div class="team-cell"><img src="${t.logo}" alt=""><span>${t.name}</span></div></td>
    <td>${formatRecord(p)}</td>
    ${pctCell(p.wonDivisionPct)}
    ${pctCell(p.madePlayoffsPct)}
    ${pctCell(p.madeDivisionalPct)}
    ${pctCell(p.madeConfChampPct)}
    ${pctCell(p.madeSuperBowlPct)}
    ${pctCell(p.wonSuperBowlPct)}
  </tr>`;
}

function teamsForCurrentTab() {
  const confs = CONFS_FOR_TAB[currentTab];
  return Object.keys(teams).filter((a) => confs.includes(teams[a].conf));
}

function sortValue(abbrev, key) {
  const p = predictions.teams[abbrev];
  if (key === 'name') return teams[abbrev].name;
  if (key === 'record') return p.projectedWins - p.projectedLosses;
  return p[key];
}

function render() {
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
      if (typeof va === 'string') return sort.dir * va.localeCompare(vb);
      return sort.dir * (va - vb);
    });
    tbody.innerHTML = sorted.map(teamRow).join('');
  }

  document.querySelectorAll('#odds-header th').forEach((th) => {
    th.classList.toggle('sorted', sort && th.dataset.key === sort.key);
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if (sort && th.dataset.key === sort.key) {
      th.textContent += sort.dir === 1 ? ' ▲' : ' ▼';
    }
  });
}

async function main() {
  [teams, predictions] = await Promise.all([
    fetch('data/teams.json').then((r) => r.json()),
    fetch('data/predictions.json').then((r) => r.json()),
  ]);

  document.getElementById('meta-text').innerHTML =
    `Based on ${predictions.simCount.toLocaleString()} simulations after ${predictions.basedOnCompletedGames} completed games. ` +
    `Last locked in ${new Date(predictions.updatedAt).toLocaleString()}.`;

  render();

  document.querySelectorAll('#conf-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#conf-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.conf;
      sort = null;
      render();
    });
  });

  document.querySelectorAll('#odds-header th').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sort && sort.key === key) {
        sort.dir *= -1;
      } else {
        // Percentages/records default to descending (best first); name defaults ascending.
        sort = { key, dir: key === 'name' ? 1 : -1 };
      }
      render();
    });
  });
}

main().catch((err) => {
  document.getElementById('meta-text').textContent = 'Failed to load predictions: ' + err.message;
});
