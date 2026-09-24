/* ============================================================
 * 界面：状态、路由、视图渲染、交互
 * ============================================================ */
const STORE_KEY = "wargame-workshop-v1";
const STEPS = [
  { key: "scenario",   title: "作战场景", sub: "时间、地域、环境" },
  { key: "forces",     title: "参演力量", sub: "红蓝双方兵力编成" },
  { key: "objectives", title: "推演目标", sub: "目的、目标与计分" },
  { key: "rules",      title: "规则设置", sub: "回合、裁决、迷雾" },
  { key: "scheme",     title: "兵棋方案", sub: "生成完整方案" },
  { key: "play",       title: "人工推演", sub: "对抗、裁决、复盘" },
];
const S = { projects: [], cur: null, view: "home", ui: { zoom: 1.15 }, undo: [], storageOk: true, lastSaved: null };
let SAMPLE = null, DL = null;
const CHARTS = {};

/* ---------------- 持久化 ---------------- */
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const d = JSON.parse(raw); S.projects = d.projects || []; } }
  catch (e) { S.storageOk = false; }
  if (!S.projects.length) S.projects = [makeSampleProject()];
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ projects: S.projects })); S.storageOk = true; S.lastSaved = new Date(); }
    catch (e) { S.storageOk = false; }
    renderSaveState();
  }, 300);
}
function touch(p) { p.updatedAt = new Date().toISOString(); save(); }
function renderSaveState() {
  const el = document.getElementById("save-state"); if (!el) return;
  el.textContent = !S.storageOk ? "浏览器存储不可用 · 请导出 JSON 备份" : S.lastSaved ? "已保存在本浏览器 " + S.lastSaved.toTimeString().slice(0, 5) : "自动保存在本浏览器";
}
function proj() { return S.projects.find(p => p.id === S.cur); }
function newProject(name, tpl) {
  const base = TEMPLATES[tpl || "blank"].build();
  const now = new Date().toISOString();
  return { id: uid(), name: name || base.scenario.title || "未命名项目", createdAt: now, updatedAt: now, template: tpl, ...base, rules: defaultRules(base.scenario.level), rulesConfirmed: tpl && tpl !== "blank", scheme: null, game: null };
}
function makeSampleProject() {
  const p = newProject("", "coastal"); p.sample = true; p.name = p.scenario.title;
  p.rules.dice = "2d6";
  p.scheme = generateScheme(p, { newMap: true });
  return p;
}

/* ---------------- 工具 ---------------- */
function setPath(obj, path, v) { const ks = path.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
function getPath(obj, path) { return path.split(".").reduce((o, k) => o == null ? o : o[k], obj); }
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function term(word) { const g = GLOSSARY.find(x => x[0].includes(word)); return g ? '<span class="term" title="' + esc(g[1]) + '">' + esc(word) + "</span>" : esc(word); }
function stepDone(p, key) {
  const sc = p.scenario;
  switch (key) {
    case "scenario": return !!(sc.title && (sc.background || "").length >= 20 && sc.terrain.length);
    case "forces": return p.forces.red.units.length > 0 && p.forces.blue.units.length > 0;
    case "objectives": return p.objectives.items.some(o => o.side === "red") && p.objectives.items.some(o => o.side === "blue");
    case "rules": return !!p.rulesConfirmed;
    case "scheme": return !!p.scheme && p.scheme.inputHash === inputHash(p);
    case "play": return !!(p.game && p.game.ended);
  }
  return false;
}
function isStale(p) { return p.scheme && p.scheme.inputHash !== inputHash(p); }
function sideColor(side) { return side === "red" ? "var(--red)" : side === "blue" ? "var(--blue)" : "var(--white-cell)"; }
function fmtTime(iso) { try { const d = new Date(iso); return d.toLocaleDateString("zh-CN") + " " + d.toTimeString().slice(0, 5); } catch (e) { return ""; } }
function dtgLabel(p, turn) { const h = (turn - 1) * (+p.scenario.hoursPerTurn || 0); return p.scenario.startDTG + (h ? " + " + h + "h" : ""); }
function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(label) + "</option>"; }

/* ---------------- 棋子与地图 SVG ---------------- */
function symbolSVG(sym) {
  const L = 'stroke="#fff" stroke-width="1" fill="none"';
  switch (sym) {
    case "inf": return '<path d="M7 4 L23 14 M7 14 L23 4" ' + L + "/>";
    case "armor": return '<ellipse cx="15" cy="9" rx="5.5" ry="3" ' + L + "/>";
    case "mech": return '<path d="M7 4 L23 14 M7 14 L23 4" ' + L + '/><ellipse cx="15" cy="9" rx="5.5" ry="3" ' + L + "/>";
    case "art": return '<circle cx="15" cy="9" r="1.8" fill="#fff"/>';
    case "ad": return '<path d="M9 14 A6 6 0 0 1 21 14" ' + L + "/>";
    case "air": return '<path d="M9 7 L15 11 L21 7" ' + L + "/>";
    case "helo": return '<path d="M10 6 L15 9 L10 12 Z M20 6 L15 9 L20 12 Z" fill="#fff"/>';
    case "sof": return '<text x="15" y="12" text-anchor="middle" font-size="7" fill="#fff" font-family="monospace" font-weight="700">SF</text>';
    case "naval": return '<path d="M9 9 L21 9 L19 12.5 L11 12.5 Z" fill="#fff"/>';
    case "hq": return '<text x="15" y="12" text-anchor="middle" font-size="7" fill="#fff" font-family="monospace" font-weight="700">HQ</text>';
    case "log": return '<path d="M7 11 L23 11" ' + L + '/><circle cx="15" cy="7.5" r="1.4" ' + L + "/>";
    case "ew": return '<text x="15" y="12" text-anchor="middle" font-size="7" fill="#fff" font-family="monospace" font-weight="700">EW</text>';
  }
  return "";
}
function counterInner(side, type, echelon, stats, steps, maxSteps) {
  const t = UNIT_TYPES[type] || UNIT_TYPES.inf, e = ECHELONS[echelon] || ECHELONS.battalion;
  let pips = "";
  if (maxSteps) for (let i = 0; i < maxSteps; i++) pips += '<rect x="26" y="' + (4 + i * 4) + '" width="2.5" height="2.5" fill="' + (i < steps ? "#fff" : "rgba(255,255,255,.25)") + '"/>';
  return '<rect class="cbody" x="0.5" y="0.5" width="29" height="23" rx="2" style="fill:' + sideColor(side) + '" stroke="rgba(0,0,0,.35)"/>' +
    '<text x="15" y="3.6" text-anchor="middle" font-size="3.6" fill="#fff" font-family="monospace">' + e.mark + "</text>" +
    '<rect x="7" y="4" width="16" height="10" fill="none" stroke="#fff" stroke-width="1"/>' + symbolSVG(t.sym) +
    '<text x="15" y="21" text-anchor="middle" font-size="5.6" fill="#fff" font-family="monospace" font-weight="700">' + Math.round(stats.atk) + "-" + Math.round(stats.def) + "-" + stats.mv + "</text>" + pips;
}
function miniCounter(side, u) { const st = unitStats(u); return '<svg class="counter-mini" viewBox="0 0 30 24" aria-hidden="true">' + counterInner(side, u.type, u.echelon, st, st.steps, 0) + "</svg>"; }
function starPath(cx, cy, r) { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); } return d + "Z"; }
function visibleTo(p, g, u, view) {
  if (!view || view === "white" || u.side === view) return true;
  if (p.rules.fog !== "双盲") return true;
  return aliveUnits(g, view).some(x => hexDist(x.hex, u.hex) <= (isAirType(x.type) ? 3 : 2));
}
function mapSVG(p, o) {
  o = o || {};
  const m = o.map || p.scheme.map, { cols, rows, hexes } = m, sz = mapSize(cols, rows);
  const w = o.fluid ? "100%" : Math.round(sz.w * (o.zoom || 1));
  let s = '<svg class="map-svg" viewBox="0 0 ' + sz.w.toFixed(0) + " " + sz.h.toFixed(0) + '" width="' + w + '" role="img" aria-label="' + esc(o.label || "六角格作战地图") + '">';
  for (const id in hexes) {
    const h = hexes[id], c = hexCenter(h.q, h.r);
    s += '<polygon class="hex ' + h.t + '" points="' + hexPoints(c.x, c.y, HEX_S - 0.5) + '"/>';
    if (!o.noLabels) s += '<text class="hex-label" x="' + c.x.toFixed(1) + '" y="' + (c.y - HEX_S * 0.55).toFixed(1) + '" text-anchor="middle">' + id + "</text>";
  }
  // 目标
  if (p.scheme && !o.map) {
    const drawn = {};
    for (const ob of p.objectives.items) {
      const id = p.scheme.objHex[ob.id]; if (!id || drawn[id]) continue; drawn[id] = true;
      const h = hexes[id]; if (!h) continue; const c = hexCenter(h.q, h.r);
      const ctl = o.game ? o.game.control[id] : null;
      s += '<g class="obj-mark"><circle cx="' + c.x + '" cy="' + c.y + '" r="' + (HEX_S * 0.82) + '" fill="none" stroke="' + (ctl ? sideColor(ctl) : "var(--warn)") + '" stroke-width="2" stroke-dasharray="3 2"/>' +
        '<path d="' + starPath(c.x + HEX_S * 0.55, c.y - HEX_S * 0.5, 5) + '" style="fill:' + (ctl ? sideColor(ctl) : "var(--warn)") + '" stroke="var(--surface)" stroke-width="1"/></g>';
    }
  }
  if (o.reach) for (const id in o.reach) { const h = hexes[id]; const c = hexCenter(h.q, h.r); s += '<polygon class="reach" points="' + hexPoints(c.x, c.y, HEX_S - 3) + '"/>'; }
  if (o.targets) for (const id of o.targets) { const h = hexes[id]; const c = hexCenter(h.q, h.r); s += '<polygon class="target" points="' + hexPoints(c.x, c.y, HEX_S - 2) + '"/>'; }
  // 棋子
  const byHex = {};
  if (o.game) { for (const u of aliveUnits(o.game)) { if (!visibleTo(p, o.game, u, o.view)) continue; (byHex[u.hex] = byHex[u.hex] || []).push({ side: u.side, type: u.type, echelon: u.echelon, stats: u, steps: u.steps, max: u.maxSteps, id: u.id, spent: u.moved && u.attacked }); } }
  else if (p.scheme && !o.map) { for (const side of ["red", "blue"]) for (const u of p.forces[side].units) { const hx = p.scheme.placements[u.id]; if (!hx) continue; const st = unitStats(u); (byHex[hx] = byHex[hx] || []).push({ side, type: u.type, echelon: u.echelon, stats: st, steps: st.steps, max: st.steps, id: u.id }); } }
  for (const id in byHex) {
    const h = hexes[id]; if (!h) continue; const c = hexCenter(h.q, h.r); const list = byHex[id];
    list.forEach((u, i) => {
      const off = (list.length - 1 - i) * 3;
      s += '<g class="counter' + (o.sel === u.id ? " sel" : "") + (u.spent ? " spent" : "") + '" transform="translate(' + (c.x - 15 - off).toFixed(1) + "," + (c.y - 10 - off).toFixed(1) + ')">' + counterInner(u.side, u.type, u.echelon, u.stats, u.steps, u.max) + "</g>";
    });
  }
  if (o.fogSide && o.game && p.rules.fog === "双盲") {
    // 迷雾：己方侦察范围外加暗
    const own = aliveUnits(o.game, o.fogSide);
    for (const id in hexes) { if (!own.some(x => hexDist(x.hex, id) <= 2)) { const h = hexes[id], c = hexCenter(h.q, h.r); s += '<polygon class="fogged" points="' + hexPoints(c.x, c.y, HEX_S - 0.5) + '"/>'; } }
  }
  if (o.interactive) for (const id in hexes) { const h = hexes[id], c = hexCenter(h.q, h.r); s += '<polygon class="hex-hit" data-act="hex" data-hex="' + id + '" points="' + hexPoints(c.x, c.y, HEX_S - 0.5) + '"><title>' + id + " " + TERRAIN[h.t].name + "</title></polygon>"; }
  return s + "</svg>";
}
function terrainLegend(map) {
  const used = new Set(Object.values(map.hexes).map(h => h.t));
  return '<div class="legend-row">' + Object.keys(TERRAIN).filter(k => used.has(k)).map(k => '<span><i class="hex ' + k + '" style="fill:none;background:var(--t-' + k + ')"></i>' + TERRAIN[k].name + "</span>").join("") +
    '<span><svg width="14" height="14" aria-hidden="true"><path d="' + starPath(7, 7, 6) + '" style="fill:var(--warn)"/></svg>推演目标</span></div>';
}

