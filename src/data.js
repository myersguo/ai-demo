/* ============================================================
 * 静态数据：兵种、地形、梯队、模板、术语表
 * ============================================================ */
const SIDES = { red: "红方", blue: "蓝方", white: "白方" };

// atk 攻击力 / def 防御力 / mv 机动力（格/回合）/ rng 火力射程（格）
const UNIT_TYPES = {
  inf:   { name: "步兵",     atk: 4, def: 5, mv: 3,  rng: 1, sym: "inf",  note: "占领与坚守要点的基本力量，城市和山地中防御效果最好。" },
  mech:  { name: "机械化步兵", atk: 5, def: 5, mv: 5, rng: 1, sym: "mech", note: "兼顾机动与防御，平原地形效率最高。" },
  armor: { name: "装甲",     atk: 7, def: 6, mv: 6,  rng: 1, sym: "armor", note: "突击主力。进入山地、城市、沼泽代价高。" },
  art:   { name: "炮兵",     atk: 6, def: 2, mv: 3,  rng: 3, sym: "art",  note: "可在 2–3 格外实施火力支援，自身防御薄弱。" },
  ad:    { name: "防空",     atk: 2, def: 3, mv: 3,  rng: 2, sym: "ad",   note: "2 格内掩护友军，敌航空兵在其范围内突击时降一栏。" },
  air:   { name: "航空兵",   atk: 8, def: 2, mv: 12, rng: 6, sym: "air",  note: "不受地形影响，天候恶劣时停飞；被防空覆盖时效果下降。" },
  helo:  { name: "陆航",     atk: 6, def: 2, mv: 9,  rng: 2, sym: "helo", note: "低空机动快，不受控制区限制，惧怕防空。" },
  sof:   { name: "特种作战", atk: 3, def: 3, mv: 5,  rng: 1, sym: "sof",  note: "无视敌控制区，适合夺控关键节点或侦察。" },
  naval: { name: "水面舰艇", atk: 6, def: 6, mv: 8,  rng: 3, sym: "naval",note: "只能在水域机动，可对近岸目标火力支援。" },
  hq:    { name: "指挥所",   atk: 1, def: 3, mv: 4,  rng: 1, sym: "hq",   note: "指挥半径 4 格；半径外的己方部队作战降一栏。" },
  log:   { name: "后勤保障", atk: 0, def: 2, mv: 4,  rng: 1, sym: "log",  note: "补给源。脱离补给的部队攻击力减半。" },
  ew:    { name: "电子对抗", atk: 0, def: 2, mv: 4,  rng: 3, sym: "ew",   note: "3 格内的己方进攻升一栏（压制敌通信）。" },
};
const ECHELONS = {
  company:  { name: "连", mark: "I",  mult: 0.5, steps: 1 },
  battalion:{ name: "营", mark: "II", mult: 1,   steps: 2 },
  brigade:  { name: "旅", mark: "X",  mult: 2,   steps: 3 },
  division: { name: "师", mark: "XX", mult: 4,   steps: 4 },
};
const TERRAIN = {
  plain:    { name: "平原", cost: 1, defMult: 1,   shift: 0,  note: "开阔，利于装甲机动" },
  hill:     { name: "丘陵", cost: 2, defMult: 1.5, shift: -1, note: "视野好，防御方降一栏" },
  forest:   { name: "森林", cost: 2, defMult: 1.5, shift: -1, note: "遮蔽隐蔽，防御方降一栏" },
  marsh:    { name: "水网稻田", cost: 3, defMult: 1.5, shift: -1, note: "重装备难以通行" },
  urban:    { name: "城镇", cost: 1, defMult: 2,   shift: -2, note: "巷战消耗大，防御方降两栏" },
  mountain: { name: "山地", cost: 3, defMult: 2,   shift: -2, note: "机动极慢，防御方降两栏" },
  water:    { name: "水域", cost: 99, defMult: 1,  shift: 0,  note: "地面部队不可进入" },
};
// 场景地形选项 → 地图生成权重
const TERRAIN_OPTIONS = [
  { key: "平原", w: { plain: 6 } },
  { key: "丘陵", w: { hill: 4 } },
  { key: "山地", w: { mountain: 3, hill: 1 } },
  { key: "森林", w: { forest: 3 } },
  { key: "城镇", w: { urban: 2 } },
  { key: "水网", w: { marsh: 3 } },
  { key: "海岸", w: {} },
  { key: "岛屿", w: {} },
];
const LEVELS = {
  "战术": { hoursPerTurn: 2,  kmPerHex: 1,  turns: 8,  cols: 16, rows: 11, echelon: "battalion", desc: "营连级，关注单次战斗与火力协同" },
  "战役": { hoursPerTurn: 12, kmPerHex: 10, turns: 10, cols: 18, rows: 12, echelon: "brigade",   desc: "旅师级，关注兵力部署、机动与后勤" },
  "战略": { hoursPerTurn: 72, kmPerHex: 50, turns: 8,  cols: 16, rows: 11, echelon: "division",  desc: "战区级，关注力量对比、决策与时间" },
};
const PURPOSES = ["检验作战方案", "比较多个行动方案", "训练指挥员决策", "发现能力短板", "研究新战法", "教学演示"];
const WEATHER = ["晴", "多云", "雨", "大雾", "大风/高海况", "雪"];
const EM_ENV = ["一般", "复杂", "强对抗"];
const OBJ_KINDS = {
  hold:    { name: "夺控要点", desc: "回合结束时占领该格，每回合获得分值" },
  destroy: { name: "歼灭敌军", desc: "每歼敌 1 个战斗步获得分值" },
  defend:  { name: "坚守至时限", desc: "直至指定回合仍控制该格，一次性获得分值" },
  protect: { name: "保存实力", desc: "终局时己方损失低于 30% 获得分值" },
};
const DEFAULT_PHASES = [
  { key: "brief",   name: "态势通报", side: "white", kind: "admin" },
  { key: "redMove", name: "红方机动", side: "red",   kind: "move" },
  { key: "redFire", name: "红方作战", side: "red",   kind: "combat" },
  { key: "blueMove",name: "蓝方机动", side: "blue",  kind: "move" },
  { key: "blueFire",name: "蓝方作战", side: "blue",  kind: "combat" },
  { key: "adjud",   name: "裁决与事件", side: "white", kind: "event" },
];
// 战斗结果（从进攻方最坏到最好）
const RESULTS = {
  A2:  { name: "攻方重创", desc: "进攻方损失 2 步", good: "d" },
  A1:  { name: "攻方受挫", desc: "进攻方损失 1 步", good: "d" },
  AR:  { name: "攻方退却", desc: "进攻方后退 1 格", good: "d" },
  NE:  { name: "胶着",     desc: "双方无变化", good: "" },
  EX:  { name: "交换",     desc: "双方各损失 1 步", good: "" },
  DR:  { name: "守方退却", desc: "防御方后退 1 格", good: "a" },
  D1:  { name: "守方受挫", desc: "防御方损失 1 步", good: "a" },
  D1R: { name: "守方溃退", desc: "防御方损失 1 步并后退", good: "a" },
  D2:  { name: "守方重创", desc: "防御方损失 2 步", good: "a" },
};
const RESULT_ORDER = ["A2", "A1", "AR", "NE", "EX", "DR", "D1", "D1R", "D2"];
const ODDS_COLS = ["1:3", "1:2", "1:1", "1.5:1", "2:1", "3:1", "4:1", "5:1+"];
const ODDS_VALUES = [1 / 3, 1 / 2, 1, 1.5, 2, 3, 4, 5];

