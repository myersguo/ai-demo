/* ============================================================
 * 引擎：工具函数、六角格几何、地图生成、方案生成、裁决、推演
 * ============================================================ */
function uid() { return Math.random().toString(36).slice(2, 10); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pad2(n) { return String(n).padStart(2, "0"); }
function round1(n) { return Math.round(n * 10) / 10; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pickWeighted(rnd, entries) { const tot = entries.reduce((s, e) => s + e[1], 0); let x = rnd() * tot; for (const e of entries) { x -= e[1]; if (x <= 0) return e[0]; } return entries[entries.length - 1][0]; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function other(side) { return side === "red" ? "blue" : "red"; }

/* ---------------- 六角格（平顶、奇列下移） ---------------- */
const HEX_S = 22;
const SQ3 = Math.sqrt(3);
function hexId(q, r) { return pad2(q + 1) + pad2(r + 1); }
function parseHex(id) { if (!/^\d{4}$/.test(id || "")) return null; return { q: +id.slice(0, 2) - 1, r: +id.slice(2) - 1 }; }
function hexCenter(q, r) { return { x: HEX_S * 1.5 * q + HEX_S + 2, y: SQ3 * HEX_S * (r + 0.5 * (q & 1)) + SQ3 * HEX_S / 2 + 2 }; }
function hexPoints(cx, cy, s) { const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * 60 * i; pts.push((cx + s * Math.cos(a)).toFixed(1) + "," + (cy + s * Math.sin(a)).toFixed(1)); } return pts.join(" "); }
function mapSize(cols, rows) { return { w: HEX_S * 1.5 * (cols - 1) + HEX_S * 2 + 4, h: SQ3 * HEX_S * (rows + 0.5) + 4 }; }
const NB_EVEN = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]];
const NB_ODD = [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];
function neighbors(id, cols, rows) {
  const h = parseHex(id); if (!h) return [];
  const d = (h.q & 1) ? NB_ODD : NB_EVEN; const out = [];
  for (const [dq, dr] of d) { const q = h.q + dq, r = h.r + dr; if (q >= 0 && r >= 0 && q < cols && r < rows) out.push(hexId(q, r)); }
  return out;
}
function toCube(q, r) { const x = q, z = r - (q - (q & 1)) / 2; return { x, y: -x - z, z }; }
function hexDist(a, b) {
  const A = parseHex(a), B = parseHex(b); if (!A || !B) return 99;
  const c1 = toCube(A.q, A.r), c2 = toCube(B.q, B.r);
  return Math.max(Math.abs(c1.x - c2.x), Math.abs(c1.y - c2.y), Math.abs(c1.z - c2.z));
}

/* ---------------- 地图生成 ---------------- */
function genMap(sc, seed) {
  const cols = clamp(+sc.cols || 16, 8, 30), rows = clamp(+sc.rows || 11, 6, 22);
  const rnd = mulberry32(seed);
  const w = { plain: 3 };
  for (const opt of TERRAIN_OPTIONS) if ((sc.terrain || []).includes(opt.key)) for (const k in opt.w) w[k] = (w[k] || 0) + opt.w[k];
  const pool = Object.entries(w);
  const seeds = [];
  const K = Math.max(8, Math.round(cols * rows / 6));
  for (let i = 0; i < K; i++) seeds.push({ q: Math.floor(rnd() * cols), r: Math.floor(rnd() * rows), t: pickWeighted(rnd, pool) });
  const hexes = {};
  for (let q = 0; q < cols; q++) for (let r = 0; r < rows; r++) {
    let best = null, bd = 1e9; const id = hexId(q, r);
    for (const s of seeds) { const d = hexDist(id, hexId(s.q, s.r)) + rnd() * 0.9; if (d < bd) { bd = d; best = s; } }
    hexes[id] = { q, r, t: best.t };
  }
  const coast = (sc.terrain || []).includes("海岸"), island = (sc.terrain || []).includes("岛屿");
  if (coast || island) {
    let depth = 2;
    for (let q = 0; q < cols; q++) {
      depth = clamp(depth + Math.floor(rnd() * 3) - 1, 1, 3);
      for (let r = 0; r < depth; r++) hexes[hexId(q, r)].t = "water";
    }
    if (island) {
      let d2 = 1;
      for (let q = 0; q < cols; q++) { d2 = clamp(d2 + Math.floor(rnd() * 3) - 1, 1, 2); for (let r = rows - d2; r < rows; r++) hexes[hexId(q, r)].t = "water"; }
    }
  }
  return { cols, rows, hexes };
}

/* ---------------- 部队属性 ---------------- */
function unitStats(u) {
  const t = UNIT_TYPES[u.type] || UNIT_TYPES.inf, e = ECHELONS[u.echelon] || ECHELONS.battalion;
  const rf = clamp(+u.readiness || 90, 30, 100) / 100;
  return { atk: round1(t.atk * e.mult * rf), def: round1(t.def * e.mult * rf), mv: t.mv, rng: t.rng, steps: e.steps };
}
function sideTotals(units) {
  let atk = 0, def = 0, steps = 0;
  for (const u of units) { const s = unitStats(u); atk += s.atk; def += s.def; steps += s.steps; }
  return { atk: round1(atk), def: round1(def), steps, n: units.length };
}
function isAirType(t) { return t === "air" || t === "helo"; }
function isRangedType(t) { return t === "art" || t === "naval" || t === "air" || t === "ew" || t === "ad"; }
function moveCost(type, terr) {
  if (isAirType(type)) return 1;
  if (type === "naval") return terr === "water" ? 1 : 99;
  if (terr === "water") return 99;
  const base = TERRAIN[terr].cost;
  if (type === "armor" || type === "mech") { if (terr === "mountain") return 4; if (terr === "marsh") return 4; if (terr === "urban") return 2; }
  return base;
}