/* ---------------- 折线图（带悬停提示） ---------------- */
function lineChart(id, xs, series, yLabel) {
  const W = 560, H = 210, L = 36, R = 14, T = 14, B = 26;
  const maxY = Math.max(1, ...series.flatMap(s => s.values)); const niceMax = Math.ceil(maxY / 5) * 5 || 5;
  const x = i => L + (xs.length <= 1 ? 0 : (W - L - R) * i / (xs.length - 1));
  const y = v => T + (H - T - B) * (1 - v / niceMax);
  CHARTS[id] = { xs, series, x, W, H, L, R, T, B };
  let s = '<div class="chart-box" id="' + id + '"><svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(yLabel) + '">';
  for (let k = 0; k <= 5; k++) { const v = niceMax * k / 5, yy = y(v); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line-2)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + round1(v) + "</text>"; }
  xs.forEach((lab, i) => { if (xs.length > 12 && i % 2) return; s += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lab) + "</text>"; });
  for (const se of series) {
    const pts = se.values.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
    s += '<polyline points="' + pts + '" fill="none" style="stroke:' + se.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    const li = se.values.length - 1;
    if (li >= 0) s += '<circle cx="' + x(li) + '" cy="' + y(se.values[li]) + '" r="4" style="fill:' + se.color + '" stroke="var(--surface)" stroke-width="2"/><text x="' + (x(li) - 6) + '" y="' + (y(se.values[li]) - 8) + '" text-anchor="end" style="fill:var(--ink-2)">' + esc(se.name) + " " + se.values[li] + "</text>";
  }
  s += '<line class="xhair" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>';
  s += '<rect class="chart-hit" data-chart="' + id + '" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent"/>';
  s += '</svg><div class="chart-tip" hidden></div></div>';
  s += '<div class="legend-row" style="margin-top:6px">' + series.map(se => '<span><i style="background:' + se.color + ';height:3px;border:0"></i>' + esc(se.name) + "</span>").join("") + "</div>";
  return s;
}
document.addEventListener("pointermove", e => {
  const hit = e.target.closest && e.target.closest(".chart-hit");
  document.querySelectorAll(".chart-box").forEach(box => { if (!hit || !box.contains(hit)) { const t = box.querySelector(".chart-tip"); if (t) t.hidden = true; const xh = box.querySelector(".xhair"); if (xh) xh.setAttribute("visibility", "hidden"); } });
  if (!hit) return;
  const c = CHARTS[hit.dataset.chart]; if (!c) return;
  const svg = hit.ownerSVGElement, r = svg.getBoundingClientRect();
  const vx = (e.clientX - r.left) / r.width * c.W;
  const n = c.xs.length; const i = clamp(Math.round((vx - c.L) / ((c.W - c.L - c.R) / Math.max(1, n - 1))), 0, n - 1);
  const box = svg.parentNode, tip = box.querySelector(".chart-tip"), xh = box.querySelector(".xhair");
  xh.setAttribute("x1", c.x(i)); xh.setAttribute("x2", c.x(i)); xh.setAttribute("visibility", "visible");
  tip.hidden = false;
  tip.innerHTML = "<b>" + esc(c.xs[i]) + "</b><br>" + c.series.map(s => '<span class="dot" style="background:' + s.color + '"></span> ' + esc(s.name) + "：" + s.values[i]).join("<br>");
  const px = c.x(i) / c.W * r.width;
  tip.style.left = Math.min(px + 10, r.width - 140) + "px"; tip.style.top = "8px";
});

/* ============================================================
 * 外壳渲染
 * ============================================================ */
function render() {
  const p = proj();
  if (!p && S.view !== "home") S.view = "home";
  document.getElementById("crumb").innerHTML = p && S.view !== "home" ? '<span>/</span><b>' + esc(p.name) + "</b>" + (p.sample ? ' <span class="sample-tag">示例</span>' : "") : "";
  renderRail();
  renderMain();
  renderSaveState();
}
function renderRail() {
  const p = proj(), rail = document.getElementById("rail");
  if (!p || S.view === "home") {
    rail.innerHTML = '<div class="rail-label">工作流程</div><ol class="steps">' + STEPS.map((s, i) => '<li><div class="step-btn" style="cursor:default"><span class="step-no">' + (i + 1) + '</span><span class="step-title">' + s.title + "<small>" + s.sub + "</small></span></div></li>").join("") + "</ol>" +
      '<div class="rail-foot"><button class="btn ghost" data-act="glossary">术语速查</button></div>';
    return;
  }
  rail.innerHTML = '<div class="rail-label">设计步骤</div><ol class="steps">' + STEPS.map((s, i) => {
    const done = stepDone(p, s.key); const stale = s.key === "scheme" && isStale(p);
    return '<li><button class="step-btn' + (done ? " done" : "") + '" data-act="go" data-view="' + s.key + '"' + (S.view === s.key ? ' aria-current="step"' : "") + '><span class="step-no">' + (done ? "✓" : i + 1) + '</span><span class="step-title">' + s.title + "<small>" + s.sub + "</small></span>" + (stale ? '<span class="step-flag">待更新</span>' : "<span></span>") + "</button></li>";
  }).join("") + "</ol>" +
    '<div class="rail-foot"><button class="btn ghost" data-act="glossary">术语速查</button><button class="btn ghost" data-act="exportJSON">导出项目 JSON</button><button class="btn ghost" data-act="go" data-view="home">全部项目</button></div>';
}
function renderMain() {
  const main = document.getElementById("main-inner");
  const p = proj();
  const V = { home: viewHome, scenario: viewScenario, forces: viewForces, objectives: viewObjectives, rules: viewRules, scheme: viewScheme, play: viewPlay }[S.view] || viewHome;
  main.innerHTML = V(p);
  document.body.classList.toggle("ai-on", !!SAMPLE);
  if (S.view === "play" && S.ui.scrollMap) { const mw = document.querySelector(".map-wrap"); if (mw) { mw.scrollLeft = S.ui.scrollMap[0]; mw.scrollTop = S.ui.scrollMap[1]; } }
}
function refreshAux() {
  renderRail();
  const p = proj(); if (!p) return;
  if (S.view === "scenario") { const el = document.getElementById("scn-side"); if (el) el.innerHTML = scenarioSide(p); const c = document.getElementById("bg-count"); if (c) c.textContent = (p.scenario.background || "").length + " 字"; }
  if (S.view === "forces") { const el = document.getElementById("force-summary"); if (el) el.innerHTML = forceSummary(p); }
  if (S.view === "rules") { const el = document.getElementById("dice-probs"); if (el) el.innerHTML = diceProbs(p); }
  document.getElementById("crumb").innerHTML = S.view !== "home" ? '<span>/</span><b>' + esc(p.name) + "</b>" + (p.sample ? ' <span class="sample-tag">示例</span>' : "") : "";
}
function pageHead(i, title, lede, actions) {
  return '<div class="page-head"><div><div class="eyebrow">第 ' + (i + 1) + " 步 / 共 6 步</div><h1>" + title + '</h1><p class="lede">' + lede + "</p></div>" + (actions ? '<div class="btn-row">' + actions + "</div>" : "") + "</div>";
}
function guide(title, body, list) {
  return '<div class="guide"><div class="guide-icon" aria-hidden="true">?</div><div><h4>' + title + "</h4><p>" + body + "</p>" + (list ? "<ul>" + list.map(x => "<li>" + x + "</li>").join("") + "</ul>" : "") + "</div></div>";
}
function stepNav(i) {
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return '<div class="btn-row" style="justify-content:space-between">' + (prev ? '<button class="btn" data-act="go" data-view="' + prev.key + '">← ' + prev.title + "</button>" : "<span></span>") + (next ? '<button class="btn primary" data-act="go" data-view="' + next.key + '">下一步：' + next.title + " →</button>" : "") + "</div>";
}

/* ---------------- 首页 ---------------- */
function viewHome() {
  const demo = S.projects.find(p => p.scheme);
  const cards = S.projects.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).map(p => {
    const prog = STEPS.map(s => '<i class="' + (stepDone(p, s.key) ? "on" : "") + '"></i>').join("");
    const nDone = STEPS.filter(s => stepDone(p, s.key)).length;
    const status = p.game && p.game.ended ? '<span class="pill ok">已复盘</span>' : p.game ? '<span class="pill accent">推演中 · 第 ' + p.game.turn + " 回合</span>" : p.scheme ? '<span class="pill accent">方案 v' + p.scheme.version + "</span>" : '<span class="pill">设计中 ' + nDone + "/6</span>";
    return '<div class="proj-card" role="button" tabindex="0" data-act="open" data-id="' + p.id + '">' +
      '<div class="proj-meta">' + status + '<span class="pill">' + esc(p.scenario.level) + "</span>" + (p.sample ? '<span class="sample-tag">示例</span>' : "") + "</div>" +
      "<h3>" + esc(p.name) + '</h3><p class="muted small">' + esc((p.scenario.background || "尚未填写想定背景。").slice(0, 72)) + ((p.scenario.background || "").length > 72 ? "…" : "") + "</p>" +
      '<div class="proj-meta"><span class="pill red"><span class="dot red"></span>' + p.forces.red.units.length + ' 个部队</span><span class="pill blue"><span class="dot blue"></span>' + p.forces.blue.units.length + " 个部队</span><span class=\"pill\">" + p.objectives.items.length + " 项目标</span></div>" +
      '<div class="proj-progress" aria-label="完成 ' + nDone + ' / 6 步">' + prog + "</div>" +
      '<div class="proj-foot"><span>更新于 ' + fmtTime(p.updatedAt) + '</span><span class="btn-row"><button class="btn small ghost" data-act="dup" data-id="' + p.id + '">复制</button><button class="btn small ghost danger" data-act="askDelete" data-id="' + p.id + '">删除</button></span></div></div>';
  }).join("");
  return '<section class="hero"><div><div class="eyebrow">兵棋设计助手</div><h1>把作战构想<br>变成可以推演的兵棋</h1>' +
    '<p class="lede">你熟悉作战，但不一定熟悉兵棋设计。按六个步骤填写场景、兵力、目标和规则，平台会生成地图、棋子、战斗结果表、事件卡和平衡性评估，并直接进入人工推演与复盘。</p>' +
    '<div class="btn-row" style="margin-top:18px"><button class="btn primary" data-act="newProject">新建项目</button><label class="btn" for="import-file">导入项目 JSON</label><input id="import-file" type="file" accept=".json,application/json" hidden><button class="btn ghost" data-act="glossary">什么是兵棋？</button></div></div>' +
    "<div>" + (demo ? mapSVG(demo, { fluid: true, noLabels: true, label: "示例地图：" + demo.name }) : "") +
    '<div class="hero-flow" style="margin-top:12px">' + STEPS.map((s, i) => '<div><span class="mono">' + pad2(i + 1) + "</span><span><b>" + s.title + '</b> <span class="muted">' + s.sub + "</span></span></div>").join("") + "</div></div></section>" +
    '<section class="stack"><div class="panel-head" style="margin:0"><div><h2>我的项目</h2><p>项目自动保存在当前浏览器。需要换设备或分享时，导出 JSON。</p></div></div><div class="proj-grid">' + cards + "</div></section>";
}