const EVENT_LIBRARY = [
  { id: "wx",    title: "天候转坏",   text: "锋面过境，能见度骤降。本回合航空兵、陆航不能行动。", effect: "grounded", w: 3 },
  { id: "comms", title: "通信中断",   text: "受敌电子干扰，一方指挥链路中断。随机一方下回合全部部队机动力 −1。", effect: "comms", w: 3 },
  { id: "supply",title: "补给延误",   text: "前送道路受阻。随机一方本回合攻击力最高的部队下回合不能进攻。", effect: "supplyDelay", w: 2 },
  { id: "intel", title: "情报误判",   text: "上级通报的敌情与实际不符。裁判向随机一方公布一条错误敌情（口头）。", effect: "none", w: 2 },
  { id: "civ",   title: "民众疏散",   text: "作战地域出现大量疏散民众。城镇格本回合禁止火力打击。", effect: "noUrbanFire", w: 2 },
  { id: "reinf", title: "增援抵达",   text: "预备队按计划前出。劣势一方在己方展开区获得 1 个营级步兵。", effect: "reinforce", w: 2 },
  { id: "morale",title: "士气高涨",   text: "前一回合战果鼓舞士气。领先一方下回合一次进攻升一栏。", effect: "none", w: 1 },
  { id: "cyber", title: "网络攻击",   text: "关键信息系统遭攻击。裁判判定受影响一方公开一个部队位置。", effect: "none", w: 1 },
];