/* ---------------- 部署与目标落位 ---------------- */
function placeScheme(p, map, rnd) {
  const sc = p.scenario, att = sc.attacker || "red", def = other(att);
  const { cols, rows, hexes } = map;
  const land = id => hexes[id] && hexes[id].t !== "water";
  // 目标格：在防御方一侧的中部，优先城镇、丘陵
  const objHex = {};
  const byTitle = {};
  const lo = def === "red" ? Math.floor(cols * 0.45) : Math.floor(cols * 0.2);
  const hi = def === "red" ? Math.floor(cols * 0.8) : Math.floor(cols * 0.55);
  const cand = Object.keys(hexes).filter(id => { const h = hexes[id]; return land(id) && h.q >= lo && h.q <= hi && h.r >= 1 && h.r <= rows - 2; });
  const score = id => { const t = hexes[id].t; return (t === "urban" ? 3 : t === "hill" ? 2 : t === "mountain" ? 1.5 : t === "forest" ? 1 : 0) + rnd() * 1.2; };
  cand.sort((a, b) => score(b) - score(a));
  const used = [];
  for (const o of p.objectives.items) {
    if (o.kind !== "hold" && o.kind !== "defend") continue;
    const ph = parseHex(o.hex);
    if (ph && hexes[o.hex]) { objHex[o.id] = o.hex; used.push(o.hex); continue; }
    const key = o.title.replace(/^(夺取|控制|坚守|守住|夺控)/, "").replace(/至.*$/, "").trim();
    if (byTitle[key]) { objHex[o.id] = byTitle[key]; continue; }
    const pick = cand.find(id => used.every(u => hexDist(u, id) >= 3)) || cand[0];
    if (pick) { objHex[o.id] = pick; used.push(pick); byTitle[key] = pick; }
  }
  // 部队落位
  const placements = {};
  const stackCount = {};
  const limit = (p.rules && p.rules.stacking) || 2;
  const canStack = id => (stackCount[id] || 0) < limit;
  const put = (u, id) => { placements[u.id] = id; if (!isAirType(u.type)) stackCount[id] = (stackCount[id] || 0) + 1; };
  const edgeCols = side => side === "blue" ? [0, 1, 2] : [cols - 1, cols - 2, cols - 3];
  const objList = Object.values(objHex);
  for (const side of ["red", "blue"]) {
    const units = p.forces[side].units;
    const pending = [];
    for (const u of units) { if (parseHex(u.hex) && hexes[u.hex]) put(u, u.hex); else pending.push(u); }
    const zone = Object.keys(hexes).filter(id => edgeCols(side).includes(hexes[id].q));
    const waterZone = Object.keys(hexes).filter(id => hexes[id].t === "water" && (side === "blue" ? hexes[id].q < cols / 2 : hexes[id].q >= cols / 2));
    let defendHexes = [];
    if (side === def && objList.length) {
      // 防御方前出部署：目标格及周边
      const near = Object.keys(hexes).filter(id => land(id) && objList.some(o => hexDist(o, id) <= 2));
      near.sort((a, b) => Math.min(...objList.map(o => hexDist(o, a))) - Math.min(...objList.map(o => hexDist(o, b))) || rnd() - 0.5);
      defendHexes = near;
    }
    const zoneSorted = zone.filter(land).sort((a, b) => Math.abs(hexes[a].r - rows / 2) - Math.abs(hexes[b].r - rows / 2) + (rnd() - 0.5) * 3);
    let zi = 0;
    for (const u of pending) {
      let spot = null;
      if (u.type === "naval") spot = (waterZone.length ? waterZone : Object.keys(hexes).filter(id => hexes[id].t === "water"))[Math.floor(rnd() * Math.max(1, waterZone.length))] || null;
      else if (side === def && defendHexes.length && ["inf", "mech", "armor", "sof"].includes(u.type)) spot = defendHexes.find(canStack);
      else if (side === def && defendHexes.length && ["art", "ad", "hq", "log", "ew"].includes(u.type)) spot = defendHexes.slice(Math.floor(defendHexes.length / 2)).find(canStack) || defendHexes.find(canStack);
      if (!spot) { for (let k = 0; k < zoneSorted.length; k++) { const id = zoneSorted[(zi + k) % zoneSorted.length]; if (canStack(id)) { spot = id; zi = (zi + k + 1) % zoneSorted.length; break; } } }
      if (!spot) spot = zoneSorted[0] || Object.keys(hexes).find(land);
      put(u, spot);
    }
  }
  return { objHex, placements };
}