/* ---------------- 第 1 步：场景 ---------------- */
function viewScenario(p) {
  const sc = p.scenario;
  return pageHead(0, "作战场景", "描述推演发生的时间、地点和环境。这些信息决定地图的样子和每一回合代表多长时间。") +
    guide("这一步在做什么", "兵棋需要一个“" + term("想定") + "”作为起点。你只需像写作战背景一样描述情况，平台会把地形转换为" + term("六角格") + "地图，把时间转换为" + term("回合") + "。", ["层级决定尺度：战术级每格 1 公里、每回合 2 小时；战役级每格约 10 公里、每回合 12 小时。", "地名、番号请使用虚构名称，避免泄露真实部署。"]) +
    '<div class="grid-2" style="align-items:start"><div class="panel stack">' +
    '<div class="field"><label for="f-title">想定名称</label><input id="f-title" class="input" data-bind="scenario.title" value="' + esc(sc.title) + '" placeholder="例如：“海棠-26”滨海要地防御推演"></div>' +
    '<div class="field"><span class="label">推演层级</span><div class="seg">' + Object.keys(LEVELS).map(k => '<button data-act="setLevel" data-val="' + k + '" aria-pressed="' + (sc.level === k) + '">' + k + "级</button>").join("") + '</div><span class="hint">' + LEVELS[sc.level].desc + '。<button class="btn small ghost" data-act="applyLevel">按此层级推荐填入时空参数</button></span></div>' +
    '<div class="field"><span class="label">哪一方主动进攻？</span><div class="seg"><button data-act="set" data-path="scenario.attacker" data-val="red" aria-pressed="' + (sc.attacker === "red") + '">红方进攻 / 蓝方防御</button><button data-act="set" data-path="scenario.attacker" data-val="blue" aria-pressed="' + (sc.attacker === "blue") + '">蓝方进攻 / 红方防御</button></div><span class="hint">决定地图上谁守目标、谁从边缘出发。遭遇战也请指定先发起行动的一方。</span></div>' +
    '<div class="grid-3"><div class="field"><label for="f-dtg">开始时间</label><input id="f-dtg" class="input mono" data-bind="scenario.startDTG" value="' + esc(sc.startDTG) + '"></div>' +
    '<div class="field"><label for="f-turns">回合数</label><input id="f-turns" type="number" min="2" max="30" class="input mono" data-bind="scenario.turns" value="' + sc.turns + '"></div>' +
    '<div class="field"><label for="f-hpt">每回合（小时）</label><input id="f-hpt" type="number" min="0.5" step="0.5" class="input mono" data-bind="scenario.hoursPerTurn" value="' + sc.hoursPerTurn + '"></div></div>' +
    '<div class="grid-3"><div class="field"><label for="f-km">每格（公里）</label><input id="f-km" type="number" min="0.1" step="0.5" class="input mono" data-bind="scenario.kmPerHex" value="' + sc.kmPerHex + '"></div>' +
    '<div class="field"><label for="f-cols">地图列数</label><input id="f-cols" type="number" min="8" max="30" class="input mono" data-bind="scenario.cols" value="' + sc.cols + '"></div>' +
    '<div class="field"><label for="f-rows">地图行数</label><input id="f-rows" type="number" min="6" max="22" class="input mono" data-bind="scenario.rows" value="' + sc.rows + '"></div></div>' +
    '<div class="field"><span class="label">作战地域地形（可多选）</span><div class="chips">' + TERRAIN_OPTIONS.map(t => '<button class="chip" data-act="toggle" data-path="scenario.terrain" data-val="' + t.key + '" aria-pressed="' + sc.terrain.includes(t.key) + '">' + t.key + "</button>").join("") + '</div><span class="hint">选“海岸”会在地图北侧生成海域；“岛屿”南北两侧都是海。</span></div>' +
    '<div class="grid-2"><div class="field"><label for="f-wx">天候</label><select id="f-wx" class="input" data-bind="scenario.weather">' + WEATHER.map(w => opt(w, w, sc.weather)).join("") + "</select></div>" +
    '<div class="field"><label for="f-em">电磁环境</label><select id="f-em" class="input" data-bind="scenario.em">' + EM_ENV.map(w => opt(w, w, sc.em)).join("") + "</select></div></div>" +
    '<div class="field"><label for="f-bg">想定背景 <span class="muted small" id="bg-count">' + (sc.background || "").length + ' 字</span></label><textarea id="f-bg" class="input" rows="7" data-bind="scenario.background" placeholder="写清楚：起因、地域特点、时间、双方态势、可用增援……">' + esc(sc.background) + "</textarea>" +
    '<div class="btn-row ai-only"><button class="btn small" id="ai-bg-btn" data-act="aiBackground">请 Claude 起草背景</button><span class="hint">根据上面的名称、地形、天候和攻防关系生成虚构背景，可再修改。</span></div></div>' +
    '</div><div class="panel stack" id="scn-side">' + scenarioSide(p) + "</div></div>" + stepNav(0);
}
function scenarioSide(p) {
  const sc = p.scenario;
  const map = genMap(sc, hashStr(p.id + "preview"));
  const km = +sc.kmPerHex || 1, h = +sc.hoursPerTurn || 1;
  const armorKm = UNIT_TYPES.armor.mv * km, infKm = UNIT_TYPES.inf.mv * km;
  const speedNote = armorKm / h > 12 ? "装甲部队每小时推进超过 12 公里，偏快，可增大每回合时长或减小每格距离" : armorKm / h < 1 ? "机动速度偏慢，推演节奏会拖沓，可缩短每回合时长" : "机动速度在合理范围";
  return '<div class="panel-head" style="margin:0"><div><h3>地图预览</h3><p>按所选地形随机生成，正式地图在“兵棋方案”中生成。</p></div></div>' + mapSVG(p, { map, fluid: true, label: "地图预览" }) + terrainLegend(map) +
    '<dl class="kv"><div><dt>地图覆盖</dt><dd class="mono">' + round1(map.cols * km * 1.5 * 0.577 * 2) + " × " + round1(map.rows * km) + ' km</dd></div><div><dt>推演总时长</dt><dd class="mono">' + round1(sc.turns * h) + ' 小时</dd></div><div><dt>装甲营每回合</dt><dd class="mono">≤ ' + armorKm + ' km</dd></div><div><dt>步兵营每回合</dt><dd class="mono">≤ ' + infKm + " km</dd></div></dl>" +
    '<p class="small ' + (speedNote.includes("合理") ? "muted" : "") + '" style="' + (speedNote.includes("合理") ? "" : "color:var(--warn)") + '">时空换算检查：' + speedNote + "。</p>";
}

/* ---------------- 第 2 步：力量 ---------------- */
function viewForces(p) {
  const side = s => {
    const f = p.forces[s];
    return '<div class="panel side-panel ' + s + ' stack"><div class="panel-head" style="margin:0"><div><h2 style="color:' + sideColor(s) + '">' + SIDES[s] + "</h2><p>" + (p.scenario.attacker === s ? "进攻方 · 从地图" + (s === "blue" ? "西" : "东") + "侧出发" : "防御方 · 部署在目标附近") + "</p></div></div>" +
      '<div class="grid-2"><div class="field"><label for="fn-' + s + '">力量名称</label><input id="fn-' + s + '" class="input" data-bind="forces.' + s + '.name" value="' + esc(f.name) + '"></div>' +
      '<div class="field"><label for="fi-' + s + '">作战意图</label><input id="fi-' + s + '" class="input" data-bind="forces.' + s + '.intent" value="' + esc(f.intent) + '" placeholder="一句话说明想达成什么"></div></div>' +
      '<div><div class="unit-row unit-head"><span></span><span>部队名称</span><span>兵种</span><span class="u-ech">梯队</span><span class="u-ready">战备%</span><span class="u-hex">位置</span><span></span></div>' +
      (f.units.length ? f.units.map((u, i) => '<div class="unit-row">' + miniCounter(s, u) +
        '<input class="input" aria-label="部队名称" data-bind="forces.' + s + ".units." + i + '.name" value="' + esc(u.name) + '">' +
        '<select class="input" aria-label="兵种" data-bind="forces.' + s + ".units." + i + '.type" data-rerender="1">' + Object.entries(UNIT_TYPES).map(([k, t]) => opt(k, t.name, u.type)).join("") + "</select>" +
        '<select class="input u-ech" aria-label="梯队" data-bind="forces.' + s + ".units." + i + '.echelon" data-rerender="1">' + Object.entries(ECHELONS).map(([k, e]) => opt(k, e.name, u.echelon)).join("") + "</select>" +
        '<input class="input mono u-ready" type="number" min="30" max="100" aria-label="战备程度" data-bind="forces.' + s + ".units." + i + '.readiness" value="' + u.readiness + '">' +
        '<input class="input mono u-hex" aria-label="初始位置格号" placeholder="自动" maxlength="4" data-bind="forces.' + s + ".units." + i + '.hex" value="' + esc(u.hex) + '">' +
        '<button class="btn small ghost" aria-label="删除 ' + esc(u.name) + '" data-act="delUnit" data-side="' + s + '" data-i="' + i + '">✕</button></div>').join("") : '<div class="empty">还没有部队。从下方选择兵种添加。</div>') + "</div>" +
      '<div class="btn-row"><select class="input" style="width:auto" id="add-' + s + '" data-add-unit="' + s + '"><option value="">＋ 添加部队…</option>' + Object.entries(UNIT_TYPES).map(([k, t]) => opt(k, t.name, "")).join("") + "</select></div></div>";
  };
  return pageHead(1, "参演力量", "为红蓝双方编成参演部队。每个部队就是地图上的一枚棋子。") +
    guide("怎样把部队变成棋子", "平台根据兵种和梯队自动计算棋子的攻击力、防御力、机动力和" + term("战斗步") + "。棋子下方的三个数字依次是 攻-防-机动。", ["粒度建议：每方 5–12 个棋子最适合人工推演。战役级以营、旅为单位，战术级以连、营为单位。", "战备程度会按比例折算攻防值，用来体现齐装率、训练水平或疲劳。", "位置可以留空，由平台按攻防关系自动部署；也可以填写格号（如 0806）。"]) +
    '<div class="panel" id="force-summary">' + forceSummary(p) + "</div>" +
    '<div class="side-grid">' + side("red") + side("blue") + "</div>" +
    '<div class="panel stack"><div class="panel-head" style="margin:0"><div><h3>白方（导调裁判组）</h3><p>负责裁决战果、注入事件、控制节奏。采用专家裁决时必须设置。</p></div>' +
    '<label class="btn-row"><input type="checkbox" data-bind="forces.white.enabled"' + (p.forces.white.enabled ? " checked" : "") + '> 设置白方</label></div>' +
    '<div class="field" style="max-width:360px"><label for="fw-name">白方名称</label><input id="fw-name" class="input" data-bind="forces.white.name" value="' + esc(p.forces.white.name) + '"></div></div>' +
    '<details class="panel"><summary><b>兵种参数说明</b> <span class="muted small">（营级、战备 100% 时的基础值）</span></summary><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>兵种</th><th class="num">攻</th><th class="num">防</th><th class="num">机动</th><th class="num">射程</th><th>推演特点</th></tr></thead><tbody>' +
    Object.values(UNIT_TYPES).map(t => "<tr><td>" + t.name + '</td><td class="num">' + t.atk + '</td><td class="num">' + t.def + '</td><td class="num">' + t.mv + '</td><td class="num">' + t.rng + "</td><td>" + t.note + "</td></tr>").join("") +
    "</tbody></table></div><p class=\"small muted\" style=\"margin-top:8px\">梯队系数：连 ×0.5（1 步）、营 ×1（2 步）、旅 ×2（3 步）、师 ×4（4 步）。</p></details>" + stepNav(1);
}
function forceSummary(p) {
  const att = p.scenario.attacker, def = other(att);
  const r = sideTotals(p.forces.red.units), b = sideTotals(p.forces.blue.units);
  const A = att === "red" ? r : b, D = att === "red" ? b : r;
  const ratio = A.atk / Math.max(0.1, D.def);
  const tot = r.atk + b.atk || 1;
  const verdict = !A.n || !D.n ? "双方都需要至少一个部队。" : ratio < 1 ? "进攻方兵力明显不足，进攻大概率受挫。可以增加进攻兵力，或把推演目标改为“迟滞”“消耗”。" : ratio < 2 ? "进攻方略占优势。考虑到防御方的地形加成，推演会比较胶着，适合检验指挥决策。" : ratio < 3.5 ? "进攻方优势明显，接近传统“3:1”进攻门槛。防御方需要依托地形和预备队。" : "进攻方占压倒性优势，推演可能一边倒。建议加强防御方或给防御方更有利的目标分值。";
  return '<div class="panel-head" style="margin:0 0 10px"><div><h3>' + term("兵力比") + "对比</h3><p>" + verdict + '</p></div><div class="odds">' + (A.n && D.n ? ratio.toFixed(2) + " : 1" : "—") + '<div class="small muted" style="font-weight:400;font-family:var(--font-body)">' + SIDES[att] + "攻击力 ÷ " + SIDES[def] + "防御力</div></div></div>" +
    '<div class="ratio-bar" role="img" aria-label="攻击力占比 红 ' + r.atk + " 蓝 " + b.atk + '"><div style="width:' + (r.atk / tot * 100) + '%;background:var(--red)"></div><div style="width:' + (b.atk / tot * 100) + '%;background:var(--blue)"></div></div>' +
    '<div class="ratio-legend mono"><span style="color:var(--red)">红 攻 ' + r.atk + " · 防 " + r.def + " · " + r.steps + ' 步</span><span style="color:var(--blue)">蓝 攻 ' + b.atk + " · 防 " + b.def + " · " + b.steps + " 步</span></div>";
}

/* ---------------- 第 3 步：目标 ---------------- */
function viewObjectives(p) {
  const o = p.objectives;
  const rows = o.items.map((it, i) => '<div class="obj-row">' +
    '<select class="input" aria-label="所属方" data-bind="objectives.items.' + i + '.side" data-rerender="1">' + opt("red", "红方", it.side) + opt("blue", "蓝方", it.side) + "</select>" +
    '<input class="input" aria-label="目标名称" data-bind="objectives.items.' + i + '.title" value="' + esc(it.title) + '">' +
    '<select class="input o-extra" aria-label="目标类型" data-bind="objectives.items.' + i + '.kind" data-rerender="1">' + Object.entries(OBJ_KINDS).map(([k, v]) => opt(k, v.name, it.kind)).join("") + "</select>" +
    '<input class="input mono o-extra" aria-label="目标格号" maxlength="4" placeholder="' + ((it.kind === "hold" || it.kind === "defend") ? "自动" : "—") + '"' + ((it.kind === "hold" || it.kind === "defend") ? "" : " disabled") + ' data-bind="objectives.items.' + i + '.hex" value="' + esc(it.hex) + '">' +
    '<input class="input mono o-extra" type="number" min="0" aria-label="分值" data-bind="objectives.items.' + i + '.vp" value="' + it.vp + '">' +
    '<input class="input mono o-extra" type="number" min="1" aria-label="截止回合" ' + (it.kind === "defend" ? "" : "disabled ") + 'data-bind="objectives.items.' + i + '.turn" value="' + (it.kind === "defend" ? it.turn : "") + '" placeholder="—">' +
    '<button class="btn small ghost" aria-label="删除目标" data-act="delObj" data-i="' + i + '">✕</button></div>').join("");
  return pageHead(2, "推演目标", "说明为什么要推演，以及双方各自要达成什么。目标会转化为" + term("胜利点") + "，用来判定胜负。") +
    guide("推演目的 ≠ 作战目标", "“推演目的”是组织者想通过这次推演回答的问题；“推演目标”是红蓝双方在棋盘上争夺的东西。好的兵棋让双方的目标互相冲突，这样才会有真正的对抗。", ["夺控要点：每回合结束时控制该格即得分，鼓励尽早争夺。", "坚守至时限：只在指定回合检查，适合“守住 X 小时”的任务。", "歼灭敌军：按歼敌战斗步计分，体现消耗。保存实力：终局损失低于 30% 得分。"]) +
    '<div class="panel stack"><div class="field"><span class="label">推演目的（可多选）</span><div class="chips">' + PURPOSES.map(x => '<button class="chip" data-act="toggle" data-path="objectives.purposes" data-val="' + x + '" aria-pressed="' + o.purposes.includes(x) + '">' + x + "</button>").join("") + "</div></div>" +
    '<div class="field"><label for="f-q">研究问题</label><textarea id="f-q" class="input" rows="4" data-bind="objectives.questions" placeholder="推演结束后希望回答的 2–3 个问题">' + esc(o.questions) + "</textarea><span class=\"hint\">复盘时会逐条对照这些问题。</span></div></div>" +
    '<div class="panel stack"><div class="panel-head" style="margin:0"><div><h3>双方目标与计分</h3><p>格号留空时，平台会把地理目标放在防御方一侧的城镇或高地上。同名目标会落在同一格。</p></div></div>' +
    '<div><div class="obj-row unit-head"><span>所属方</span><span>目标</span><span class="o-extra">类型</span><span class="o-extra">格号</span><span class="o-extra">分值</span><span class="o-extra">截止回合</span><span></span></div>' + (rows || '<div class="empty">还没有目标。</div>') + "</div>" +
    '<div class="btn-row"><button class="btn" data-act="addObj" data-side="red"><span class="dot red"></span> 添加红方目标</button><button class="btn" data-act="addObj" data-side="blue"><span class="dot blue"></span> 添加蓝方目标</button></div></div>' +
    '<div class="panel"><h3 style="margin-bottom:8px">胜负怎样判定</h3><p class="muted" style="max-width:70ch">推演结束时（第 ' + p.scenario.turns + " 回合后，或一方全部部队丧失战斗力）比较双方累计胜利点，分高者获胜。按当前设置，" + ["red", "blue"].map(s => SIDES[s] + "每回合最多可通过夺控获得 " + o.items.filter(x => x.side === s && x.kind === "hold").reduce((a, x) => a + (+x.vp || 0), 0) + " 分").join("，") + "。</p></div>" + stepNav(2);
}