const GLOSSARY = [
  ["兵棋", "用地图、棋子和规则模拟作战的工具。它不预测胜负，而是帮助参演人员在对抗中发现问题。"],
  ["想定", "推演的起点：发生了什么、在哪里、何时开始、双方处于什么态势。相当于推演的“剧本背景”。"],
  ["红方 / 蓝方 / 白方", "对抗双方分别称红、蓝方；白方是裁判组，负责掌握规则、裁决战果、注入事件。"],
  ["回合", "推演时间的基本单位。每回合代表一段真实时间（如 12 小时），按固定阶段顺序行动。"],
  ["六角格", "把地图划分为蜂窝状格子，每格代表固定距离，便于计算机动和距离。格号 0806 表示第 8 列第 6 行。"],
  ["战斗步", "部队的“血量”。营级 2 步、旅级 3 步、师级 4 步，损失全部战斗步即失去战斗力。"],
  ["兵力比", "进攻方攻击力之和 ÷ 防御方防御力（含地形加成）。传统经验是进攻至少需要 3:1。"],
  ["战斗结果表（CRT）", "把兵力比和骰子点数对应到战斗结果的表格。兵力比越高，好结果的概率越大，但始终存在不确定性。"],
  ["栏移", "地形、支援、电子战等因素让查表位置左右移动一栏，用来体现兵力比之外的战场因素。"],
  ["控制区（ZOC）", "部队周围一圈格子。敌方部队进入控制区必须停止机动，体现部队对周边的火力控制。"],
  ["胜利点（VP）", "衡量推演目标达成程度的分数。夺控要点、歼敌、坚守都可以得分，终局比较双方得分。"],
  ["双盲推演", "双方只能看到自己部队和已发现的敌军，更接近真实的战场迷雾。开放推演则全部可见。"],
  ["事件卡 / 情况注入", "白方在推演中投放的突发情况（天候、通信中断、增援等），检验指挥员的应变能力。"],
  ["复盘（AAR）", "推演结束后的总结：发生了什么、为什么、学到了什么。兵棋的价值主要在复盘。"],
];

/* ------------------------------------------------------------
 * 项目模板（全部为虚构地名与番号）
 * ------------------------------------------------------------ */