/* ---------------- 战斗结果表 ---------------- */
function crtLookup(col, die) { return RESULT_ORDER[clamp(col + die - 3, 0, RESULT_ORDER.length - 1)]; }
function buildCRT() { return ODDS_COLS.map((c, ci) => [1, 2, 3, 4, 5, 6].map(d => crtLookup(ci, d))); }
function oddsColumn(ratio) { let c = 0; for (let i = 0; i < ODDS_VALUES.length; i++) if (ratio >= ODDS_VALUES[i] - 1e-9) c = i; return c; }
function rollDice(mode, rnd) {
  rnd = rnd || Math.random;
  if (mode === "2d6") { const a = 1 + Math.floor(rnd() * 6), b = 1 + Math.floor(rnd() * 6); return { faces: [a, b], die: Math.floor((a + b - 7) / 2) + 4 }; }
  const a = 1 + Math.floor(rnd() * 6); return { faces: [a], die: a };
}
function resultProbabilities(col, mode) {
  const probs = {}; RESULT_ORDER.forEach(r => probs[r] = 0);
  if (mode === "2d6") { for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) probs[crtLookup(col, Math.floor((a + b - 7) / 2) + 4)] += 1 / 36; }
  else for (let d = 1; d <= 6; d++) probs[crtLookup(col, d)] += 1 / 6;
  return probs;
}

/* ---------------- 事件卡 ---------------- */
function buildEvents(p, rnd) {
  const sc = p.scenario;
  const lib = EVENT_LIBRARY.map(e => ({ ...e }));
  if (["雨", "大雾", "雪", "大风/高海况"].includes(sc.weather)) lib.find(e => e.id === "wx").w += 3;
  if (sc.em === "强对抗") { lib.find(e => e.id === "comms").w += 3; lib.find(e => e.id === "cyber").w += 2; }
  if ((sc.terrain || []).includes("城镇")) lib.find(e => e.id === "civ").w += 2;
  const deck = [];
  const pool = lib.map(e => [e, e.w]);
  for (let i = 0; i < 8; i++) { const e = pickWeighted(rnd, pool); deck.push({ ...e, uid: uid() }); }
  return deck;
}

/* ---------------- 平衡性估算（蒙特卡洛） ---------------- */
function simulateBalance(p, placement, map, N) {
  N = N || 800;
  const sc = p.scenario, att = sc.attacker || "red", def = other(att);
  const turns = clamp(+sc.turns || 8, 1, 40);
  const rnd = mulberry32(hashStr(p.id + "mc"));
  const objHexes = Object.values(placement.objHex);
  const tShift = objHexes.length ? Math.round(objHexes.reduce((s, id) => s + TERRAIN[map.hexes[id].t].shift, 0) / objHexes.length) : -1;
  const holdCount = p.objectives.items.filter(o => o.side === att && o.kind === "hold").length || 1;
  const need = 2 + holdCount;
  const mk = side => p.forces[side].units.filter(u => UNIT_TYPES[u.type]).map(u => { const s = unitStats(u); return { atk: s.atk, def: s.def, steps: s.steps, max: s.steps, type: u.type }; });
  let aw = 0, dw = 0, dr = 0, aLoss = 0, dLoss = 0;
  const progHist = new Array(11).fill(0);
  for (let n = 0; n < N; n++) {
    const A = mk(att), D = mk(def);
    let prog = 0;
    const alive = arr => arr.filter(u => u.steps > 0);
    const power = arr => alive(arr).reduce((s, u) => s + u.atk * u.steps / u.max, 0);
    const hit = (arr, k) => { for (let i = 0; i < k; i++) { const al = alive(arr).filter(u => !isAirType(u.type)); const pool = al.length ? al : alive(arr); if (!pool.length) return; pool[Math.floor(rnd() * pool.length)].steps--; } };
    for (let t = 0; t < turns; t++) {
      const dAlive = alive(D).filter(u => u.def > 0 && !isAirType(u.type));
      if (!dAlive.length || !alive(A).length) break;
      const E = Math.max(1, Math.ceil(dAlive.length / 2));
      const pw = power(A) * 0.8 / E;
      for (let e = 0; e < E; e++) {
        const tgt = dAlive[Math.floor(rnd() * dAlive.length)]; if (tgt.steps <= 0) continue;
        const dv = Math.max(0.5, tgt.def * tgt.steps / tgt.max);
        const col = clamp(oddsColumn(pw / dv) + tShift, 0, 7);
        const r = crtLookup(col, rollDice(p.rules.dice, rnd).die);
        if (r === "A2") hit(A, 2); else if (r === "A1") hit(A, 1); else if (r === "AR") prog -= 0.5;
        else if (r === "EX") { hit(A, 1); tgt.steps--; }
        else if (r === "DR") prog += 1; else if (r === "D1") tgt.steps--; else if (r === "D1R") { tgt.steps--; prog += 1; } else if (r === "D2") tgt.steps -= 2;
      }
      // 防御方反击
      const aAlive = alive(A).filter(u => !isAirType(u.type));
      if (aAlive.length) {
        const tgt = aAlive[Math.floor(rnd() * aAlive.length)];
        const ratio = power(D) * 0.5 / Math.max(0.5, tgt.def * tgt.steps / tgt.max);
        if (ratio >= 1.5) {
          const r = crtLookup(oddsColumn(ratio), rollDice(p.rules.dice, rnd).die);
          if (r === "D1" || r === "D1R") tgt.steps--; else if (r === "D2") tgt.steps -= 2; else if (r === "A1") hit(D, 1); else if (r === "A2") hit(D, 2); else if (r === "EX") { tgt.steps--; hit(D, 1); }
          if (r === "DR" || r === "D1R") prog -= 0.5;
        }
      }
    }
    const frac = arr => arr.reduce((s, u) => s + Math.max(0, u.steps), 0) / Math.max(1, arr.reduce((s, u) => s + u.max, 0));
    const fa = frac(A), fd = frac(D);
    aLoss += 1 - fa; dLoss += 1 - fd;
    progHist[clamp(Math.round(prog), 0, 10)]++;
    if (fd < 0.45 || (prog >= need && fa >= 0.35)) aw++;
    else if (fa < 0.45 || prog < need - 1) dw++;
    else dr++;
  }
  return { N, need, att, def, attWin: aw / N, defWin: dw / N, draw: dr / N, attLoss: aLoss / N, defLoss: dLoss / N, tShift, progHist };
}