/* ---------------- 第 4 步：规则 ---------------- */
function recommendRules(p) {
  const lv = p.scenario.level;
  return {
    dice: lv === "战术" ? "1d6" : "2d6",
    fog: p.objectives.purposes.includes("训练指挥员决策") ? "双盲" : "开放",
    adjudication: p.forces.white.enabled && p.objectives.purposes.includes("检验作战方案") ? "混合" : "CRT",
    events: p.scenario.em === "强对抗" || ["雨", "大雾", "雪", "大风/高海况"].includes(p.scenario.weather) ? "高" : "中",
  };
}
function diceProbs(p) {
  const pr = resultProbabilities(5, p.rules.dice);
  return '<div class="small muted" style="margin-bottom:6px">以 3:1 栏为例，各结果出现的概率：</div><div class="table-wrap"><table><thead><tr>' + RESULT_ORDER.map(k => '<th class="num">' + k + "</th>").join("") + "</tr></thead><tbody><tr>" + RESULT_ORDER.map(k => '<td class="num">' + (pr[k] ? Math.round(pr[k] * 100) + "%" : "—") + "</td>").join("") + "</tr></tbody></table></div>";
}
function viewRules(p) {
  const r = p.rules, rec = recommendRules(p);
  const seg = (path, opts, cur, recv) => '<div class="seg">' + opts.map(([v, l]) => '<button data-act="set" data-path="' + path + '" data-val="' + v + '" aria-pressed="' + (cur === v) + '">' + l + (recv === v ? " ·荐" : "") + "</button>").join("") + "</div>";
  const tog = (path, title, desc) => '<label class="check" style="grid-template-columns:22px 1fr;cursor:pointer"><input type="checkbox" data-bind="' + path + '"' + (getPath(p, path) ? " checked" : "") + '><span><b>' + title + '</b><br><span class="muted">' + desc + "</span></span></label>";
  const crt = buildCRT();
  return pageHead(3, "规则设置", "规则决定一回合里做什么、战斗结果怎样裁决。不熟悉时直接采用推荐值即可。", '<button class="btn" data-act="applyRec">全部采用推荐</button>') +
    guide("为什么需要规则", "兵棋用规则代替实战中的物理过程。规则越简单，推演越快；规则越细，越接近现实但越慢。平台默认采用经典的“" + term("战斗结果表（CRT）") + "”裁决：先算" + term("兵力比") + "，再掷骰查表。", ["标“荐”的选项是根据你的场景和推演目的给出的推荐。", "骰子只代表不确定性：3:1 兵力比进攻也可能失败，这正是需要复盘的地方。"]) +
    '<div class="grid-2" style="align-items:start"><div class="panel stack"><div class="panel-head" style="margin:0"><div><h3>回合流程</h3><p>每个回合按此顺序执行。可以调整红蓝行动先后。</p></div></div><ol class="phase-list">' +
    r.phases.map((ph, i) => '<li class="phase-item"><span class="mono">' + pad2(i + 1) + "</span><span><span class=\"dot " + ph.side + '"></span> ' + ph.name + ' <span class="muted small">' + ({ admin: "通报态势、公布事件", move: "移动部队", combat: "发起攻击并裁决", event: "抽取事件卡、计分" }[ph.kind]) + '</span></span><span class="btn-row"><button class="btn small ghost" aria-label="上移" data-act="phaseUp" data-i="' + i + '"' + (i === 0 ? " disabled" : "") + '>↑</button><button class="btn small ghost" aria-label="下移" data-act="phaseDown" data-i="' + i + '"' + (i === r.phases.length - 1 ? " disabled" : "") + ">↓</button></span></li>").join("") +
    '</ol><button class="btn small" data-act="swapSides">红蓝行动顺序对调</button></div>' +
    '<div class="panel stack"><div class="field"><span class="label">裁决方式</span>' + seg("rules.adjudication", [["CRT", "查表裁决"], ["混合", "查表 + 白方改判"], ["专家", "白方专家裁决"]], r.adjudication, rec.adjudication) + '<span class="hint">查表最快最公平；混合模式下白方可以在特殊情况下推翻查表结果；专家裁决依赖白方经验。</span></div>' +
    '<div class="field"><span class="label">骰子</span>' + seg("rules.dice", [["1d6", "1 枚六面骰"], ["2d6", "2 枚六面骰"]], r.dice, rec.dice) + '<span class="hint">2 枚骰子结果更集中于中间，极端结果更少。</span></div><div id="dice-probs">' + diceProbs(p) + "</div>" +
    '<div class="field"><span class="label">信息条件</span>' + seg("rules.fog", [["开放", "开放推演"], ["双盲", "双盲推演"]], r.fog, rec.fog) + '<span class="hint">双盲时，每方只能看到己方部队 2 格（航空兵 3 格）内的敌军。</span></div>' +
    '<div class="field"><span class="label">事件频率</span>' + seg("rules.events", [["低", "低 20%"], ["中", "中 40%"], ["高", "高 65%"]], r.events, rec.events) + '<span class="hint">每回合“裁决与事件”阶段抽取事件卡的概率。</span></div>' +
    '<div class="field" style="max-width:220px"><label for="f-stack">每格最多堆叠部队数</label><input id="f-stack" class="input mono" type="number" min="1" max="6" data-bind="rules.stacking" value="' + r.stacking + '"></div></div></div>' +
    '<div class="panel"><h3 style="margin-bottom:6px">附加规则</h3><div>' +
    tog("rules.zoc", term("控制区（ZOC）"), "进入敌方地面部队相邻格必须停止机动。特战、航空兵、陆航不受限。") +
    tog("rules.supply", "补给", "距己方后勤部队超过 6 格且不在己方出发边缘的地面部队，攻击力减半。") +
    tog("rules.command", "指挥控制", "主攻部队在己方指挥所 4 格外时，战斗降一栏。") +
    tog("rules.airWeather", "天候影响航空", "“天候转坏”事件发生后，航空兵和陆航停飞一回合。") +
    "</div></div>" +
    '<div class="panel"><div class="panel-head" style="margin:0 0 10px"><div><h3>' + term("战斗结果表（CRT）") + "</h3><p>行是骰点，列是兵力比。颜色偏红表示对进攻方不利，偏蓝表示对防御方不利。</p></div></div>" + crtTable(crt) + "</div>" +
    '<div class="btn-row" style="justify-content:space-between"><button class="btn" data-act="go" data-view="objectives">← 推演目标</button><button class="btn primary" data-act="confirmRules">采用这些规则，去生成方案 →</button></div>';
}
function crtTable(crt) {
  return '<div class="table-wrap"><table class="crt"><thead><tr><th>骰点</th>' + ODDS_COLS.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" +
    [0, 1, 2, 3, 4, 5].map(d => '<tr><th class="mono">' + (d + 1) + "</th>" + crt.map(col => { const r = col[d]; const g = RESULTS[r].good; return '<td class="' + (g === "d" ? "r-a" : g === "a" ? "r-d" : "") + '" title="' + RESULTS[r].desc + '">' + r + "</td>"; }).join("") + "</tr>").join("") +
    '</tbody></table></div><p class="small muted" style="margin-top:8px">' + Object.entries(RESULTS).map(([k, v]) => '<span class="mono">' + k + "</span> " + v.desc).join("；") + "。</p>";
}

