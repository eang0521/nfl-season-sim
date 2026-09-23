import { initThemeToggle, getEffectiveTheme } from './theme.js';

initThemeToggle(document.getElementById('theme-toggle'));

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
let zoomDomain = null; // { start, end } (global week indices) - null means "full history"
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

// Coarse hue-family buckets so e.g. the Chiefs' bright red (#E31837) and the
// 49ers' dark red (#AA0000) count as "the same color" even though they're
// numerically far apart in RGB (a plain Euclidean distance missed this -
// two reds that are both unmistakably "red" to a person could still clear
// a distance threshold). Achromatic colors (black/white/gray) have no hue
// and aren't bucketed - two grays are told apart by lightness instead.
const ACHROMATIC_SATURATION = 12; // below this, a color reads as black/white/gray rather than a real hue

function colorFamily(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (s < ACHROMATIC_SATURATION || l < 8 || l > 92) return null;
  if (h < 15 || h >= 345) return 'red';
  if (h < 35) return 'orange';
  if (h < 70) return 'gold';
  if (h < 170) return 'green';
  if (h < 200) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'magenta';
}

function colorsCollide(hexA, hexB) {
  const famA = colorFamily(hexA);
  const famB = colorFamily(hexB);
  if (famA && famA === famB) return true;
  return colorDistance(hexA, hexB) < COLLISION_THRESHOLD;
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
      case gN: h = (bN - rN) / d + 2; break;
      default: h = (rN - gN) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

const MIN_LIGHTNESS_DARK = 42; // floor for a color's lightness on a dark surface
const MAX_LIGHTNESS_LIGHT = 62; // ceiling for a color's lightness on a light surface

// Nudges a color's lightness so it stays visible against the current
// theme's chart surface - a near-black navy is invisible on a dark
// background; a pale gold washes out on a light one. Preserves hue so the
// color still reads as "that team's color", just lifted/dropped in
// lightness. Achromatic colors (black/white/gray) stay achromatic.
function ensureVisible(hex, theme) {
  const { h, s, l } = hexToHsl(hex);
  // Don't force saturation onto a color colorFamily() treats as achromatic
  // (e.g. the Buccaneers' near-black pewter secondary) - that would turn a
  // gray into a spuriously colorful hue.
  const boostedS = s < ACHROMATIC_SATURATION ? s : Math.max(s, 45);
  if (theme === 'dark' && l < MIN_LIGHTNESS_DARK) return hslToHex(h, boostedS, MIN_LIGHTNESS_DARK);
  if (theme === 'light' && l > MAX_LIGHTNESS_LIGHT) return hslToHex(h, boostedS, MAX_LIGHTNESS_LIGHT);
  return hex;
}

// Assigns each selected team a color: its own primary color by default
// (adjusted for visibility against the current theme's chart surface); if
// that's too close to an earlier-selected team's assigned color, its
// secondary color; if that's also taken, the next unused fallback color.
function assignSeriesColors(codes, theme) {
  const used = [];
  const result = {};
  let fallbackIdx = 0;
  for (const code of codes) {
    const m = teamsMeta[code];
    const candidates = [m.color, m.secondaryColor].filter(Boolean).map((c) => ensureVisible(c, theme));
    let chosen = candidates.find((c) => !used.some((u) => colorsCollide(u, c)));
    while (!chosen && fallbackIdx < FALLBACK_PALETTE.length) {
      const candidate = ensureVisible(FALLBACK_PALETTE[fallbackIdx++], theme);
      if (!used.some((u) => colorsCollide(u, candidate))) chosen = candidate;
    }
    if (!chosen) chosen = candidates[candidates.length - 1] || ensureVisible(FALLBACK_PALETTE[codes.indexOf(code) % FALLBACK_PALETTE.length], theme);
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

function activeCodesSortedByName() {
  return Object.keys(teamsMeta)
    .filter((c) => teamsMeta[c].active)
    .sort((a, b) => teamsMeta[a].name.localeCompare(teamsMeta[b].name));
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
  const activeCodes = activeCodesSortedByName();

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
  selectedColors = assignSeriesColors(selected, getEffectiveTheme());
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

// Returns the slice of a (chronologically sorted) points array visible in
// [minWeek, maxWeek], including one point just before minWeek (if any) so a
// zoomed-in line enters the view at the correct value instead of
// appearing to start wherever the first in-window game happens to be.
function pointsForDomain(points, minWeek, maxWeek) {
  let lo = 0, hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].week < minWeek) lo = mid + 1; else hi = mid;
  }
  const startIdx = Math.max(0, lo - 1);
  let endIdx = startIdx;
  while (endIdx < points.length && points[endIdx].week <= maxWeek) endIdx++;
  return points.slice(startIdx, Math.max(endIdx, startIdx + 1));
}

// Seasons laid back-to-back with no off-season gap: ratings.seasonStartOffset
// maps each season to the global week index of its week 1.
let cachedSeasonList = null;
function seasonListSorted() {
  if (!cachedSeasonList) {
    cachedSeasonList = Object.keys(ratings.seasonStartOffset).map(Number).sort((a, b) => a - b);
  }
  return cachedSeasonList;
}

// Converts a global week index back to a human "SEASON Wk N" label.
function seasonWeekLabel(globalWeek) {
  const seasons = seasonListSorted();
  let season = seasons[0];
  for (const s of seasons) {
    if (ratings.seasonStartOffset[s] <= globalWeek) season = s; else break;
  }
  const local = Math.round(globalWeek - ratings.seasonStartOffset[season]) + 1;
  return `${season} Wk ${Math.max(1, local)}`;
}

function renderChart() {
  const wrap = document.getElementById('chart-wrap');
  if (selected.length === 0) {
    wrap.innerHTML = '<p class="muted" id="chart-placeholder">Pick a team above to see its Elo history.</p>';
    return;
  }

  const fullSeries = selected.map((code) => ({ code, points: ratings.trajectories[code] }));

  let minWeek, maxWeek;
  if (zoomDomain) {
    ({ start: minWeek, end: maxWeek } = zoomDomain);
  } else {
    const allWeeks = fullSeries.flatMap((s) => s.points.map((p) => p.week));
    minWeek = Math.min(...allWeeks);
    maxWeek = Math.max(...allWeeks);
  }

  // Points actually drawn, restricted to the current (possibly zoomed) window.
  const series = fullSeries.map((s) => ({ code: s.code, points: pointsForDomain(s.points, minWeek, maxWeek) }));

  const allElos = series.flatMap((s) => s.points.map((p) => p.elo));
  const minElo = Math.min(...allElos);
  const maxElo = Math.max(...allElos);
  const eloPad = Math.max(20, (maxElo - minElo) * 0.08);
  const yMin = minElo - eloPad;
  const yMax = maxElo + eloPad;

  const xScale = (week) => MARGIN.left + ((week - minWeek) / (maxWeek - minWeek || 1)) * (CHART_W - MARGIN.left - MARGIN.right);
  const yScale = (elo) => {
    const h = CHART_H - MARGIN.top - MARGIN.bottom;
    return MARGIN.top + h - ((elo - yMin) / (yMax - yMin || 1)) * h;
  };

  // Y gridlines at nice Elo steps.
  const yStep = niceStep(yMax - yMin, 6);
  const yTicks = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(Math.round(v));

  // X gridlines: one per season (year) visible in the current window, thinned
  // to roughly 8 labels. Seasons sit back-to-back (no off-season gap), so
  // "week" already skips the dead time between seasons.
  const seasons = seasonListSorted();
  const visibleSeasons = seasons.filter((s) => ratings.seasonStartOffset[s] >= minWeek - 1 && ratings.seasonStartOffset[s] <= maxWeek);
  const seasonStep = Math.max(1, Math.round(niceStep(visibleSeasons.length, 8)));
  const xTicks = visibleSeasons.filter((_, i) => i % seasonStep === 0);

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
  for (const season of xTicks) {
    const x = xScale(ratings.seasonStartOffset[season]);
    svg += `<text x="${x}" y="${axisY + 18}" text-anchor="middle" font-size="11" fill="var(--text-dim)">${season}</text>`;
  }

  // lines + end markers. Weeks are packed with no x-axis gap between seasons,
  // but the line itself is drawn one season at a time so it doesn't visually
  // bridge the off-season - a team's last week-20 game and next year's
  // week-1 game shouldn't look like consecutive games.
  series.forEach((s) => {
    if (s.points.length === 0) return;
    const color = selectedColors[s.code];
    let segStart = 0;
    for (let j = 1; j <= s.points.length; j++) {
      if (j === s.points.length || s.points[j].season !== s.points[segStart].season) {
        const seg = s.points.slice(segStart, j);
        const d = seg.map((p, k) => `${k === 0 ? 'M' : 'L'} ${xScale(p.week).toFixed(1)} ${yScale(p.elo).toFixed(1)}`).join(' ');
        svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        segStart = j;
      }
    }
    const last = s.points[s.points.length - 1];
    svg += `<circle cx="${xScale(last.week).toFixed(1)}" cy="${yScale(last.elo).toFixed(1)}" r="4.5" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
  });

  svg += `<line id="elo-crosshair" x1="0" y1="${MARGIN.top}" x2="0" y2="${axisY}" stroke="var(--chart-axis)" stroke-width="1" style="display:none"/>`;

  // Hover dots: one per series, hidden until the pointer is over the chart,
  // then snapped to that series' exact point at the hovered week. Drawn
  // after the crosshair so they sit on top of it.
  series.forEach((s, i) => {
    if (s.points.length === 0) return;
    svg += `<circle id="elo-hoverdot-${i}" r="5" fill="${selectedColors[s.code]}" stroke="var(--panel)" stroke-width="2" style="display:none" pointer-events="none"/>`;
  });
  svg += `<rect id="elo-selection" x="0" y="${MARGIN.top}" width="0" height="${axisY - MARGIN.top}" fill="var(--accent)" fill-opacity="0.15" style="display:none" pointer-events="none"/>`;
  svg += `<rect id="elo-hover-target" x="${MARGIN.left}" y="${MARGIN.top}" width="${CHART_W - MARGIN.left - MARGIN.right}" height="${axisY - MARGIN.top}" fill="transparent" style="cursor:crosshair"/>`;
  svg += '</svg>';

  const legend = selected.length > 1
    ? `<div class="elo-legend">${selected.map((code) => `<div class="item"><span class="key" style="background:${selectedColors[code]}"></span><span>${teamsMeta[code].name}</span></div>`).join('')}</div>`
    : '';

  const zoomHint = zoomDomain
    ? `<p class="muted" id="zoom-hint">Zoomed to ${seasonWeekLabel(zoomDomain.start)} &ndash; ${seasonWeekLabel(zoomDomain.end)}. Click the chart to reset.</p>`
    : `<p class="muted" id="zoom-hint">Drag across the chart to zoom in.</p>`;

  wrap.innerHTML = `${svg}${legend}${zoomHint}<div class="elo-tooltip" id="elo-tooltip" style="display:none"></div>`;

  wireChartInteractions(series, minWeek, maxWeek, xScale, yScale);
}

function wireChartInteractions(series, minWeek, maxWeek, xScale, yScale) {
  const wrap = document.getElementById('chart-wrap');
  const svgEl = wrap.querySelector('svg');
  const hoverTarget = document.getElementById('elo-hover-target');
  const crosshair = document.getElementById('elo-crosshair');
  const tooltip = document.getElementById('elo-tooltip');
  const selectionRect = document.getElementById('elo-selection');
  const plotLeft = MARGIN.left;
  const plotRight = CHART_W - MARGIN.right;
  const CLICK_THRESHOLD_PX = 6;
  const MIN_ZOOM_SPAN_WEEKS = 2;

  function nearestPointAtOrBefore(points, week) {
    let lo = 0, hi = points.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].week <= week) { ans = points[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans || points[0];
  }

  function svgXFromEvent(e, rect) {
    const px = e.clientX - rect.left;
    const frac = Math.min(1, Math.max(0, px / rect.width));
    return frac * CHART_W;
  }

  function weekFromSvgX(svgX) {
    return minWeek + ((svgX - plotLeft) / (plotRight - plotLeft)) * (maxWeek - minWeek);
  }

  function showTooltipAt(svgX, e, rect) {
    const week = weekFromSvgX(svgX);
    crosshair.style.display = '';
    crosshair.setAttribute('x1', svgX.toFixed(1));
    crosshair.setAttribute('x2', svgX.toFixed(1));

    const rows = [];
    series.forEach((s, i) => {
      const dot = document.getElementById(`elo-hoverdot-${i}`);
      if (s.points.length === 0) { if (dot) dot.style.display = 'none'; return; }
      const p = nearestPointAtOrBefore(s.points, week);
      rows.push({ code: s.code, color: selectedColors[s.code], season: p.season, weekInSeason: p.weekInSeason, elo: p.elo });
      // Snap the dot to that series' exact point for the hovered week, not
      // the raw cursor position - the line only actually has a value at
      // its own game weeks.
      if (dot) {
        dot.setAttribute('cx', xScale(p.week).toFixed(1));
        dot.setAttribute('cy', yScale(p.elo).toFixed(1));
        dot.style.display = '';
      }
    });
    const weekLabel = rows[0] ? `${rows[0].season} Wk ${rows[0].weekInSeason}` : '';

    tooltip.innerHTML = `<div class="date">${weekLabel}</div>` + rows.map((r) => `
      <div class="row"><span class="key" style="background:${r.color}"></span><span class="val">${r.elo.toFixed(1)}</span><span class="name">${teamsMeta[r.code].name}</span></div>
    `).join('');
    tooltip.style.display = '';
    tooltip.style.left = `${(svgX / CHART_W) * 100}%`;
    tooltip.style.top = `${e.clientY - rect.top}px`;
  }

  function hideTooltip() {
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
    series.forEach((s, i) => {
      const dot = document.getElementById(`elo-hoverdot-${i}`);
      if (dot) dot.style.display = 'none';
    });
  }

  let isDragging = false;
  let dragStartSvgX = null;

  function onWindowMouseMove(e) {
    const rect = svgEl.getBoundingClientRect();
    const svgX = svgXFromEvent(e, rect);
    const x0 = Math.min(dragStartSvgX, svgX);
    const x1 = Math.max(dragStartSvgX, svgX);
    selectionRect.style.display = '';
    selectionRect.setAttribute('x', x0.toFixed(1));
    selectionRect.setAttribute('width', Math.max(0, x1 - x0).toFixed(1));
  }

  function onWindowMouseUp(e) {
    isDragging = false;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    selectionRect.style.display = 'none';

    const rect = svgEl.getBoundingClientRect();
    const svgX = svgXFromEvent(e, rect);
    const dragScreenPx = Math.abs(svgX - dragStartSvgX) * (rect.width / CHART_W);

    if (dragScreenPx < CLICK_THRESHOLD_PX) {
      if (zoomDomain) { zoomDomain = null; renderChart(); }
      return;
    }

    const weekA = weekFromSvgX(dragStartSvgX);
    const weekB = weekFromSvgX(svgX);
    const start = Math.round(Math.min(weekA, weekB));
    const end = Math.round(Math.max(weekA, weekB));
    if (end - start < MIN_ZOOM_SPAN_WEEKS) return;

    zoomDomain = { start, end };
    renderChart();
  }

  hoverTarget.addEventListener('mousemove', (e) => {
    if (isDragging) return;
    const rect = svgEl.getBoundingClientRect();
    showTooltipAt(svgXFromEvent(e, rect), e, rect);
  });

  hoverTarget.addEventListener('mouseleave', () => {
    if (!isDragging) hideTooltip();
  });

  hoverTarget.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = svgEl.getBoundingClientRect();
    dragStartSvgX = svgXFromEvent(e, rect);
    isDragging = true;
    hideTooltip();
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    e.preventDefault();
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
  selectedColors = assignSeriesColors(selected, getEffectiveTheme());
  renderTeamPicker();
  renderChart();
}

main().catch((err) => {
  document.getElementById('intro-text').textContent = 'Failed to load Elo data: ' + err.message;
});

// Recompute colors (they're picked for visibility against the current
// theme's chart surface) whenever the theme toggle changes.
window.addEventListener('themechange', () => {
  if (selected.length === 0) return;
  selectedColors = assignSeriesColors(selected, getEffectiveTheme());
  renderTeamPicker();
  renderChart();
});