/* ---------------- 设计检查 ---------------- */
function designChecks(p, scheme) {
  const out = [];
  const sc = p.scenario, add = (lvl, text) => out.push({ lvl, text });
  sc.title ? add("ok", "想定已命名") : add("crit", "想定缺少名称");
  (sc.background || "").length >= 40 ? add("ok", "想定背景完整（" + sc.background.length + " 字）") : add("warn", "想定背景偏短，参演人员可能不清楚初始态势。建议写明：起因、地域、时间、双方态势");
  for (const s of ["red", "blue"]) {
    const n = p.forces[s].units.length;
    if (!n) add("crit", SIDES[s] + "没有参演部队");
    else if (n > 16) add("warn", SIDES[s] + "部队 " + n + " 个，手工推演负担偏重。建议合并为 6–12 个棋子");
    else add("ok", SIDES[s] + "部队 " + n + " 个");
    if (!p.forces[s].intent) add("warn", SIDES[s] + "未填写作战意图，推演时指挥员缺少决策依据");
  }
  for (const s of ["red", "blue"]) {
    const items = p.objectives.items.filter(o => o.side === s);
    items.length ? add("ok", SIDES[s] + "有 " + items.length + " 项推演目标") : add("crit", SIDES[s] + "没有推演目标，无法判定胜负");
  }
  if (!p.objectives.items.some(o => o.kind === "hold" || o.kind === "defend")) add("warn", "没有地理目标（夺控/坚守），双方可能缺乏交战动机");
  const att = sc.attacker || "red";
  const ta = sideTotals(p.forces[att].units), td = sideTotals(p.forces[other(att)].units);
  if (ta.n && td.n) {
    const ratio = ta.atk / Math.max(0.1, td.def);
    if (ratio < 1) add("warn", "进攻方总攻击力仅为防御方防御力的 " + ratio.toFixed(2) + " 倍，进攻很难奏效");
    else if (ratio > 5) add("warn", "进攻方优势达 " + ratio.toFixed(1) + " 倍，推演可能一边倒");
    else add("ok", "总体兵力比 " + ratio.toFixed(2) + ":1（进攻方攻击力 ÷ 防御方防御力）");
  }
  const t = +sc.turns;
  if (t < 4) add("warn", "回合数少于 4，决策点不足"); else if (t > 16) add("warn", "回合数超过 16，单次推演可能超过一天"); else add("ok", "回合数 " + t + "，预计推演时长约 " + Math.round(t * 0.4 * 10) / 10 + "–" + Math.round(t * 0.7 * 10) / 10 + " 小时");
  if (p.rules.adjudication !== "CRT" && !p.forces.white.enabled) add("crit", "选择了专家裁决，但未设置白方裁判组");
  if (scheme && scheme.balance) {
    const b = scheme.balance;
    if (b.attWin > 0.8 || b.defWin > 0.8) add("warn", "估算胜率失衡（进攻方 " + Math.round(b.attWin * 100) + "%）。可调整兵力、回合数或目标分值");
    else add("ok", "估算胜率在可对抗区间（进攻方 " + Math.round(b.attWin * 100) + "%）");
  }
  return out;
}

/* ---------------- 方案生成 ---------------- */
function inputHash(p) { return hashStr(JSON.stringify([p.scenario, p.forces, p.objectives, p.rules])); }
function generateScheme(p, opts) {
  opts = opts || {};
  const prev = p.scheme;
  const mapSeed = opts.newMap || !prev ? hashStr(p.id + ":" + Date.now()) : prev.mapSeed;
  const map = genMap(p.scenario, mapSeed);
  const rnd = mulberry32(mapSeed ^ 0x9e3779b9);
  const placement = placeScheme(p, map, rnd);
  const scheme = {
    version: (prev ? prev.version : 0) + 1,
    generatedAt: new Date().toISOString(),
    inputHash: inputHash(p),
    mapSeed, map,
    objHex: placement.objHex,
    placements: placement.placements,
    events: buildEvents(p, rnd),
    aiInjects: prev ? prev.aiInjects || [] : [],
    aiReview: prev ? prev.aiReview || null : null,
  };
  scheme.balance = simulateBalance(p, placement, map);
  scheme.checks = designChecks(p, scheme);
  return scheme;
}

/* ============================================================
 * 推演引擎
 * ============================================================ */
