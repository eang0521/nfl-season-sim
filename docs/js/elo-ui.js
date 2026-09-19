const MAX_SELECTED = 5;
// Last-resort palette for teams with no known colors (historical/defunct
// teams) or once a team's own colors are all taken by earlier selections.
const FALLBACK_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
// Colors closer than this (Euclidean RGB distance, max ~441) are treated as
// a collision - i.e. an already-selected team is using essentially the same
// color (e.g. the Rams and Cowboys share the exact same blue, #003594).
const COLLISION_THRESHOLD = 45;

// Codes used by the Elo dataset that differ from docs/data/teams.json's keys.
const CODE_TO_TEAMS_KEY = { OAK: 'LV' };

let teamsMeta = {}; // resolved: { code: { name, logo, active, color, secondaryColor } }
let ratings; // ratings.json contents
let selected = [];
let selectedColors = {}; // code -> resolved hex color for the current `selected` set
let leaderboardSort = { key: 'elo', dir: -1 };

function resolveTeamsMeta(teams, eloTeamNames) {
  const meta = {};
  for (const code of Object.keys(ratings.current)) {
    const teamsKey = CODE_TO_TEAMS_KEY[code] || code;
    if (teams[teamsKey]) {
      meta[code] = { name: teams[teamsKey].name, logo: teams[teamsKey].logo, active: true, color: teams[teamsKey].color, secondaryColor: teams[teamsKey].secondaryColor };
    } else if (eloTeamNames && eloTeamNames[code] && eloTeamNames[code].displayName) {
      meta[code] = { name: eloTeamNames[code].displayName, logo: null, active: false };
    } else {
      meta[code] = { name: code, logo: null, active: false };
    }
  }
  return meta;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function colorDistance(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// Assigns each selected team a color: its own primary color by default;
// if that's too close to an earlier-selected team's assigned color, its
// secondary color; if that's also taken, the next unused fallback color.
function assignSeriesColors(codes) {
  const used = [];
  const result = {};
  let fallbackIdx = 0;
  for (const code of codes) {
    const m = teamsMeta[code];
    const candidates = [m.color, m.secondaryColor].filter(Boolean);
    let chosen = candidates.find((c) => !used.some((u) => colorDistance(u, c) < COLLISION_THRESHOLD));
    while (!chosen && fallbackIdx < FALLBACK_PALETTE.length) {
      const candidate = FALLBACK_PALETTE[fallbackIdx++];
      if (!used.some((u) => colorDistance(u, candidate) < COLLISION_THRESHOLD)) chosen = candidate;
    }
    if (!chosen) chosen = candidates[candidates.length - 1] || FALLBACK_PALETTE[codes.indexOf(code) % FALLBACK_PALETTE.length];
    used.push(chosen);
    result[code] = chosen;
  }
  return result;
}

function activeCodesSortedByElo() {
  return Object.keys(teamsMeta)
    .filter((c) => teamsMeta[c].active)
    .sort((a, b) => ratings.current[b].elo - ratings.current[a].elo);
}

// ---------- Leaderboard ----------

function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  const codes = activeCodesSortedByElo();
  const { key, dir } = leaderboardSort;
  const sorted = [...codes].sort((a, b) => {
    const va = key === 'name' ? teamsMeta[a].name : ratings.current[a][key];
    const vb = key === 'name' ? teamsMeta[b].name : ratings.current[b][key];
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });

  tbody.innerHTML = sorted.map((code) => {
    const c = ratings.current[code];
    const m = teamsMeta[code];
    return `<tr>
      <td><div class="team-cell">${m.logo ? `<img src="${m.logo}" alt="">` : ''}<span>${m.name}</span></div></td>
      <td class="leaderboard-cell">${c.elo.toFixed(1)}</td>
      <td class="leaderboard-cell">${c.peakElo.toFixed(1)}</td>
      <td class="leaderboard-cell">${c.peakDate}</td>
      <td class="leaderboard-cell">${c.gamesPlayed}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#leaderboard-header th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.key === leaderboardSort.key);
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if (th.dataset.key === leaderboardSort.key) th.textContent += leaderboardSort.dir === 1 ? ' ▲' : ' ▼';
  });
}

function wireLeaderboardSort() {
  document.querySelectorAll('#leaderboard-header th').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (leaderboardSort.key === key) leaderboardSort.dir *= -1;
      else leaderboardSort = { key, dir: key === 'name' ? 1 : -1 };
      renderLeaderboard();
    });
  });
}

// ---------- Team picker ----------

function renderTeamPicker() {
  const picker = document.getElementById('team-picker');
  const activeCodes = activeCodesSortedByElo();

  const chipsHtml = activeCodes.map((code) => chipHtml(code)).join('');

  picker.innerHTML = `
    ${chipsHtml}
    <input list="elo-team-datalist" id="add-historical-team" placeholder="Add a historical team (name or code)&hellip;"
      style="background:var(--panel-alt);border:1px solid var(--border);border-radius:999px;padding:5px 12px;color:var(--text);font-size:13px;min-width:220px">
    <datalist id="elo-team-datalist">
      ${Object.keys(teamsMeta).filter((c) => !teamsMeta[c].active).sort((a, b) => teamsMeta[a].name.localeCompare(teamsMeta[b].name)).map((c) => `<option value="${teamsMeta[c].name} (${c})">`).join('')}
    </datalist>
  `;

  picker.querySelectorAll('.team-chip[data-code]').forEach((chip) => {
    chip.addEventListener('click', () => toggleTeam(chip.dataset.code));
  });

  const input = document.getElementById('add-historical-team');
  input.addEventListener('change', () => {
    const match = input.value.match(/\(([A-Z0-9]+)\)\s*$/);
    if (match && teamsMeta[match[1]]) {
      toggleTeam(match[1], true);
    }
    input.value = '';
  });
}

function chipHtml(code) {
  const m = teamsMeta[code];
  const isSelected = selected.includes(code);
  const color = selectedColors[code] || null;
  return `<div class="team-chip ${isSelected ? 'selected' : ''}" data-code="${code}" style="${color ? `--series-color:${color}` : ''}">
    <span class="swatch"></span>
    ${m.logo ? `<img src="${m.logo}" alt="">` : ''}
    <span>${m.name}</span>
  </div>`;
}

function toggleTeam(code, forceAdd = false) {
  const idx = selected.indexOf(code);
  if (idx >= 0 && !forceAdd) {
    selected.splice(idx, 1);
  } else if (idx < 0) {
    if (selected.length >= MAX_SELECTED) selected.shift();
    selected.push(code);
  }
  selectedColors = assignSeriesColors(selected);
  renderTeamPicker();
  renderChart();
}

// ---------- Chart ----------

const CHART_W = 960;
const CHART_H = 420;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 52 };

function niceStep(range, targetTicks) {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

function renderChart() {
  const wrap = document.getElementById('chart-wrap');
  if (selected.length === 0) {
    wrap.innerHTML = '<p class="muted" id="chart-placeholder">Pick a team above to see its Elo history.</p>';
    return;
  }

  const series = selected.map((code) => ({ code, points: ratings.trajectories[code] }));
  const allDates = series.flatMap((s) => s.points.map((p) => p.date));
  const allElos = series.flatMap((s) => s.points.map((p) => p.elo));
  const minDate = allDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
  const minElo = Math.min(...allElos);
  const maxElo = Math.max(...allElos);
  const eloPad = Math.max(20, (maxElo - minElo) * 0.08);
  const yMin = minElo - eloPad;
  const yMax = maxElo + eloPad;

  const minTs = new Date(minDate).getTime();
  const maxTs = new Date(maxDate).getTime();
  const xScale = (date) => {
    const t = new Date(date).getTime();
    return MARGIN.left + ((t - minTs) / (maxTs - minTs || 1)) * (CHART_W - MARGIN.left - MARGIN.right);
  };
  const yScale = (elo) => {
    const h = CHART_H - MARGIN.top - MARGIN.bottom;
    return MARGIN.top + h - ((elo - yMin) / (yMax - yMin || 1)) * h;
  };

  // Y gridlines at nice Elo steps.
  const yStep = niceStep(yMax - yMin, 6);
  const yTicks = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(Math.round(v));

  // X gridlines at nice year intervals.
  const minYear = new Date(minDate).getFullYear();
  const maxYear = new Date(maxDate).getFullYear();
  const yearStep = Math.max(1, niceStep(maxYear - minYear, 8));
  const xTicks = [];
  for (let y = Math.ceil(minYear / yearStep) * yearStep; y <= maxYear; y += yearStep) xTicks.push(y);

  let svg = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="Elo rating history">`;

  // gridlines + y labels
  for (const v of yTicks) {
    const y = yScale(v);
    svg += `<line x1="${MARGIN.left}" y1="${y}" x2="${CHART_W - MARGIN.right}" y2="${y}" stroke="var(--chart-grid)" stroke-width="1"/>`;
    svg += `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--text-dim)">${v}</text>`;
  }
  // x axis labels
  const axisY = CHART_H - MARGIN.bottom;
  svg += `<line x1="${MARGIN.left}" y1="${axisY}" x2="${CHART_W - MARGIN.right}" y2="${axisY}" stroke="var(--chart-axis)" stroke-width="1"/>`;
  for (const y of xTicks) {
    const x = xScale(`${y}-07-01`);
    svg += `<text x="${x}" y="${axisY + 18}" text-anchor="middle" font-size="11" fill="var(--text-dim)">${y}</text>`;
  }

  // lines + end markers
  series.forEach((s) => {
    const color = selectedColors[s.code];
    const d = s.points.map((p, j) => `${j === 0 ? 'M' : 'L'} ${xScale(p.date).toFixed(1)} ${yScale(p.elo).toFixed(1)}`).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = s.points[s.points.length - 1];
    svg += `<circle cx="${xScale(last.date).toFixed(1)}" cy="${yScale(last.elo).toFixed(1)}" r="4.5" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
  });

  svg += `<line id="elo-crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${axisY}" stroke="var(--chart-axis)" stroke-width="1" style="display:none"/>`;
  svg += `<rect id="elo-hover-target" x="${MARGIN.left}" y="${MARGIN.top}" width="${CHART_W - MARGIN.left - MARGIN.right}" height="${axisY - MARGIN.top}" fill="transparent"/>`;
  svg += '</svg>';

  const legend = selected.length > 1
    ? `<div class="elo-legend">${selected.map((code) => `<div class="item"><span class="key" style="background:${selectedColors[code]}"></span><span>${teamsMeta[code].name}</span></div>`).join('')}</div>`
    : '';

  wrap.innerHTML = `${svg}${legend}<div class="elo-tooltip" id="elo-tooltip" style="display:none"></div>`;

  wireChartHover(series, xScale, minTs, maxTs);
}

function wireChartHover(series, xScale, minTs, maxTs) {
  const wrap = document.getElementById('chart-wrap');
  const svgEl = wrap.querySelector('svg');
  const hoverTarget = document.getElementById('elo-hover-target');
  const crosshair = document.getElementById('elo-crosshair');
  const tooltip = document.getElementById('elo-tooltip');

  function nearestPointAtOrBefore(points, ts) {
    let lo = 0, hi = points.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (new Date(points[mid].date).getTime() <= ts) { ans = points[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans || points[0];
  }

  hoverTarget.addEventListener('mousemove', (e) => {
    const rect = svgEl.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const frac = px / rect.width;
    const svgX = frac * CHART_W;
    const ts = minTs + ((svgX - MARGIN.left) / (CHART_W - MARGIN.left - MARGIN.right)) * (maxTs - minTs);

    crosshair.style.display = '';
    crosshair.setAttribute('x1', svgX.toFixed(1));
    crosshair.setAttribute('x2', svgX.toFixed(1));

    const rows = series.map((s) => {
      const p = nearestPointAtOrBefore(s.points, ts);
      return { code: s.code, color: selectedColors[s.code], date: p.date, elo: p.elo };
    });
    const dateLabel = rows[0] ? rows[0].date : '';

    tooltip.innerHTML = `<div class="date">${dateLabel}</div>` + rows.map((r) => `
      <div class="row"><span class="key" style="background:${r.color}"></span><span class="val">${r.elo.toFixed(1)}</span><span class="name">${teamsMeta[r.code].name}</span></div>
    `).join('');
    const py = e.clientY - rect.top;
    tooltip.style.display = '';
    tooltip.style.left = `${(px / rect.width) * 100}%`;
    tooltip.style.top = `${py}px`;
  });

  hoverTarget.addEventListener('mouseleave', () => {
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

// ---------- Init ----------

async function main() {
  const [teams, ratingsData, eloTeamNames] = await Promise.all([
    fetch('data/teams.json').then((r) => r.json()),
    fetch('data/elo/ratings.json').then((r) => r.json()),
    fetch('data/elo/team-names.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);

  ratings = ratingsData;
  teamsMeta = resolveTeamsMeta(teams, eloTeamNames);

  document.getElementById('intro-text').innerHTML =
    `Every NFL game since 1920 (${ratings.gameCount.toLocaleString()} games), including AAFC (1946-49) and AFL (1960-69) games for franchises now in the NFL. ` +
    `Home-field advantage and margin-of-victory are factored in; ratings revert partway toward 1500 between seasons. Last updated ${new Date(ratings.updatedAt).toLocaleDateString()}.`;

  renderLeaderboard();
  wireLeaderboardSort();

  // Default to the current #1 team so the chart isn't empty on first load.
  selected = [activeCodesSortedByElo()[0]];
  selectedColors = assignSeriesColors(selected);
  renderTeamPicker();
  renderChart();
}

main().catch((err) => {
  document.getElementById('intro-text').textContent = 'Failed to load Elo data: ' + err.message;
});
