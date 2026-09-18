const DIVISIONS = ['East', 'North', 'South', 'West'];

function pctCell(pct) {
  const p = Math.round(pct * 1000) / 10; // one decimal
  return `<td><div class="pct-bar-wrap"><div class="pct-bar"><span style="width:${p}%"></span></div><span class="pct-num">${p}%</span></div></td>`;
}

function renderConference(conf, teams, predictions) {
  let html = '';
  for (const div of DIVISIONS) {
    const divTeams = Object.keys(teams).filter((a) => teams[a].conf === conf && teams[a].div === div);
    divTeams.sort((a, b) => predictions.teams[b].madePlayoffsPct - predictions.teams[a].madePlayoffsPct);
    for (const abbrev of divTeams) {
      const t = teams[abbrev];
      const p = predictions.teams[abbrev];
      html += `<tr>
        <td><div class="team-cell"><img src="${t.logo}" alt=""><span>${t.name}</span></div></td>
        ${pctCell(p.madePlayoffsPct)}
        ${pctCell(p.wonDivisionPct)}
        ${pctCell(p.madeDivisionalPct)}
        ${pctCell(p.madeConfChampPct)}
        ${pctCell(p.madeSuperBowlPct)}
        ${pctCell(p.wonSuperBowlPct)}
      </tr>`;
    }
  }
  return html;
}

async function main() {
  const [teams, predictions] = await Promise.all([
    fetch('data/teams.json').then((r) => r.json()),
    fetch('data/predictions.json').then((r) => r.json()),
  ]);

  document.getElementById('meta-text').innerHTML =
    `Based on ${predictions.simCount.toLocaleString()} simulations after ${predictions.basedOnCompletedGames} completed games. ` +
    `Last locked in ${new Date(predictions.updatedAt).toLocaleString()}.`;

  const tbody = document.getElementById('odds-body');
  let currentConf = 'AFC';
  const render = () => { tbody.innerHTML = renderConference(currentConf, teams, predictions); };
  render();

  document.querySelectorAll('#conf-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#conf-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentConf = btn.dataset.conf;
      render();
    });
  });
}

main().catch((err) => {
  document.getElementById('meta-text').textContent = 'Failed to load predictions: ' + err.message;
});