function newGame(p) {
  const s = p.scheme;
  const units = {};
  for (const side of ["red", "blue"]) for (const u of p.forces[side].units) {
    const st = unitStats(u);
    units[u.id] = { id: u.id, side, name: u.name, type: u.type, echelon: u.echelon, hex: s.placements[u.id], steps: st.steps, maxSteps: st.steps, atk: st.atk, def: st.def, mv: st.mv, rng: st.rng, moved: false, attacked: false, dead: false };
  }
  const control = {};
  const att = p.scenario.attacker || "red";
  for (const id of Object.values(s.objHex)) control[id] = other(att);
  const g = {
    startedAt: new Date().toISOString(), turn: 1, phase: 0, units, control,
    vpHold: { red: 0, blue: 0 }, vpBonus: { red: 0, blue: 0 },
    log: [], history: [], flags: {}, next: {}, deckPos: 0, ended: false, view: "white", seq: 0,
  };
  pushLog(g, "white", "推演开始。" + p.scenario.startDTG + "，" + p.scenario.weather + "，电磁环境" + p.scenario.em + "。");
  g.history.push(snapshotStats(p, g));
  return g;
}
function pushLog(g, side, text) { g.log.unshift({ n: ++g.seq, turn: g.turn, phase: g.phase, side, text }); }
function aliveUnits(g, side) { return Object.values(g.units).filter(u => !u.dead && (!side || u.side === side)); }
function unitsAt(g, hex) { return aliveUnits(g).filter(u => u.hex === hex); }
function effAtk(p, g, u) {
  let a = u.atk * u.steps / u.maxSteps;
  if (p.rules.supply && !inSupply(p, g, u)) a /= 2;
  return round1(a);
}
function effDef(g, u) { return round1(u.def * u.steps / u.maxSteps); }
function inSupply(p, g, u) {
  if (isAirType(u.type) || u.type === "naval") return true;
  const map = p.scheme.map;
  const h = parseHex(u.hex); if (!h) return true;
  const edge = u.side === "blue" ? h.q <= 2 : h.q >= map.cols - 3;
  if (edge) return true;
  return aliveUnits(g, u.side).some(x => x.type === "log" && hexDist(x.hex, u.hex) <= 6);
}
function inCommand(p, g, u) {
  if (!p.rules.command) return true;
  const hqs = Object.values(g.units).filter(x => x.side === u.side && x.type === "hq");
  if (!hqs.length) return true;
  return hqs.some(h => !h.dead && hexDist(h.hex, u.hex) <= 4);
}
function curPhase(p, g) { return p.rules.phases[g.phase] || p.rules.phases[0]; }
function enemyZOC(p, g, side) {
  const z = new Set();
  if (!p.rules.zoc) return z;
  const { cols, rows } = p.scheme.map;
  for (const e of aliveUnits(g, other(side))) {
    if (isAirType(e.type) || e.type === "naval" || e.type === "log") continue;
    for (const n of neighbors(e.hex, cols, rows)) z.add(n);
  }
  return z;
}
function reachable(p, g, u) {
  const { cols, rows, hexes } = p.scheme.map;
  let mv = u.mv - (g.flags.comms === u.side ? 1 : 0);
  if (isAirType(u.type) && g.flags.grounded) return {};
  const zoc = (u.type === "sof" || isAirType(u.type)) ? new Set() : enemyZOC(p, g, u.side);
  const enemyAt = new Set(aliveUnits(g, other(u.side)).filter(e => !isAirType(e.type)).map(e => e.hex));
  const limit = p.rules.stacking || 2;
  const dist = { [u.hex]: 0 }; const q = [u.hex];
  while (q.length) {
    q.sort((a, b) => dist[a] - dist[b]); const cur = q.shift();
    if (cur !== u.hex && zoc.has(cur)) continue; // 进入控制区须停止
    for (const n of neighbors(cur, cols, rows)) {
      if (enemyAt.has(n) && !isAirType(u.type)) continue;
      const c = moveCost(u.type, hexes[n].t); if (c >= 99) continue;
      const nd = dist[cur] + c;
      if (nd <= mv && (dist[n] === undefined || nd < dist[n])) { dist[n] = nd; q.push(n); }
    }
  }
  const out = {};
  for (const id in dist) {
    if (id === u.hex) continue;
    if (enemyAt.has(id)) continue;
    const friendly = unitsAt(g, id).filter(x => x.side === u.side && !isAirType(x.type)).length;
    if (!isAirType(u.type) && friendly >= limit) continue;
    out[id] = dist[id];
  }
  return out;
}
function canAttackNow(p, g, u) {
  if (u.dead || u.attacked || u.atk <= 0) return false;
  if (isAirType(u.type) && g.flags.grounded) return false;
  if (g.flags.noAttack === u.id) return false;
  return true;
}
function targetsFor(p, g, u) {
  if (!canAttackNow(p, g, u)) return [];
  const hexes = new Set();
  for (const e of aliveUnits(g, other(u.side))) {
    if (hexDist(u.hex, e.hex) > Math.max(1, u.rng)) continue;
    if (g.flags.noUrbanFire && p.scheme.map.hexes[e.hex].t === "urban" && isRangedType(u.type)) continue;
    if (u.type === "ad" && !isAirType(e.type)) continue; // 防空只打空中目标
    hexes.add(e.hex);
  }
  return [...hexes];
}
function combatPreview(p, g, attackerIds, hex) {
  const map = p.scheme.map;
  const atts = attackerIds.map(id => g.units[id]).filter(Boolean);
  const defs = unitsAt(g, hex).filter(u => u.side !== (atts[0] && atts[0].side));
  const side = atts[0] ? atts[0].side : "red";
  const A = round1(atts.reduce((s, u) => s + effAtk(p, g, u), 0));
  const D = round1(Math.max(0.5, defs.reduce((s, u) => s + effDef(g, u), 0)));
  const ratio = A / D;
  const shifts = [];
  const terr = map.hexes[hex].t;
  const allAir = atts.every(u => isAirType(u.type));
  if (!allAir && TERRAIN[terr].shift) shifts.push({ v: TERRAIN[terr].shift, why: "目标地形：" + TERRAIN[terr].name });
  const hasGround = atts.some(u => !isRangedType(u.type) && !isAirType(u.type));
  const hasFire = atts.some(u => isRangedType(u.type) || isAirType(u.type));
  if (hasGround && hasFire) shifts.push({ v: 1, why: "火力支援与地面突击协同" });
  if (aliveUnits(g, side).some(x => x.type === "ew" && hexDist(x.hex, hex) <= 3)) shifts.push({ v: 1, why: "己方电子对抗压制" });
  if (atts.some(u => isAirType(u.type)) && aliveUnits(g, other(side)).some(x => x.type === "ad" && hexDist(x.hex, hex) <= 2)) shifts.push({ v: -1, why: "敌防空火力覆盖" });
  if (atts[0] && !inCommand(p, g, atts[0])) shifts.push({ v: -1, why: "主攻部队在指挥半径外" });
  if (p.rules.supply && atts.some(u => !inSupply(p, g, u))) shifts.push({ v: 0, why: "有部队脱离补给，攻击力已减半" });
  const base = ratio < 1 / 3 - 1e-9 ? 0 : oddsColumn(ratio);
  const col = clamp(base + shifts.reduce((s, x) => s + x.v, 0), 0, 7);
  return { atts, defs, A, D, ratio, base, shifts, col, terr, probs: resultProbabilities(col, p.rules.dice) };
}
function stepLoss(g, unit, k, lossTally) {
  for (let i = 0; i < k && !unit.dead; i++) {
    unit.steps--; lossTally[unit.side] = (lossTally[unit.side] || 0) + 1;
    if (unit.steps <= 0) { unit.dead = true; unit.hex = null; }
  }
}
function retreat(p, g, unit, fromHex, lossTally) {
  const { cols, rows, hexes } = p.scheme.map;
  const enemyAt = new Set(aliveUnits(g, other(unit.side)).map(e => e.hex));
  const zoc = enemyZOC(p, g, unit.side);
  const opts = neighbors(unit.hex, cols, rows).filter(n => moveCost(unit.type, hexes[n].t) < 99 && !enemyAt.has(n) && hexDist(n, fromHex) > hexDist(unit.hex, fromHex));
  opts.sort((a, b) => (zoc.has(a) ? 1 : 0) - (zoc.has(b) ? 1 : 0));
  if (!opts.length) { stepLoss(g, unit, 1, lossTally); return "无路可退，额外损失 1 步"; }
  unit.hex = opts[0]; return "退至 " + opts[0];
}
function resolveCombat(p, g, attackerIds, hex, forced) {
  const pv = combatPreview(p, g, attackerIds, hex);
  const roll = rollDice(p.rules.dice);
  let res = crtLookup(pv.col, roll.die);
  const crtRes = res;
  if (forced && RESULTS[forced]) res = forced;
  const side = pv.atts[0].side;
  const lossTally = {};
  const notes = [];
  const melee = pv.atts.filter(u => hexDist(u.hex, hex) === 1 && !isRangedType(u.type) && !isAirType(u.type));
  const lead = melee[0] || pv.atts[0];
  const firstDef = pv.defs.slice().sort((a, b) => b.steps - a.steps)[0];
  const aLoss = k => { const tgt = melee.length ? melee : []; if (!tgt.length) { notes.push("远程火力打击，进攻方无损失"); return; } stepLoss(g, tgt.slice().sort((a, b) => b.steps - a.steps)[0], k, lossTally); };
  switch (res) {
    case "A2": aLoss(2); break;
    case "A1": aLoss(1); break;
    case "AR": if (melee.length) melee.forEach(u => notes.push(u.name + retreat(p, g, u, hex, lossTally))); else notes.push("远程火力打击未奏效"); break;
    case "EX": aLoss(1); if (firstDef) stepLoss(g, firstDef, 1, lossTally); break;
    case "DR": pv.defs.forEach(u => notes.push(u.name + retreat(p, g, u, lead.hex || hex, lossTally))); break;
    case "D1": if (firstDef) stepLoss(g, firstDef, 1, lossTally); break;
    case "D1R": if (firstDef) stepLoss(g, firstDef, 1, lossTally); pv.defs.filter(u => !u.dead).forEach(u => notes.push(u.name + retreat(p, g, u, lead.hex || hex, lossTally))); break;
    case "D2": if (firstDef) { stepLoss(g, firstDef, 2, lossTally); } break;
  }
  // 战后占领
  if (!unitsAt(g, hex).some(u => u.side !== side) && melee.length && !melee[0].dead && p.scheme.map.hexes[hex].t !== "water") {
    melee[0].hex = hex; notes.push(melee[0].name + "乘胜占领 " + hex);
  }
  pv.atts.forEach(u => u.attacked = true);
  g.losses = g.losses || { red: 0, blue: 0 };
  g.losses.red += lossTally.red || 0; g.losses.blue += lossTally.blue || 0;
  const r = RESULTS[res];
  const text = pv.atts.map(u => u.name).join("、") + " 攻击 " + hex + "（" + pv.defs.map(u => u.name).join("、") + "），兵力比 " + pv.A + ":" + pv.D + "，查 " + ODDS_COLS[pv.col] + " 栏，骰 " + roll.faces.join("+") + (p.rules.dice === "2d6" ? "→" + roll.die : "") + "：" + r.name + (forced && forced !== crtRes ? "（白方改判，原结果 " + RESULTS[crtRes].name + "）" : "") + "。" + notes.join("；");
  pushLog(g, side, text);
  return { res, roll, pv, notes, crtRes };
}
function updateControl(p, g) {
  for (const hex of Object.keys(g.control)) {
    const occ = unitsAt(g, hex).filter(u => !isAirType(u.type));
    const sides = new Set(occ.map(u => u.side));
    if (sides.size === 1) g.control[hex] = [...sides][0];
  }
}
function computeVP(p, g, final) {
  const vp = { red: g.vpHold.red + g.vpBonus.red, blue: g.vpHold.blue + g.vpBonus.blue };
  const losses = g.losses || { red: 0, blue: 0 };
  for (const o of p.objectives.items) {
    if (o.kind === "destroy") vp[o.side] += (losses[other(o.side)] || 0) * (+o.vp || 0);
    if (o.kind === "protect" && final) {
      const max = Object.values(g.units).filter(u => u.side === o.side).reduce((s, u) => s + u.maxSteps, 0) || 1;
      if ((losses[o.side] || 0) / max < 0.3) vp[o.side] += +o.vp || 0;
    }
  }
  return vp;
}
function snapshotStats(p, g) {
  const st = side => aliveUnits(g, side).reduce((s, u) => s + u.steps, 0);
  const vp = computeVP(p, g, false);
  return { turn: g.turn, red: st("red"), blue: st("blue"), vpRed: vp.red, vpBlue: vp.blue };
}
function drawEvent(p, g) {
  const freq = { "低": 0.2, "中": 0.4, "高": 0.65 }[p.rules.events] || 0;
  const injects = (p.scheme.aiInjects || []).filter(i => +i.turn === g.turn);
  const fired = [];
  for (const i of injects) { fired.push({ title: i.title, text: i.detail, effect: "none", ai: true }); }
  if (Math.random() < freq && p.scheme.events.length) { fired.push(p.scheme.events[g.deckPos % p.scheme.events.length]); g.deckPos++; }
  for (const ev of fired) applyEvent(p, g, ev);
  return fired;
}
function applyEvent(p, g, ev) {
  const rs = Math.random() < 0.5 ? "red" : "blue";
  let extra = "";
  switch (ev.effect) {
    case "grounded": g.next.grounded = true; break;
    case "comms": g.next.comms = rs; extra = "（受影响：" + SIDES[rs] + "）"; break;
    case "supplyDelay": { const u = aliveUnits(g, rs).sort((a, b) => b.atk - a.atk)[0]; if (u) { g.next.noAttack = u.id; extra = "（" + SIDES[rs] + u.name + "）"; } break; }
    case "noUrbanFire": g.next.noUrbanFire = true; break;
    case "reinforce": {
      const st = s => aliveUnits(g, s).reduce((a, u) => a + u.steps, 0);
      const weak = st("red") <= st("blue") ? "red" : "blue";
      const { cols, hexes } = p.scheme.map;
      const col = weak === "blue" ? 0 : cols - 1;
      const spot = Object.keys(hexes).find(id => hexes[id].q === col && hexes[id].t !== "water" && !unitsAt(g, id).length);
      if (spot) {
        const id = "r" + uid(); const s = unitStats({ type: "inf", echelon: "battalion", readiness: 90 });
        g.units[id] = { id, side: weak, name: "增援步兵营", type: "inf", echelon: "battalion", hex: spot, steps: s.steps, maxSteps: s.steps, atk: s.atk, def: s.def, mv: s.mv, rng: s.rng, moved: false, attacked: false, dead: false, reinforcement: true };
        extra = "（" + SIDES[weak] + "增援营进入 " + spot + "）";
      }
      break;
    }
  }
  pushLog(g, "white", (ev.ai ? "情况注入" : "事件") + "「" + ev.title + "」：" + ev.text + extra);
  g.lastEvents = (g.lastEvents || []).concat([{ title: ev.title, text: ev.text + extra, ai: !!ev.ai }]);
}
function advancePhase(p, g) {
  const ph = curPhase(p, g);
  if (ph.kind === "event") drawEvent(p, g);
  g.phase++;
  if (g.phase >= p.rules.phases.length) endTurn(p, g);
  else { const np = curPhase(p, g); if (np.kind === "admin") g.lastEvents = []; }
}
function endTurn(p, g) {
  updateControl(p, g);
  // 夺控要点每回合计分
  for (const o of p.objectives.items) {
    const hex = p.scheme.objHex[o.id]; if (!hex) continue;
    if (o.kind === "hold" && g.control[hex] === o.side) g.vpHold[o.side] += +o.vp || 0;
    if (o.kind === "defend" && +o.turn === g.turn && g.control[hex] === o.side) { g.vpBonus[o.side] += +o.vp || 0; pushLog(g, "white", SIDES[o.side] + "达成「" + o.title + "」，获得 " + o.vp + " 分"); }
  }
  g.history[g.history.length - 1] = snapshotStats(p, g);
  const vp = computeVP(p, g, false);
  pushLog(g, "white", "第 " + g.turn + " 回合结束。胜利点 红 " + vp.red + " : 蓝 " + vp.blue + "。");
  g.flags = g.next; g.next = {};
  for (const u of Object.values(g.units)) { u.moved = false; u.attacked = false; }
  const turns = +p.scenario.turns || 8;
  if (g.turn >= turns || !aliveUnits(g, "red").length || !aliveUnits(g, "blue").length) { finishGame(p, g); return; }
  g.turn++; g.phase = 0; g.lastEvents = [];
  g.history.push(snapshotStats(p, g));
}
function finishGame(p, g) {
  g.ended = true; g.endedAt = new Date().toISOString();
  const vp = computeVP(p, g, true);
  g.finalVP = vp;
  g.winner = vp.red > vp.blue ? "red" : vp.blue > vp.red ? "blue" : "draw";
  g.history[g.history.length - 1] = Object.assign(snapshotStats(p, g), { vpRed: vp.red, vpBlue: vp.blue });
  pushLog(g, "white", "推演结束。最终胜利点 红 " + vp.red + " : 蓝 " + vp.blue + "，" + (g.winner === "draw" ? "双方战平" : SIDES[g.winner] + "获胜") + "。");
}