/* ---------------- 第 5 步：方案 ---------------- */
function viewScheme(p) {
  if (!p.scheme) {
    const checks = designChecks(p, null);
    const crit = checks.filter(c => c.lvl === "crit").length;
    return pageHead(4, "兵棋方案", "根据前四步的输入，生成地图、部署、裁决表、事件卡和平衡性评估。") +
      '<div class="panel stack"><h3>生成前检查</h3><div>' + checks.map(checkRow).join("") + '</div><div class="btn-row"><button class="btn primary" data-act="generate"' + (crit ? " disabled" : "") + ">生成兵棋方案</button>" + (crit ? '<span class="small" style="color:var(--crit)">请先处理标记为 ✕ 的问题</span>' : "") + "</div></div>";
  }
  const s = p.scheme, sc = p.scenario, b = s.balance;
  const toc = [["s-sum", "方案概要"], ["s-scn", "想定"], ["s-map", "地图与部署"], ["s-orbat", "兵力编成"], ["s-obj", "目标与胜负"], ["s-seq", "回合流程"], ["s-adj", "裁决规则"], ["s-evt", "事件卡"], ["s-bal", "平衡性评估"], ["s-chk", "设计检查"], ["s-ai", "AI 设计评审"]];
  const sec = (id, n, title, body) => '<section class="doc-sec" id="' + id + '"><h2><span class="mono">' + n + "</span>" + title + "</h2>" + body + "</section>";
  const orbat = side => '<h3 style="margin:6px 0 8px;color:' + sideColor(side) + '">' + esc(p.forces[side].name) + '</h3><p class="small muted" style="margin-bottom:8px">作战意图：' + esc(p.forces[side].intent || "—") + '</p><div class="table-wrap"><table><thead><tr><th></th><th>部队</th><th>兵种</th><th>梯队</th><th class="num">攻</th><th class="num">防</th><th class="num">机动</th><th class="num">射程</th><th class="num">战斗步</th><th class="num">位置</th></tr></thead><tbody>' +
    p.forces[side].units.map(u => { const st = unitStats(u); return "<tr><td>" + miniCounter(side, u) + "</td><td>" + esc(u.name) + "</td><td>" + UNIT_TYPES[u.type].name + "</td><td>" + ECHELONS[u.echelon].name + '</td><td class="num">' + st.atk + '</td><td class="num">' + st.def + '</td><td class="num">' + st.mv + '</td><td class="num">' + st.rng + '</td><td class="num">' + st.steps + '</td><td class="num">' + (s.placements[u.id] || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  const review = s.aiReview;
  return '<div class="page-head"><div><div class="eyebrow">第 5 步 / 共 6 步</div><h1>兵棋方案</h1><p class="lede">方案 v' + s.version + " · 生成于 " + fmtTime(s.generatedAt) + '。可以导出给参演人员预习，然后进入人工推演。</p></div><div class="btn-row"><button class="btn" data-act="generate">重新生成</button><button class="btn" data-act="newMap">换一张地图</button><button class="btn" data-act="exportMD">导出 Markdown</button><button class="btn primary" data-act="go" data-view="play">进入人工推演 →</button></div></div>' +
    (isStale(p) ? '<div class="guide" style="background:color-mix(in srgb,var(--warn) 16%,var(--surface))"><div class="guide-icon" style="background:var(--warn)">!</div><div><h4>输入已修改</h4><p>场景、兵力、目标或规则在生成后有变动，方案可能与当前设置不一致。<button class="btn small" data-act="generate">按当前设置重新生成</button>（保留地图）</p></div></div>' : "") +
    '<div class="doc"><nav class="toc" aria-label="方案目录">' + toc.map(([id, t], i) => '<a href="#' + id + '" data-act="scrollTo" data-id="' + id + '"><span class="mono muted">' + pad2(i + 1) + "</span> " + t + "</a>").join("") + '</nav><div class="doc-body">' +
    sec("s-sum", "01", "方案概要", '<div class="classif"><span>内部推演资料 · 虚构想定</span><span>方案 V' + s.version + " / 种子 " + s.mapSeed.toString(16).toUpperCase() + "</span></div><h3 style=\"font-size:20px;margin-bottom:12px\">" + esc(sc.title || p.name) + '</h3><dl class="kv">' +
      [["推演层级", sc.level + "级"], ["开始时间", sc.startDTG], ["回合", sc.turns + " × " + sc.hoursPerTurn + " 小时"], ["比例尺", "每格 " + sc.kmPerHex + " km"], ["地图", s.map.cols + " × " + s.map.rows + " 格"], ["进攻方", SIDES[sc.attacker]], ["天候 / 电磁", sc.weather + " / " + sc.em], ["裁决", p.rules.adjudication + " · " + p.rules.dice], ["信息条件", p.rules.fog], ["参演棋子", p.forces.red.units.length + " 红 / " + p.forces.blue.units.length + " 蓝"]].map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>").join("") + "</dl>") +
    sec("s-scn", "02", "想定", '<div class="prose"><p>' + esc(sc.background || "（未填写）").replace(/\n/g, "<br>") + '</p></div><div class="grid-2" style="margin-top:14px"><div><div class="eyebrow">推演目的</div><p>' + esc(p.objectives.purposes.join("、") || "—") + '</p></div><div><div class="eyebrow">研究问题</div><p class="small">' + esc(p.objectives.questions || "—").replace(/\n/g, "<br>") + "</p></div></div>") +
    sec("s-map", "03", "地图与部署", '<div class="map-wrap" style="max-height:none">' + mapSVG(p, { fluid: true, label: "作战地图与初始部署" }) + '</div><div style="margin-top:10px">' + terrainLegend(s.map) + '</div><p class="small muted" style="margin-top:6px">格号为四位数字：前两位是列，后两位是行。棋子下方数字为 攻-防-机动，右侧白点为剩余战斗步。</p>') +
    sec("s-orbat", "04", "兵力编成", orbat("red") + '<div style="height:14px"></div>' + orbat("blue")) +
    sec("s-obj", "05", "推演目标与胜负判定", '<div class="table-wrap"><table><thead><tr><th>方</th><th>目标</th><th>类型</th><th class="num">位置</th><th class="num">分值</th><th>计分规则</th></tr></thead><tbody>' +
      p.objectives.items.map(o => '<tr><td><span class="pill ' + o.side + '">' + SIDES[o.side] + "</span></td><td>" + esc(o.title) + "</td><td>" + OBJ_KINDS[o.kind].name + '</td><td class="num">' + (s.objHex[o.id] || "—") + '</td><td class="num">' + o.vp + "</td><td class=\"small\">" + OBJ_KINDS[o.kind].desc + (o.kind === "defend" ? "（第 " + o.turn + " 回合）" : "") + "</td></tr>").join("") +
      '</tbody></table></div><p class="small muted" style="margin-top:8px">终局比较累计胜利点；一方全部部队丧失战斗力时推演提前结束。初始时所有地理目标由防御方（' + SIDES[other(sc.attacker)] + "）控制。</p>") +
    sec("s-seq", "06", "回合流程", '<ol class="phase-list">' + p.rules.phases.map((ph, i) => '<li class="phase-item"><span class="mono">' + pad2(i + 1) + '</span><span><span class="dot ' + ph.side + '"></span> <b>' + ph.name + '</b> <span class="muted small">' + phaseGuide(ph) + "</span></span><span></span></li>").join("") + "</ol>") +
    sec("s-adj", "07", "裁决规则", '<p class="prose" style="margin-bottom:12px">战斗裁决步骤：① 合计参战部队攻击力；② 除以目标格内防御力之和得到兵力比，向下取整到最近一栏；③ 按地形和支援因素栏移；④ 掷骰查表；⑤ 执行结果，防御方被清空时近战部队可乘胜占领。</p>' + crtTable(buildCRT()) +
      '<h3 style="margin:16px 0 8px">地形效果表</h3><div class="table-wrap"><table><thead><tr><th>地形</th><th class="num">机动消耗</th><th class="num">防御栏移</th><th>说明</th></tr></thead><tbody>' + Object.entries(TERRAIN).map(([k, t]) => '<tr><td><span class="legend-row"><span><i style="background:var(--t-' + k + ')"></i>' + t.name + '</span></span></td><td class="num">' + (t.cost >= 99 ? "不可通行" : t.cost) + '</td><td class="num">' + (t.shift || "—") + "</td><td>" + t.note + "</td></tr>").join("") + "</tbody></table></div>" +
      '<h3 style="margin:16px 0 8px">栏移因素</h3><ul class="prose small" style="padding-left:18px;margin:0"><li>火力支援（炮兵/舰艇/航空兵与地面部队协同进攻）：+1</li><li>己方电子对抗部队距目标 3 格内：+1</li><li>航空兵参与进攻且目标在敌防空 2 格内：−1</li>' + (p.rules.command ? "<li>主攻部队在己方指挥所 4 格外：−1</li>" : "") + (p.rules.supply ? "<li>脱离补给的部队攻击力减半</li>" : "") + (p.rules.zoc ? "<li>进入敌控制区须停止机动</li>" : "") + "<li>装甲/机步进入山地、水网消耗 4，进入城镇消耗 2</li></ul>") +
    sec("s-evt", "08", "事件卡", '<p class="small muted" style="margin-bottom:10px">每回合“裁决与事件”阶段以 ' + ({ "低": "20%", "中": "40%", "高": "65%" }[p.rules.events]) + ' 概率按顺序抽取。</p><div class="event-grid">' + s.events.map((e, i) => '<div class="event-card"><span class="mono">事件 ' + pad2(i + 1) + "</span><b>" + e.title + '</b><span class="small">' + e.text + "</span></div>").join("") +
      (s.aiInjects || []).map(e => '<div class="event-card" style="border-color:var(--accent)"><span class="mono">第 ' + e.turn + " 回合 · 情况注入</span><b>" + esc(e.title) + '</b><span class="small">' + esc(e.detail) + '</span><button class="btn small ghost" data-act="dropInject" data-uid="' + e.uid + '">移除</button></div>').join("") + "</div>") +
    sec("s-bal", "09", "平衡性评估", balanceBlock(p, b)) +
    sec("s-chk", "10", "设计检查", "<div>" + s.checks.map(checkRow).join("") + "</div>") +
    sec("s-ai", "11", "AI 设计评审", '<div class="ai-only stack"><p class="small muted">请 Claude 以兵棋设计专家的视角审阅本方案，指出风险，并建议 2–3 条可加入推演的情况注入。</p><div class="btn-row"><button class="btn primary" id="ai-review-btn" data-act="aiReview">' + (review ? "重新评审" : "请 Claude 评审方案") + '</button></div><div id="ai-review-out">' + reviewBlock(p) + "</div></div>" +
      '<p class="small muted" data-no-ai>AI 评审需要在 Claude 中打开此页面时使用。本地运行时，可将“导出 Markdown”的内容交给任意助手审阅。</p>') +
    "</div></div>";
}
function phaseGuide(ph) { return { admin: "白方通报态势与上回合事件，双方下达命令", move: SIDES[ph.side] + "部队按机动力移动，进入敌控制区须停止", combat: SIDES[ph.side] + "选择目标发起进攻，掷骰查表裁决", event: "白方抽取事件卡，结算目标控制与胜利点" }[ph.kind]; }
function checkRow(c) { return '<div class="check ' + c.lvl + '"><span class="ic">' + (c.lvl === "ok" ? "✓" : c.lvl === "warn" ? "!" : "✕") + "</span><span>" + esc(c.text) + "</span></div>"; }
function balanceBlock(p, b) {
  const pc = x => Math.round(x * 100);
  const ac = sideColor(b.att), dc = sideColor(b.def);
  return '<p class="small muted" style="margin-bottom:10px">用简化模型把整场推演自动打 ' + b.N + " 遍（按本方案的兵力、CRT 和目标地形），估算结果的分布。它不预测真实胜负，只用来发现明显失衡。</p>" +
    '<div class="winbar" role="img" aria-label="进攻方 ' + pc(b.attWin) + "%，胶着 " + pc(b.draw) + "%，防御方 " + pc(b.defWin) + '%"><div style="width:' + pc(b.attWin) + "%;background:" + ac + '">' + (pc(b.attWin) >= 12 ? SIDES[b.att] + " " + pc(b.attWin) + "%" : "") + '</div><div style="width:' + pc(b.draw) + '%;background:var(--muted)">' + (pc(b.draw) >= 12 ? "胶着 " + pc(b.draw) + "%" : "") + '</div><div style="width:' + pc(b.defWin) + "%;background:" + dc + '">' + (pc(b.defWin) >= 12 ? SIDES[b.def] + " " + pc(b.defWin) + "%" : "") + "</div></div>" +
    '<div class="ratio-legend"><span>进攻方（' + SIDES[b.att] + "）达成目标</span><span>防御方（" + SIDES[b.def] + "）守住</span></div>" +
    '<dl class="kv" style="margin-top:12px"><div><dt>' + SIDES[b.att] + '平均损失</dt><dd class="mono">' + pc(b.attLoss) + "%</dd></div><div><dt>" + SIDES[b.def] + '平均损失</dt><dd class="mono">' + pc(b.defLoss) + '%</dd></div><div><dt>目标地形栏移</dt><dd class="mono">' + b.tShift + '</dd></div><div><dt>进攻方需推进</dt><dd class="mono">' + b.need + " 次</dd></div></dl>" +
    '<p class="small" style="margin-top:10px">' + (b.attWin > 0.8 ? "进攻方优势过大。可以削减进攻兵力、延长防御方坚守分值，或减少回合数。" : b.defWin > 0.8 ? "防御方优势过大。可以增加进攻兵力或回合数，或把目标设在更开阔的地形。" : "胜率分布在可对抗区间，双方指挥员的决策会对结果产生明显影响。") + "</p>";
}
function reviewBlock(p) {
  const r = p.scheme && p.scheme.aiReview; if (!r) return "";
  const lv = { "高": "crit", "中": "warn", "低": "ok" };
  return '<div class="ai-box stack"><p>' + esc(r.summary || "") + "</p><div>" + (r.risks || []).map(x => '<div class="risk"><span class="pill ' + (lv[x.level] || "warn") + '">' + esc(x.level || "中") + "</span><div><b>" + esc(x.title) + '</b><p class="small">' + esc(x.detail) + (x.fix ? '<br><span style="color:var(--accent)">建议：' + esc(x.fix) + "</span>" : "") + "</p></div></div>").join("") + "</div>" +
    ((r.injects || []).length ? '<h4>建议的情况注入</h4><div class="event-grid">' + r.injects.map((e, i) => '<div class="event-card"><span class="mono">第 ' + esc(e.turn) + " 回合</span><b>" + esc(e.title) + '</b><span class="small">' + esc(e.detail) + "</span>" + ((p.scheme.aiInjects || []).some(x => x.title === e.title) ? '<span class="pill ok">已加入</span>' : '<button class="btn small" data-act="adoptInject" data-i="' + i + '">加入推演</button>') + "</div>").join("") + "</div>" : "") + "</div>";
}

/* ---------------- 第 6 步：推演 ---------------- */
function viewPlay(p) {
  if (!p.scheme) return pageHead(5, "人工推演", "") + '<div class="empty">请先在“兵棋方案”中生成方案。<br><br><button class="btn primary" data-act="go" data-view="scheme">去生成方案</button></div>';
  const g = p.game;
  if (!g) {
    return pageHead(5, "人工推演", "把平台当作电子棋盘和裁判助手：双方指挥员轮流操作，白方掌控节奏，平台负责计算机动范围、兵力比和查表。") +
      guide("推演怎样进行", "每回合按“回合流程”依次进行。当前阶段属于哪一方，就由那一方的指挥员操作。", ["机动阶段：点击己方棋子，高亮格是它本回合能到达的位置，再点击目标格完成移动。", "作战阶段：点击己方棋子，虚线框是可攻击的敌军，点击目标后可以加入其他支援部队，然后掷骰裁决。", "白方：用顶部“视角”切换红方/蓝方/白方视角（双盲时尤其有用），用“下一阶段”推进流程，必要时调整棋子战斗步。", "所有操作都会写入推演记录，结束后自动生成复盘报告。"]) +
      '<div class="panel stack"><div class="grid-3"><div><div class="eyebrow">回合</div><p class="mono">' + p.scenario.turns + " 回合 × " + p.scenario.hoursPerTurn + ' 小时</p></div><div><div class="eyebrow">裁决</div><p>' + p.rules.adjudication + " · " + p.rules.dice + '</p></div><div><div class="eyebrow">信息条件</div><p>' + p.rules.fog + "</p></div></div>" +
      (isStale(p) ? '<p class="small" style="color:var(--warn)">提示：方案生成后输入有修改，建议先回到“兵棋方案”重新生成。</p>' : "") +
      '<div class="btn-row"><button class="btn primary" data-act="startGame">开始推演</button></div></div>';
  }
  if (g.ended && !S.ui.showBoard) return viewAAR(p);
  const ph = curPhase(p, g);
  const sel = S.ui.sel && g.units[S.ui.sel] && !g.units[S.ui.sel].dead ? g.units[S.ui.sel] : null;
  let reach = null, targets = null;
  if (sel && !g.ended && sel.side === ph.side) {
    if (ph.kind === "move" && !sel.moved) reach = reachable(p, g, sel);
    if (ph.kind === "combat") targets = targetsFor(p, g, sel);
  }
  const vp = computeVP(p, g, false);
  const view = g.view || "white";
  return '<div class="play-top"><div class="turn-box"><span class="eyebrow">回合</span><span class="big">' + pad2(g.turn) + '</span><span class="muted mono">/ ' + pad2(p.scenario.turns) + '</span></div><div class="muted small mono">' + esc(dtgLabel(p, g.turn)) + "</div>" +
    '<div class="phase-track" aria-label="回合阶段">' + p.rules.phases.map((x, i) => '<span class="' + (i === g.phase ? "on " + x.side : i < g.phase ? "past" : "") + '">' + x.name + "</span>").join("") + "</div>" +
    '<div style="flex:1"></div><div class="vp" aria-label="胜利点"><span style="color:var(--red)">红 ' + vp.red + '</span><span class="muted">:</span><span style="color:var(--blue)">' + vp.blue + " 蓝</span></div></div>" +
    '<div class="play"><div class="stack"><div class="btn-row" style="justify-content:space-between"><div class="btn-row"><span class="small muted">视角</span><div class="seg">' + [["white", "白方（全局）"], ["red", "红方"], ["blue", "蓝方"]].map(([k, l]) => '<button data-act="setView" data-val="' + k + '" aria-pressed="' + (view === k) + '">' + l + "</button>").join("") + '</div></div><div class="btn-row"><button class="btn small" data-act="zoom" data-val="-1" aria-label="缩小">−</button><button class="btn small" data-act="zoom" data-val="1" aria-label="放大">＋</button><button class="btn small" data-act="undo"' + (S.undo.length ? "" : " disabled") + ">撤销</button>" + (g.ended ? '<button class="btn small primary" data-act="showAAR">返回复盘</button>' : '<button class="btn primary" data-act="nextPhase">完成「' + ph.name + "」→</button>") + "</div></div>" +
    '<div class="map-wrap">' + mapSVG(p, { game: g, interactive: true, sel: sel && sel.id, reach, targets, view, fogSide: view !== "white" ? view : null, zoom: S.ui.zoom }) + "</div>" + terrainLegend(p.scheme.map) + "</div>" +
    '<aside class="side-info">' + phaseCard(p, g, ph) + unitCard(p, g, sel, ph, reach, targets) + eventsCard(g) +
    '<div class="info-card"><h3>推演记录</h3><div class="log">' + g.log.slice(0, 60).map(l => '<div class="log-item ' + l.side + '"><span class="mono">T' + l.turn + "</span><span><b>" + SIDES[l.side] + "</b> " + esc(l.text) + "</span></div>").join("") + "</div></div></aside></div>";
}
function phaseCard(p, g, ph) {
  if (g.ended) return '<div class="info-card"><h3>推演已结束</h3><p class="small muted">当前为棋盘回看模式。</p></div>';
  const side = ph.side;
  const pending = ph.kind === "move" ? aliveUnits(g, side).filter(u => !u.moved && Object.keys(reachable(p, g, u)).length).length : ph.kind === "combat" ? aliveUnits(g, side).filter(u => targetsFor(p, g, u).length).length : 0;
  const flags = [];
  if (g.flags.grounded) flags.push("本回合航空兵、陆航停飞");
  if (g.flags.comms) flags.push(SIDES[g.flags.comms] + "通信中断，机动力 −1");
  if (g.flags.noUrbanFire) flags.push("城镇格禁止远程火力");
  if (g.flags.noAttack && g.units[g.flags.noAttack]) flags.push(g.units[g.flags.noAttack].name + "补给延误，不能进攻");
  return '<div class="info-card" style="border-top:3px solid ' + sideColor(side) + '"><h3>当前：' + ph.name + '</h3><p class="small">' + phaseGuide(ph) + "。</p>" +
    (ph.kind === "move" || ph.kind === "combat" ? '<p class="small muted" style="margin-top:6px">' + SIDES[side] + "还有 " + pending + " 个部队可以" + (ph.kind === "move" ? "机动" : "进攻") + "。</p>" : "") +
    (ph.kind === "event" ? '<p class="small muted" style="margin-top:6px">点击“完成”时抽取事件，并结算目标控制与胜利点。</p>' : "") +
    (flags.length ? '<div class="chips" style="margin-top:8px">' + flags.map(f => '<span class="pill warn">' + f + "</span>").join("") + "</div>" : "") + "</div>";
}
function unitCard(p, g, u, ph, reach, targets) {
  if (!u) return '<div class="info-card"><h3>选择棋子</h3><p class="small muted">点击地图上的棋子查看详情。同一格有多个棋子时，再次点击可切换。</p></div>';
  const hex = p.scheme.map.hexes[u.hex];
  const canAct = u.side === ph.side && !g.ended;
  let act = "";
  if (canAct && ph.kind === "move") act = u.moved ? "本回合已机动。" : Object.keys(reach || {}).length ? "点击高亮格移动（" + Object.keys(reach).length + " 个可达位置）。" : "周围没有可到达的位置。";
  if (canAct && ph.kind === "combat") act = u.attacked ? "本回合已参加战斗。" : (targets || []).length ? "点击虚线框中的敌军发起进攻。" : "射程内没有可攻击的目标。";
  const white = (g.view || "white") === "white" && !g.ended;
  return '<div class="info-card"><div class="btn-row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0;color:' + sideColor(u.side) + '">' + esc(u.name) + '</h3><svg viewBox="0 0 30 24" width="54" height="43" aria-hidden="true">' + counterInner(u.side, u.type, u.echelon, u, u.steps, u.maxSteps) + "</svg></div>" +
    '<dl class="kv"><div><dt>兵种 / 梯队</dt><dd>' + UNIT_TYPES[u.type].name + " · " + ECHELONS[u.echelon].name + '</dd></div><div><dt>位置</dt><dd class="mono">' + u.hex + " " + TERRAIN[hex.t].name + '</dd></div><div><dt>当前攻 / 防</dt><dd class="mono">' + effAtk(p, g, u) + " / " + effDef(g, u) + '</dd></div><div><dt>战斗步</dt><dd class="mono">' + u.steps + " / " + u.maxSteps + '</dd></div><div><dt>补给 / 指挥</dt><dd>' + (inSupply(p, g, u) ? "有补给" : "脱离补给") + " · " + (inCommand(p, g, u) ? "在指挥半径内" : "半径外") + "</dd></div></dl>" +
    (act ? '<p class="small" style="margin-top:8px">' + act + "</p>" : "") + '<p class="small muted" style="margin-top:6px">' + UNIT_TYPES[u.type].note + "</p>" +
    (white ? '<div class="btn-row" style="margin-top:10px"><span class="small muted">白方调整</span><button class="btn small" data-act="adjStep" data-d="-1">−1 步</button><button class="btn small" data-act="adjStep" data-d="1">＋1 步</button><button class="btn small danger" data-act="adjRemove">撤出</button></div>' : "") + "</div>";
}
function eventsCard(g) {
  if (!g.lastEvents || !g.lastEvents.length) return "";
  return '<div class="info-card" style="border-color:var(--warn)"><h3>最新事件</h3>' + g.lastEvents.map(e => '<div class="event-card" style="margin-top:6px"><span class="mono">' + (e.ai ? "情况注入" : "事件卡") + "</span><b>" + esc(e.title) + '</b><span class="small">' + esc(e.text) + "</span></div>").join("") + "</div>";
}
function combatModal(p) {
  const g = p.game, c = S.ui.combat; if (!c) return "";
  const ph = curPhase(p, g);
  const cands = aliveUnits(g, ph.side).filter(u => targetsFor(p, g, u).includes(c.hex));
  const res = c.result;
  if (!res) c.ids = c.ids.filter(id => cands.some(u => u.id === id));
  const pv = res ? res.pv : c.ids.length ? combatPreview(p, g, c.ids, c.hex) : null;
  const expert = p.rules.adjudication !== "CRT";
  return '<div class="overlay" data-act="closeCombatBg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-title"><div class="modal-head"><div><div class="eyebrow">第 ' + g.turn + " 回合 · " + ph.name + '</div><h2 id="cm-title">战斗裁决：目标 ' + c.hex + " " + TERRAIN[p.scheme.map.hexes[c.hex].t].name + '</h2></div><button class="btn ghost" data-act="closeCombat" aria-label="关闭">✕</button></div>' +
    (res ? "" : '<div><div class="eyebrow" style="margin-bottom:6px">参战部队（可勾选支援部队）</div><div class="chips">' + cands.map(u => '<label class="chip" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-act="toggleAtt" data-id="' + u.id + '"' + (c.ids.includes(u.id) ? " checked" : "") + ">" + esc(u.name) + ' <span class="mono small">' + effAtk(p, g, u) + "</span></label>").join("") + "</div></div>") +
    (pv ? '<div class="combat-grid"><div class="combat-side ' + ph.side + '"><b>进攻 ' + pv.A + "</b><br>" + pv.atts.map(u => esc(u.name)).join("、") + '</div><div class="odds">' + ODDS_COLS[pv.col] + '<div class="small muted" style="font-weight:400">原始 ' + (pv.A / pv.D).toFixed(2) + ':1</div></div><div class="combat-side ' + other(ph.side) + '"><b>防御 ' + pv.D + "</b><br>" + pv.defs.map(u => esc(u.name)).join("、") + "</div></div>" +
      '<div class="small">' + (pv.shifts.length ? pv.shifts.map(s => '<span class="pill ' + (s.v > 0 ? "ok" : s.v < 0 ? "warn" : "") + '">' + (s.v > 0 ? "+" + s.v : s.v || "·") + " " + s.why + "</span>").join(" ") : '<span class="muted">无栏移</span>') + "</div>" +
      '<div><div class="eyebrow" style="margin-bottom:6px">结果概率</div><div class="table-wrap"><table><thead><tr>' + RESULT_ORDER.map(k => '<th class="num" title="' + RESULTS[k].desc + '">' + k + "</th>").join("") + "</tr></thead><tbody><tr>" + RESULT_ORDER.map(k => '<td class="num">' + (pv.probs[k] ? Math.round(pv.probs[k] * 100) + "%" : "—") + "</td>").join("") + "</tr></tbody></table></div></div>" : '<p class="muted">至少选择一个参战部队。</p>') +
    (res ? '<div class="btn-row"><span class="dice">' + res.roll.faces.join('</span><span class="dice">') + '</span><div class="result-banner" style="flex:1">' + RESULTS[res.res].name + "（" + res.res + "）：" + RESULTS[res.res].desc + (res.crtRes !== res.res ? '<br><span class="small muted">白方改判，查表结果为 ' + RESULTS[res.crtRes].name + "</span>" : "") + (res.notes.length ? '<br><span class="small muted">' + esc(res.notes.join("；")) + "</span>" : "") + '</div></div><div class="btn-row" style="justify-content:flex-end"><button class="btn primary" data-act="closeCombat">返回棋盘</button></div>'
      : '<div class="btn-row" style="justify-content:space-between">' + (expert ? '<div class="field" style="flex:1;min-width:200px"><label for="cm-force">' + (p.rules.adjudication === "专家" ? "白方专家裁决" : "白方改判（可选）") + '</label><select id="cm-force" class="input">' + opt("", "按表裁决", "") + RESULT_ORDER.map(k => opt(k, k + " " + RESULTS[k].name, "")).join("") + "</select></div>" : "<span></span>") +
        '<div class="btn-row" style="align-self:flex-end"><span class="dice" id="dice-anim" aria-hidden="true">?</span><button class="btn primary" data-act="rollCombat"' + (pv ? "" : " disabled") + ">掷骰裁决</button></div></div>") +
    "</div></div>";
}
function viewAAR(p) {
  const g = p.game, vp = g.finalVP || computeVP(p, g, true);
  const xs = g.history.map(h => "T" + h.turn);
  const maxR = Object.values(g.units).filter(u => u.side === "red").reduce((s, u) => s + u.maxSteps, 0), maxB = Object.values(g.units).filter(u => u.side === "blue").reduce((s, u) => s + u.maxSteps, 0);
  const lossR = (g.losses || {}).red || 0, lossB = (g.losses || {}).blue || 0;
  const combats = g.log.filter(l => l.text.includes("攻击")).length, events = g.log.filter(l => l.text.startsWith("事件") || l.text.startsWith("情况注入")).length;
  const objRows = p.objectives.items.map(o => { const hex = p.scheme.objHex[o.id]; const ctl = hex ? g.control[hex] : null; const ok = o.kind === "hold" || o.kind === "defend" ? ctl === o.side : o.kind === "destroy" ? ((g.losses || {})[other(o.side)] || 0) > 0 : ((g.losses || {})[o.side] || 0) / (o.side === "red" ? maxR : maxB) < 0.3; return '<tr><td><span class="pill ' + o.side + '">' + SIDES[o.side] + "</span></td><td>" + esc(o.title) + '</td><td class="num">' + (hex || "—") + "</td><td>" + (hex ? (ctl ? SIDES[ctl] + "控制" : "—") : "—") + "</td><td>" + (ok ? '<span class="pill ok">✓ 达成</span>' : '<span class="pill warn">未达成</span>') + "</td></tr>"; }).join("");
  return '<div class="page-head"><div><div class="eyebrow">复盘报告 · After Action Review</div><h1>' + (g.winner === "draw" ? "双方战平" : SIDES[g.winner] + "获胜") + '</h1><p class="lede">' + esc(p.scenario.title) + " · 共推演 " + g.history.length + " 个回合（" + round1(g.history.length * p.scenario.hoursPerTurn) + ' 小时）· 最终胜利点 红 ' + vp.red + " : 蓝 " + vp.blue + '</p></div><div class="btn-row"><button class="btn" data-act="showBoard">查看终局棋盘</button><button class="btn" data-act="exportMD">导出方案与记录</button><button class="btn danger" data-act="askRestart">重新推演</button></div></div>' +
    '<dl class="kv"><div><dt>红方损失</dt><dd class="mono">' + lossR + " / " + maxR + " 步（" + Math.round(lossR / Math.max(1, maxR) * 100) + '%）</dd></div><div><dt>蓝方损失</dt><dd class="mono">' + lossB + " / " + maxB + " 步（" + Math.round(lossB / Math.max(1, maxB) * 100) + '%）</dd></div><div><dt>战斗次数</dt><dd class="mono">' + combats + '</dd></div><div><dt>事件与注入</dt><dd class="mono">' + events + '</dd></div><div><dt>方案预估</dt><dd>' + SIDES[p.scheme.balance.att] + "达成 " + Math.round(p.scheme.balance.attWin * 100) + "%</dd></div></dl>" +
    '<div class="grid-2"><div class="panel"><h3 style="margin-bottom:8px">胜利点走势</h3>' + lineChart("ch-vp", xs, [{ name: "红方", color: "var(--red)", values: g.history.map(h => h.vpRed) }, { name: "蓝方", color: "var(--blue)", values: g.history.map(h => h.vpBlue) }], "每回合结束时的累计胜利点") + "</div>" +
    '<div class="panel"><h3 style="margin-bottom:8px">剩余战斗步</h3>' + lineChart("ch-str", xs, [{ name: "红方", color: "var(--red)", values: g.history.map(h => h.red) }, { name: "蓝方", color: "var(--blue)", values: g.history.map(h => h.blue) }], "每回合结束时剩余战斗步") + "</div></div>" +
    '<div class="panel"><h3 style="margin-bottom:8px">目标达成情况</h3><div class="table-wrap"><table><thead><tr><th>方</th><th>目标</th><th class="num">位置</th><th>终局控制</th><th>结果</th></tr></thead><tbody>' + objRows + "</tbody></table></div></div>" +
    '<div class="grid-2" style="align-items:start"><div class="panel"><h3 style="margin-bottom:8px">研究问题回顾</h3><p class="small" style="white-space:pre-wrap">' + esc(p.objectives.questions || "未设置研究问题。") + '</p><p class="small muted" style="margin-top:8px">请参演人员结合下方推演记录，逐条讨论：发生了什么？为什么？下次怎么做？</p>' +
    '<div class="ai-only" style="margin-top:12px"><button class="btn primary" id="ai-aar-btn" data-act="aiAAR">' + (g.aar ? "重新生成" : "请 Claude 撰写复盘评述") + '</button><div class="ai-out" id="ai-aar-out">' + esc(g.aar || "") + "</div></div></div>" +
    '<div class="panel"><h3 style="margin-bottom:8px">推演记录</h3><div class="log" style="max-height:480px">' + g.log.slice().reverse().map(l => '<div class="log-item ' + l.side + '"><span class="mono">T' + l.turn + "</span><span><b>" + SIDES[l.side] + "</b> " + esc(l.text) + "</span></div>").join("") + "</div></div></div>";
}

/* ============================================================
 * 弹窗
 * ============================================================ */
function openModal(html) { closeModal(); const d = document.createElement("div"); d.id = "modal-root"; d.innerHTML = html; document.body.appendChild(d); const f = d.querySelector("input,button.primary,button"); if (f) f.focus(); }
function closeModal() { const m = document.getElementById("modal-root"); if (m) m.remove(); }
function modalShell(title, body, foot) { return '<div class="overlay" data-act="closeModalBg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title"><div class="modal-head"><h2 id="m-title">' + title + '</h2><button class="btn ghost" data-act="closeModal" aria-label="关闭">✕</button></div>' + body + (foot ? '<div class="btn-row" style="justify-content:flex-end">' + foot + "</div>" : "") + "</div></div>"; }
function newProjectModal() {
  S.ui.tpl = S.ui.tpl || "coastal";
  openModal(modalShell("新建兵棋项目", '<div class="field"><label for="np-name">项目名称</label><input id="np-name" class="input" placeholder="留空则使用模板中的想定名称"></div><div class="field"><span class="label">从模板开始</span><div class="tpl-grid">' + Object.entries(TEMPLATES).map(([k, t]) => '<button class="tpl" data-act="pickTpl" data-val="' + k + '" aria-pressed="' + (S.ui.tpl === k) + '"><b>' + t.label + "</b><span>" + t.desc + "</span></button>").join("") + '</div><span class="hint">模板只是起点，所有内容都可以修改。地名与番号均为虚构。</span></div>', '<button class="btn" data-act="closeModal">取消</button><button class="btn primary" data-act="createProject">创建项目</button>'));
}
function glossaryModal() { openModal(modalShell("兵棋术语速查", '<dl class="glossary">' + GLOSSARY.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") + "</dl>")); }

/* ============================================================
 * AI（通过 sample 能力调用 Claude）
 * ============================================================ */
function aiErr(e) {
  const code = e && e.code;
  if (code === "not_granted" || code === "sampling_disabled" || code === "capability_disabled" || code === "not_declared") { SAMPLE = null; document.body.classList.remove("ai-on"); return "未获得调用 Claude 的许可，AI 功能已关闭。"; }
  if (code === "rate_limited") return "请求过于频繁，请稍后再试。";
  if (code === "cancelled") return "已停止。";
  if (code === "invalid_json") return "Claude 的回复格式不完整，请再试一次。";
  return "AI 暂时不可用（" + (code || "unknown") + "）。";
}
let aiCtl = null;
async function aiBackground() {
  const p = proj(); if (!SAMPLE || !p) return;
  const btn = document.getElementById("ai-bg-btn"), ta = document.getElementById("f-bg");
  if (aiCtl) { aiCtl.abort(); return; }
  aiCtl = new AbortController(); btn.textContent = "停止"; const before = ta.value; ta.value = "Claude 正在起草…";
  const sc = p.scenario;
  const prompt = "你是一名资深兵棋推演想定编写人员。请为下面这个虚构的兵棋推演写一段想定背景（中文，220–320 字，一段或两段）。\n要求：只用虚构的地名、番号和势力，不涉及任何真实国家、地区或真实部队；写清起因、作战地域特点、开始时间、双方态势和可能的增援；语气像参谋文书，简洁具体；不要标题，不要列表，不要解释。\n\n" +
    "想定名称：" + (sc.title || "未命名") + "\n层级：" + sc.level + "级\n开始时间：" + sc.startDTG + "\n地形：" + sc.terrain.join("、") + "\n天候：" + sc.weather + "\n电磁环境：" + sc.em + "\n进攻方：" + SIDES[sc.attacker] + "（" + p.forces[sc.attacker].name + "）\n防御方：" + SIDES[other(sc.attacker)] + "（" + p.forces[other(sc.attacker)].name + "）\n" +
    (p.forces.red.intent ? "红方意图：" + p.forces.red.intent + "\n" : "") + (p.forces.blue.intent ? "蓝方意图：" + p.forces.blue.intent + "\n" : "") + (before && before.length > 10 ? "已有草稿（可在此基础上改写）：" + before.slice(0, 800) : "");
  try {
    const { text } = await SAMPLE(prompt, { signal: aiCtl.signal, onText: ({ text }) => { ta.value = text; } });
    ta.value = text.trim(); p.scenario.background = ta.value; touch(p); refreshAux(); toast("已起草想定背景，可继续修改");
  } catch (e) { ta.value = (e && e.text) || before; p.scenario.background = ta.value; toast(aiErr(e)); }
  finally { aiCtl = null; if (document.getElementById("ai-bg-btn")) document.getElementById("ai-bg-btn").textContent = "请 Claude 起草背景"; }
}
async function aiReview() {
  const p = proj(); if (!SAMPLE || !p || !p.scheme) return;
  const btn = document.getElementById("ai-review-btn"), out = document.getElementById("ai-review-out");
  btn.disabled = true; btn.textContent = "Claude 正在审阅…"; out.innerHTML = '<p class="small muted">正在思考，通常需要 20–60 秒。</p>';
  const summary = schemeMarkdown(p).slice(0, 12000);
  const prompt = "你是兵棋设计专家，请审阅下面这份虚构想定的兵棋方案，从可玩性、平衡性、规则清晰度和是否能回答研究问题四个角度找出主要风险，并建议 2–3 条在推演中投放的情况注入（针对具体回合）。\n" +
    "只回复一个 JSON 对象，格式：{\"summary\": \"一句话总体评价\", \"risks\": [{\"level\": \"高|中|低\", \"title\": \"不超过16字\", \"detail\": \"问题说明\", \"fix\": \"具体修改建议\"}], \"injects\": [{\"turn\": 回合数字, \"title\": \"不超过12字\", \"detail\": \"情况描述与对双方的要求\"}]}\n" +
    "risks 3–5 条。全部用中文。回合数必须在 1 到 " + p.scenario.turns + " 之间。\n\n方案如下：\n" + summary;
  try {
    const r = await SAMPLE.json(prompt);
    if (!r || typeof r !== "object") throw { code: "invalid_json" };
    p.scheme.aiReview = { summary: String(r.summary || ""), risks: Array.isArray(r.risks) ? r.risks.slice(0, 6) : [], injects: Array.isArray(r.injects) ? r.injects.slice(0, 4).map(x => ({ turn: clamp(parseInt(x.turn) || 1, 1, +p.scenario.turns), title: String(x.title || "情况注入"), detail: String(x.detail || "") })) : [], at: new Date().toISOString() };
    touch(p); renderMain();
  } catch (e) { out.innerHTML = '<p class="small" style="color:var(--warn)">' + aiErr(e) + "</p>"; btn.disabled = false; btn.textContent = "请 Claude 评审方案"; }
}
async function aiAAR() {
  const p = proj(); if (!SAMPLE || !p || !p.game) return;
  const btn = document.getElementById("ai-aar-btn"), out = document.getElementById("ai-aar-out");
  if (aiCtl) { aiCtl.abort(); return; }
  aiCtl = new AbortController(); btn.textContent = "停止"; out.textContent = "Claude 正在分析推演记录…";
  const g = p.game, vp = g.finalVP || computeVP(p, g, true);
  const log = g.log.slice().reverse().map(l => "第" + l.turn + "回合[" + SIDES[l.side] + "] " + l.text).join("\n").slice(0, 9000);
  const prompt = "你是兵棋推演的白方导调员，请根据下面的推演记录写一份复盘评述（中文，400–600 字）。结构：1) 推演经过概述（按阶段）；2) 双方各 2 个关键决策点及其影响；3) 逐条回答研究问题；4) 对下次推演的 2–3 条改进建议。用小标题分段，不要使用 Markdown 表格。只谈虚构想定本身。\n\n" +
    "想定：" + p.scenario.title + "\n背景：" + (p.scenario.background || "").slice(0, 600) + "\n研究问题：\n" + (p.objectives.questions || "无") + "\n最终胜利点：红 " + vp.red + " 蓝 " + vp.blue + "\n红方意图：" + p.forces.red.intent + "\n蓝方意图：" + p.forces.blue.intent + "\n\n推演记录：\n" + log;
  try {
    const { text } = await SAMPLE(prompt, { signal: aiCtl.signal, onText: ({ text }) => { out.textContent = text; } });
    g.aar = text.trim(); touch(p);
  } catch (e) { out.textContent = (e && e.text) || aiErr(e); }
  finally { aiCtl = null; const b = document.getElementById("ai-aar-btn"); if (b) b.textContent = "重新生成"; }
}

/* ============================================================
 * 导出
 * ============================================================ */
async function offerFile(filename, text, mime) {
  if (DL) {
    try { await DL.save({ filename, data: text }); toast("已导出 " + filename); }
    catch (e) { if (e && (e.code === "declined" || e.code === "cancelled")) return; copyText(text, "无法保存文件，内容已复制到剪贴板"); }
    return;
  }
  if (!window.claude) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("已导出 " + filename); return;
  }
  copyText(text, "此环境不能直接下载，内容已复制到剪贴板");
}
function copyText(text, msg) {
  try { navigator.clipboard.writeText(text).then(() => toast(msg), () => toast("复制失败，请从项目中手动复制")); }
  catch (e) { toast("复制失败"); }
}

/* ============================================================
 * 交互分发
 * ============================================================ */
function snapshotUndo(p) { S.undo.push(JSON.stringify(p.game)); if (S.undo.length > 40) S.undo.shift(); }
function saveMapScroll() { const mw = document.querySelector(".map-wrap"); if (mw && S.view === "play") S.ui.scrollMap = [mw.scrollLeft, mw.scrollTop]; }
const ACT = {
  go(el) { S.view = el.dataset.view; S.ui.sel = null; S.ui.showBoard = false; if (S.view === "home") S.cur = S.view === "home" ? S.cur : S.cur; render(); window.scrollTo(0, 0); },
  home() { S.view = "home"; render(); },
  open(el) { S.cur = el.dataset.id; S.undo = []; const p = proj(); S.view = p.game ? "play" : p.scheme ? "scheme" : "scenario"; S.ui.sel = null; S.ui.showBoard = false; render(); window.scrollTo(0, 0); },
  newProject() { newProjectModal(); },
  pickTpl(el) { S.ui.tpl = el.dataset.val; document.querySelectorAll(".tpl").forEach(b => b.setAttribute("aria-pressed", b.dataset.val === S.ui.tpl)); },
  createProject() { const name = document.getElementById("np-name").value.trim(); const p = newProject(name, S.ui.tpl); S.projects.push(p); S.cur = p.id; S.view = "scenario"; closeModal(); save(); render(); window.scrollTo(0, 0); toast("已创建项目"); },
  dup(el, e) { e.stopPropagation(); const src = S.projects.find(p => p.id === el.dataset.id); const p = clone(src); p.id = uid(); p.name = src.name + "（副本）"; p.sample = false; p.game = null; p.updatedAt = new Date().toISOString(); S.projects.push(p); save(); render(); toast("已复制项目"); },
  askDelete(el, e) { e.stopPropagation(); const p = S.projects.find(x => x.id === el.dataset.id); openModal(modalShell("删除项目", "<p>确定删除“" + esc(p.name) + "”吗？删除后无法恢复。如需保留，请先打开项目导出 JSON。</p>", '<button class="btn" data-act="closeModal">取消</button><button class="btn primary" style="background:var(--crit);border-color:var(--crit)" data-act="doDelete" data-id="' + p.id + '">删除</button>')); },
  doDelete(el) { S.projects = S.projects.filter(p => p.id !== el.dataset.id); if (S.cur === el.dataset.id) S.cur = null; closeModal(); save(); render(); toast("已删除项目"); },
  closeModal() { closeModal(); },
  closeModalBg(el, e) { if (e.target === el) closeModal(); },
  glossary() { glossaryModal(); },
  set(el) { const p = proj(); let v = el.dataset.val; setPath(p, el.dataset.path, v); touch(p); el.parentNode.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === el)); refreshAux(); if (el.dataset.path === "scenario.attacker") renderMain(); },
  toggle(el) { const p = proj(); const arr = getPath(p, el.dataset.path); const v = el.dataset.val; const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); el.setAttribute("aria-pressed", i < 0); touch(p); refreshAux(); },
  setLevel(el) { const p = proj(); p.scenario.level = el.dataset.val; touch(p); renderMain(); refreshAux(); },
  applyLevel() { const p = proj(); const L = LEVELS[p.scenario.level]; Object.assign(p.scenario, { hoursPerTurn: L.hoursPerTurn, kmPerHex: L.kmPerHex, turns: L.turns, cols: L.cols, rows: L.rows }); p.rules.stacking = p.scenario.level === "战略" ? 3 : 2; touch(p); renderMain(); refreshAux(); toast("已按" + p.scenario.level + "级推荐值填入"); },
  delUnit(el) { const p = proj(); p.forces[el.dataset.side].units.splice(+el.dataset.i, 1); touch(p); renderMain(); refreshAux(); },
  addObj(el) { const p = proj(); p.objectives.items.push({ id: uid(), side: el.dataset.side, kind: "hold", title: "新目标", hex: "", vp: 2, turn: +p.scenario.turns }); touch(p); renderMain(); refreshAux(); },
  delObj(el) { const p = proj(); p.objectives.items.splice(+el.dataset.i, 1); touch(p); renderMain(); refreshAux(); },
  phaseUp(el) { const p = proj(); const i = +el.dataset.i; const a = p.rules.phases; [a[i - 1], a[i]] = [a[i], a[i - 1]]; touch(p); renderMain(); },
  phaseDown(el) { const p = proj(); const i = +el.dataset.i; const a = p.rules.phases; [a[i + 1], a[i]] = [a[i], a[i + 1]]; touch(p); renderMain(); },
  swapSides() { const p = proj(); const a = p.rules.phases; const r = a.filter(x => x.side === "red"), b = a.filter(x => x.side === "blue"); let ri = 0, bi = 0; p.rules.phases = a.map(x => x.side === "red" ? b[bi++] : x.side === "blue" ? r[ri++] : x); touch(p); renderMain(); toast("已对调红蓝行动顺序"); },
  applyRec() { const p = proj(); Object.assign(p.rules, recommendRules(p)); touch(p); renderMain(); toast("已采用推荐规则"); },
  confirmRules() { const p = proj(); p.rulesConfirmed = true; touch(p); S.view = "scheme"; render(); window.scrollTo(0, 0); },
  generate() { const p = proj(); p.rulesConfirmed = true; p.scheme = generateScheme(p, {}); touch(p); render(); toast("已生成方案 v" + p.scheme.version); },
  newMap() { const p = proj(); p.scheme = generateScheme(p, { newMap: true }); touch(p); render(); toast("已生成新地图"); },
  scrollTo(el, e) { e.preventDefault(); const t = document.getElementById(el.dataset.id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); },
  exportMD() { const p = proj(); offerFile((p.scenario.title || p.name).replace(/[\\/:*?"<>|“”]/g, "") + "-兵棋方案.md", schemeMarkdown(p), "text/markdown"); },
  exportJSON() { const p = proj(); offerFile((p.name || "project").replace(/[\\/:*?"<>|“”]/g, "") + ".wargame.json", JSON.stringify(p, null, 2), "application/json"); },
  aiBackground() { aiBackground(); },
  aiReview() { aiReview(); },
  aiAAR() { aiAAR(); },
  adoptInject(el) { const p = proj(); const x = p.scheme.aiReview.injects[+el.dataset.i]; p.scheme.aiInjects = p.scheme.aiInjects || []; p.scheme.aiInjects.push({ ...x, uid: uid() }); touch(p); renderMain(); toast("已加入第 " + x.turn + " 回合的情况注入"); },
  dropInject(el) { const p = proj(); p.scheme.aiInjects = (p.scheme.aiInjects || []).filter(x => x.uid !== el.dataset.uid); touch(p); renderMain(); },
  startGame() { const p = proj(); p.game = newGame(p); S.undo = []; S.ui.sel = null; touch(p); render(); },
  askRestart() { openModal(modalShell("重新推演", "<p>当前推演记录和复盘将被清除，棋子回到初始部署。建议先导出记录。</p>", '<button class="btn" data-act="closeModal">取消</button><button class="btn primary" data-act="doRestart">重新开始</button>')); },
  doRestart() { const p = proj(); p.game = newGame(p); S.undo = []; S.ui.sel = null; S.ui.showBoard = false; closeModal(); touch(p); render(); },
  showBoard() { S.ui.showBoard = true; renderMain(); },
  showAAR() { S.ui.showBoard = false; renderMain(); },
  setView(el) { const p = proj(); saveMapScroll(); p.game.view = el.dataset.val; S.ui.sel = null; touch(p); renderMain(); },
  zoom(el) { saveMapScroll(); S.ui.zoom = clamp(S.ui.zoom + (+el.dataset.val) * 0.2, 0.7, 2.2); renderMain(); },
  undo() { const p = proj(); const s = S.undo.pop(); if (!s) return; saveMapScroll(); p.game = JSON.parse(s); touch(p); renderMain(); toast("已撤销"); },
  nextPhase() {
    const p = proj(), g = p.game; saveMapScroll(); snapshotUndo(p);
    const before = g.turn;
    advancePhase(p, g); S.ui.sel = null; touch(p);
    if (g.ended) { S.ui.showBoard = false; render(); window.scrollTo(0, 0); toast("推演结束，已生成复盘报告"); return; }
    renderMain(); renderRail();
    if (g.turn !== before) toast("进入第 " + g.turn + " 回合");
    else if (g.lastEvents && g.lastEvents.length && curPhase(p, g).kind !== "admin") toast("抽到事件：" + g.lastEvents.map(e => e.title).join("、"));
  },
  hex(el) {
    const p = proj(), g = p.game; if (!g) return;
    const hex = el.dataset.hex, ph = curPhase(p, g); saveMapScroll();
    const sel = S.ui.sel && g.units[S.ui.sel] && !g.units[S.ui.sel].dead ? g.units[S.ui.sel] : null;
    if (sel && !g.ended && sel.side === ph.side) {
      if (ph.kind === "move" && !sel.moved) {
        const r = reachable(p, g, sel);
        if (r[hex] !== undefined) { snapshotUndo(p); const from = sel.hex; sel.hex = hex; sel.moved = true; pushLog(g, sel.side, sel.name + " 由 " + from + " 机动至 " + hex + "（" + TERRAIN[p.scheme.map.hexes[hex].t].name + "，消耗 " + r[hex] + "）"); updateControl(p, g); touch(p); renderMain(); return; }
      }
      if (ph.kind === "combat" && targetsFor(p, g, sel).includes(hex)) { S.ui.combat = { hex, ids: [sel.id], result: null }; openModal(combatModal(p)); return; }
    }
    const here = unitsAt(g, hex).filter(u => visibleTo(p, g, u, g.view || "white"));
    if (!here.length) { S.ui.sel = null; renderMain(); return; }
    const idx = here.findIndex(u => u.id === S.ui.sel);
    S.ui.sel = here[(idx + 1) % here.length].id; renderMain();
  },
  toggleAtt(el) { const c = S.ui.combat; const id = el.dataset.id; if (el.checked) { if (!c.ids.includes(id)) c.ids.push(id); } else c.ids = c.ids.filter(x => x !== id); openModal(combatModal(proj())); },
  rollCombat() {
    const p = proj(), c = S.ui.combat; const forceSel = document.getElementById("cm-force"); const forced = forceSel ? forceSel.value : "";
    const dice = document.getElementById("dice-anim"); const btn = document.querySelector('[data-act="rollCombat"]'); btn.disabled = true;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dice.classList.add("rolling"); let n = 0;
    const iv = setInterval(() => { dice.textContent = 1 + Math.floor(Math.random() * 6); if (++n > 8) done(); }, reduce ? 1 : 70);
    function done() { clearInterval(iv); snapshotUndo(p); c.result = resolveCombat(p, p.game, c.ids, c.hex, forced); updateControl(p, p.game); touch(p); renderMain(); openModal(combatModal(p)); }
  },
  closeCombat() { S.ui.combat = null; closeModal(); renderMain(); },
  closeCombatBg(el, e) { if (e.target === el) { S.ui.combat = null; closeModal(); renderMain(); } },
  adjStep(el) { const p = proj(), g = p.game, u = g.units[S.ui.sel]; if (!u) return; snapshotUndo(p); const d = +el.dataset.d; const lt = {}; if (d < 0) { stepLoss(g, u, 1, lt); g.losses = g.losses || { red: 0, blue: 0 }; g.losses[u.side] += lt[u.side] || 0; } else u.steps = Math.min(u.maxSteps, u.steps + 1); pushLog(g, "white", "白方裁定：" + SIDES[u.side] + u.name + (d < 0 ? " 损失 1 步" : " 恢复 1 步")); touch(p); renderMain(); },
  adjRemove() { const p = proj(), g = p.game, u = g.units[S.ui.sel]; if (!u) return; snapshotUndo(p); u.dead = true; u.hex = null; pushLog(g, "white", "白方裁定：" + SIDES[u.side] + u.name + " 撤出战场（不计入歼敌）"); S.ui.sel = null; touch(p); renderMain(); },
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.tagName === "INPUT" && el.type === "checkbox" && el.dataset.act !== "toggleAtt") return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === "A") e.preventDefault();
  fn(el, e);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("modal-root")) { S.ui.combat = null; closeModal(); if (S.view === "play") renderMain(); }
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("proj-card")) { e.preventDefault(); ACT.open(e.target, e); }
});
function onBind(e) {
  const el = e.target;
  if (el.dataset.addUnit && e.type === "change") {
    const p = proj(); const side = el.dataset.addUnit, type = el.value; if (!type) return;
    const f = p.forces[side]; const n = f.units.filter(u => u.type === type).length + 1;
    f.units.push({ id: uid(), name: UNIT_TYPES[type].name + (n > 1 ? n : "") + "分队", type, echelon: LEVELS[p.scenario.level].echelon, readiness: 90, hex: "" });
    touch(p); renderMain(); refreshAux(); const s = document.getElementById("add-" + side); if (s) s.focus(); return;
  }
  if (el.id === "import-file" && e.type === "change") { importFile(el.files[0]); el.value = ""; return; }
  const path = el.dataset.bind; if (!path) return;
  const p = proj(); if (!p) return;
  if (el.dataset.rerender && e.type !== "change") return;
  let v = el.type === "number" ? (el.value === "" ? "" : +el.value) : el.type === "checkbox" ? el.checked : el.value;
  if (path.endsWith(".hex")) v = String(v).replace(/\D/g, "").slice(0, 4);
  setPath(p, path, v);
  if (path === "scenario.title" && (!p.nameEdited)) p.name = v || p.name;
  touch(p);
  if (el.dataset.rerender) { renderMain(); refreshAux(); } else refreshAux();
}
document.addEventListener("input", onBind);
document.addEventListener("change", e => { if (e.target.dataset.rerender || e.target.dataset.addUnit || e.target.id === "import-file" || e.target.type === "checkbox" || e.target.tagName === "SELECT") onBind(e); });
function importFile(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const p = JSON.parse(rd.result);
      if (!p || !p.scenario || !p.forces || !p.objectives) throw new Error("bad");
      p.id = uid(); p.sample = false; p.rules = p.rules || defaultRules(p.scenario.level); p.updatedAt = new Date().toISOString();
      S.projects.push(p); S.cur = p.id; S.view = p.scheme ? "scheme" : "scenario"; save(); render(); toast("已导入“" + p.name + "”");
    } catch (err) { toast("导入失败：文件不是兵棋设计工坊导出的项目 JSON"); }
  };
  rd.readAsText(file);
}

/* ============================================================
 * 启动
 * ============================================================ */
function boot() {
  load();
  const h = (location.hash || "").slice(1);
  if (h && STEPS.some(s => s.key === h) && S.projects[0]) { S.cur = S.projects[0].id; S.view = h; }
  render();
  if (window.claude && window.claude.use) {
    window.claude.use("sample").then(s => { SAMPLE = s; document.body.classList.toggle("ai-on", !!s); }).catch(() => {});
    window.claude.use("downloads").then(d => { DL = d; }).catch(() => {});
  }
}
boot();