function U(name, type, echelon, readiness) {
  return { id: uid(), name, type, echelon, readiness: readiness || 90, hex: "" };
}
const TEMPLATES = {
  blank: {
    label: "空白项目", desc: "从零开始，逐步填写。",
    build: () => ({
      scenario: { title: "", background: "", level: "战役", terrain: ["平原", "丘陵"], weather: "晴", em: "一般", startDTG: "D日 06:00", turns: 10, hoursPerTurn: 12, kmPerHex: 10, cols: 18, rows: 12, attacker: "red" },
      forces: { red: { name: "红方", intent: "", units: [] }, blue: { name: "蓝方", intent: "", units: [] }, white: { enabled: true, name: "导调裁判组" } },
      objectives: { purposes: ["训练指挥员决策"], questions: "", items: [] },
    }),
  },
  coastal: {
    label: "滨海要地防御", desc: "战役级 · 蓝方登陆突击，红方依托港口城镇防御。",
    build: () => ({
      scenario: {
        title: "“海棠-26”滨海要地防御推演", level: "战役", terrain: ["海岸", "平原", "丘陵", "城镇"], weather: "多云", em: "复杂",
        startDTG: "D日 04:00", turns: 10, hoursPerTurn: 12, kmPerHex: 10, cols: 18, rows: 12, attacker: "blue",
        background: "虚构的滨海地区“青澜湾”拥有一座深水港和连接内陆的交通枢纽“石桥镇”。蓝方集结两栖力量，企图在D日拂晓于青澜湾北岸登陆，夺取港口并向内陆纵深发展。红方以一个加强合成旅担负滨海防御任务，预备队位于内陆 40 公里处，需在 24 小时内完成前出。天气多云转阴，海况 3 级，电磁环境复杂，双方均存在通信干扰。",
      },
      forces: {
        red: { name: "红方 滨海防御群", intent: "依托港口城镇和沿岸丘陵坚守要点，迟滞敌登陆，待预备队到达后实施反击。", units: [
          U("第1合成营", "mech", "battalion"), U("第2合成营", "mech", "battalion"), U("守备步兵营", "inf", "battalion", 95),
          U("坦克营", "armor", "battalion"), U("炮兵群", "art", "brigade", 85), U("防空营", "ad", "battalion"),
          U("旅指挥所", "hq", "battalion"), U("综合保障营", "log", "battalion"),
        ]},
        blue: { name: "蓝方 两栖突击群", intent: "以海空火力掩护，快速夺取港口和石桥镇，建立稳固登陆场。", units: [
          U("陆战第1营", "inf", "battalion"), U("陆战第2营", "inf", "battalion"), U("两栖装甲营", "armor", "battalion", 85),
          U("机械化营", "mech", "battalion"), U("舰炮支援编队", "naval", "brigade"), U("舰载航空兵", "air", "brigade"),
          U("陆航营", "helo", "battalion"), U("特战分队", "sof", "company"), U("前进指挥所", "hq", "battalion"),
        ]},
        white: { enabled: true, name: "导调裁判组" },
      },
      objectives: {
        purposes: ["检验作战方案", "训练指挥员决策"],
        questions: "1. 现有兵力能否在预备队到达前守住港口？\n2. 防空力量部署对敌航空兵的抑制效果如何？\n3. 反击时机选择对最终态势的影响。",
        items: [
          { id: uid(), side: "blue", kind: "hold", title: "夺取青澜港", hex: "", vp: 3, turn: 0 },
          { id: uid(), side: "blue", kind: "hold", title: "控制石桥镇交通枢纽", hex: "", vp: 2, turn: 0 },
          { id: uid(), side: "red", kind: "defend", title: "坚守石桥镇至第10回合", hex: "", vp: 8, turn: 10 },
          { id: uid(), side: "red", kind: "destroy", title: "歼灭登陆之敌", hex: "", vp: 1, turn: 0 },
          { id: uid(), side: "blue", kind: "destroy", title: "削弱守备力量", hex: "", vp: 1, turn: 0 },
        ],
      },
    }),
  },
  mountain: {
    label: "山地遭遇战", desc: "战术级 · 双方先头营在山口附近相遇，争夺隘口。",
    build: () => ({
      scenario: {
        title: "“雁门-3”山地隘口遭遇战", level: "战术", terrain: ["山地", "丘陵", "森林"], weather: "大雾", em: "一般",
        startDTG: "D日 05:30", turns: 8, hoursPerTurn: 2, kmPerHex: 1, cols: 16, rows: 11, attacker: "red",
        background: "虚构山地“松岭”中段的隘口“风口垭”是南北唯一的公路通道。红蓝双方先头部队在大雾中相向机动，预计在 06:00 前后于隘口附近接触。先控制隘口两侧制高点的一方，将为后续主力通过创造条件。",
      },
      forces: {
        red: { name: "红方 先遣支队", intent: "抢占风口垭及东侧高地，掩护主力通过。", units: [
          U("先遣步兵营", "inf", "battalion"), U("山地步兵连", "inf", "company", 95), U("迫榴炮连", "art", "company"), U("侦察特战分队", "sof", "company"), U("营指挥所", "hq", "company"),
        ]},
        blue: { name: "蓝方 前卫营", intent: "夺控隘口，阻止敌方通过。", units: [
          U("前卫机步营", "mech", "battalion"), U("坦克连", "armor", "company"), U("炮兵连", "art", "company"), U("陆航分队", "helo", "company"),
        ]},
        white: { enabled: true, name: "导调裁判组" },
      },
      objectives: {
        purposes: ["训练指挥员决策", "研究新战法"],
        questions: "1. 大雾条件下侦察力量的价值。\n2. 抢占制高点与保持机动的取舍。",
        items: [
          { id: uid(), side: "red", kind: "hold", title: "控制风口垭", hex: "", vp: 3, turn: 0 },
          { id: uid(), side: "blue", kind: "hold", title: "控制风口垭", hex: "", vp: 3, turn: 0 },
          { id: uid(), side: "red", kind: "protect", title: "保存先遣支队实力", hex: "", vp: 4, turn: 0 },
          { id: uid(), side: "blue", kind: "destroy", title: "歼灭先遣之敌", hex: "", vp: 1, turn: 0 },
        ],
      },
    }),
  },
  urban: {
    label: "城市要点争夺", desc: "战术级 · 红方进攻城区三处关键设施。",
    build: () => ({
      scenario: {
        title: "“磐石-7”城区要点争夺", level: "战术", terrain: ["城镇", "平原", "水网"], weather: "雨", em: "强对抗",
        startDTG: "D+2日 22:00", turns: 8, hoursPerTurn: 2, kmPerHex: 1, cols: 16, rows: 11, attacker: "red",
        background: "虚构城市“河坊”被一条运河分为东西两区。蓝方控制西区的电厂、广播中心和运河大桥。红方奉命在夜间发起进攻，于次日拂晓前夺取三处设施，并尽量减少对城市基础设施的破坏。",
      },
      forces: {
        red: { name: "红方 城区突击群", intent: "夜间多路突入，先夺大桥，再分割夺取电厂与广播中心。", units: [
          U("突击步兵第1营", "inf", "battalion"), U("突击步兵第2营", "inf", "battalion"), U("坦克连", "armor", "company"), U("炮兵营", "art", "battalion"), U("特战连", "sof", "company"), U("电子对抗分队", "ew", "company"), U("群指挥所", "hq", "company"),
        ]},
        blue: { name: "蓝方 城防分队", intent: "逐街逐屋抵抗，确保三处设施至少守住两处。", units: [
          U("城防步兵营", "inf", "battalion", 85), U("警备步兵连", "inf", "company"), U("机步连", "mech", "company"), U("迫炮连", "art", "company"), U("城防指挥所", "hq", "company"),
        ]},
        white: { enabled: true, name: "导调裁判组" },
      },
      objectives: {
        purposes: ["检验作战方案", "发现能力短板"],
        questions: "1. 夜间城市作战中电子对抗的作用。\n2. 附带损伤约束下的火力运用。",
        items: [
          { id: uid(), side: "red", kind: "hold", title: "夺取运河大桥", hex: "", vp: 2, turn: 0 },
          { id: uid(), side: "red", kind: "hold", title: "夺取电厂", hex: "", vp: 2, turn: 0 },
          { id: uid(), side: "red", kind: "hold", title: "夺取广播中心", hex: "", vp: 2, turn: 0 },
          { id: uid(), side: "blue", kind: "defend", title: "守住广播中心至终局", hex: "", vp: 6, turn: 8 },
          { id: uid(), side: "blue", kind: "destroy", title: "杀伤突击之敌", hex: "", vp: 1, turn: 0 },
        ],
      },
    }),
  },
};
function defaultRules(level) {
  return {
    phases: DEFAULT_PHASES.map(p => ({ ...p })),
    dice: "1d6",
    adjudication: "CRT",
    fog: "开放",
    zoc: true,
    supply: true,
    command: true,
    events: "中",
    stacking: level === "战略" ? 3 : 2,
    airWeather: true,
  };
}