/* ---------------- 导出 Markdown ---------------- */
function schemeMarkdown(p) {
  const sc = p.scenario, s = p.scheme, L = [];
  L.push("# " + (sc.title || p.name), "");
  L.push("> 兵棋方案 v" + s.version + " · 生成于 " + new Date(s.generatedAt).toLocaleString("zh-CN"), "");
  L.push("## 一、方案概要", "", "| 项 | 内容 |", "|---|---|");
  [["推演层级", sc.level], ["开始时间", sc.startDTG], ["回合数", sc.turns + " 回合，每回合 " + sc.hoursPerTurn + " 小时"], ["地图", s.map.cols + "×" + s.map.rows + " 六角格，每格 " + sc.kmPerHex + " 公里"], ["进攻方", SIDES[sc.attacker]], ["天候 / 电磁环境", sc.weather + " / " + sc.em], ["裁决方式", p.rules.adjudication + "，" + p.rules.dice], ["信息条件", p.rules.fog]].forEach(r => L.push("| " + r[0] + " | " + r[1] + " |"));
  L.push("", "## 二、想定", "", sc.background || "（未填写）", "");
  L.push("## 三、推演目的与研究问题", "", "目的：" + p.objectives.purposes.join("、"), "", p.objectives.questions || "", "");
  L.push("## 四、兵力编成", "");
  for (const side of ["red", "blue"]) {
    const f = p.forces[side];
    L.push("### " + f.name, "", "作战意图：" + (f.intent || "—"), "", "| 部队 | 兵种 | 梯队 | 攻 | 防 | 机动 | 战斗步 | 初始位置 |", "|---|---|---|---|---|---|---|---|");
    f.units.forEach(u => { const st = unitStats(u); L.push("| " + u.name + " | " + UNIT_TYPES[u.type].name + " | " + ECHELONS[u.echelon].name + " | " + st.atk + " | " + st.def + " | " + st.mv + " | " + st.steps + " | " + s.placements[u.id] + " |"); });
    L.push("");
  }
  L.push("## 五、推演目标与胜负判定", "", "| 方 | 目标 | 类型 | 位置 | 分值 |", "|---|---|---|---|---|");
  p.objectives.items.forEach(o => L.push("| " + SIDES[o.side] + " | " + o.title + " | " + OBJ_KINDS[o.kind].name + " | " + (s.objHex[o.id] || "—") + " | " + o.vp + (o.kind === "hold" ? "/回合" : o.kind === "destroy" ? "/步" : "") + " |"));
  L.push("", "终局比较双方胜利点，高者获胜。", "");
  L.push("## 六、回合流程", "");
  p.rules.phases.forEach((ph, i) => L.push((i + 1) + ". " + ph.name));
  L.push("", "## 七、战斗结果表（CRT）", "", "| 骰点 | " + ODDS_COLS.join(" | ") + " |", "|---|" + ODDS_COLS.map(() => "---").join("|") + "|");
  for (let d = 1; d <= 6; d++) L.push("| " + d + " | " + ODDS_COLS.map((c, ci) => crtLookup(ci, d)).join(" | ") + " |");
  L.push("", Object.entries(RESULTS).map(([k, v]) => k + "=" + v.desc).join("；"), "");
  L.push("## 八、地形效果", "", "| 地形 | 机动消耗 | 防御栏移 | 说明 |", "|---|---|---|---|");
  Object.values(TERRAIN).forEach(t => L.push("| " + t.name + " | " + (t.cost >= 99 ? "不可通行" : t.cost) + " | " + (t.shift || "—") + " | " + t.note + " |"));
  L.push("", "## 九、事件卡", "");
  s.events.forEach((e, i) => L.push((i + 1) + ". **" + e.title + "**：" + e.text));
  (s.aiInjects || []).forEach(i => L.push("- 第 " + i.turn + " 回合 情况注入 **" + i.title + "**：" + i.detail));
  L.push("", "## 十、平衡性估算", "", "蒙特卡洛模拟 " + s.balance.N + " 局：进攻方达成目标 " + Math.round(s.balance.attWin * 100) + "%，防御方守住 " + Math.round(s.balance.defWin * 100) + "%，胶着 " + Math.round(s.balance.draw * 100) + "%。", "");
  L.push("## 十一、设计检查", "");
  s.checks.forEach(c => L.push("- [" + (c.lvl === "ok" ? "x" : " ") + "] " + c.text));
  if (p.game && p.game.ended) {
    L.push("", "## 十二、推演记录", "");
    p.game.log.slice().reverse().forEach(l => L.push("- 第" + l.turn + "回合 [" + SIDES[l.side] + "] " + l.text));
  }
  return L.join("\n");
}
