/* Browser application. Data and app stay in separate script tags so malformed
   data can fail with a visible guard instead of leaving a blank page. */

const $ = (id) => document.getElementById(id);

if (typeof CONFIG !== "object" || typeof CATEGORIES !== "object" ||
    typeof LOGS !== "object" || typeof e !== "function") {
  const banner = document.createElement("div");
  banner.className = "alert";
  banner.textContent = "データを読み込めません。data/ 配下の直近の編集を確認してください。";
  document.body.prepend(banner);
  throw new Error("open-daily data failed to load");
}

const DAY_MIN = { start: CONFIG.dayStart * 60, end: CONFIG.dayEnd * 60 };
const FRAME_MIN = DAY_MIN.end - DAY_MIN.start;
const LOG_DAYS = Object.keys(LOGS).sort();
const LATEST_DAY = LOG_DAYS.at(-1);

const themeButton = $("theme");
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "☾" : "☀";
  themeButton.setAttribute("aria-label", `${theme === "dark" ? "ダーク" : "ライト"}表示。配色を切り替える`);
}
setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
themeButton.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

function parseMin(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function fmtDur(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  return hours ? `${hours}h` : `${rest}m`;
}

function fmtDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fmtShortDate(iso) {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return fmtDate(date);
}

function effectiveToday() {
  const now = new Date();
  const today = fmtDate(now);
  return now.getHours() < CONFIG.dayEnd - 24 ? addDays(today, -1) : today;
}

function homeDay() {
  return CONFIG.sampleMode && LATEST_DAY ? LATEST_DAY : effectiveToday();
}

function nowMinFor(dateISO) {
  if (dateISO !== effectiveToday()) return null;
  const now = new Date();
  let minutes = now.getHours() * 60 + now.getMinutes();
  if (now.getHours() < CONFIG.dayEnd - 24) minutes += 24 * 60;
  return minutes;
}

function normalize(dateISO) {
  const entries = [];
  let skipped = 0;
  for (const entry of LOGS[dateISO] || []) {
    const startMin = parseMin(entry.start);
    const endMin = parseMin(entry.end);
    if (startMin == null || endMin == null || endMin <= startMin || !CATEGORIES[entry.cat]) {
      console.warn("open-daily: invalid entry ignored", dateISO, entry);
      skipped += 1;
      continue;
    }
    entries.push({ ...entry, startMin, endMin, dur: endMin - startMin });
  }
  entries.sort((left, right) => left.startMin - right.startMin || right.endMin - left.endMin);
  return { entries, skipped };
}

function assignLanes(entries) {
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const entry of group) {
      let lane = laneEnds.findIndex((end) => end <= entry.startMin);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = entry.endMin;
      entry.lane = lane;
    }
    for (const entry of group) entry.lanes = laneEnds.length;
    group = [];
  };
  for (const entry of entries) {
    if (group.length && entry.startMin >= groupEnd) flush();
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.endMin);
  }
  if (group.length) flush();
}

const tip = $("tip");

function showTip(entry, anchor) {
  tip.textContent = "";
  const time = document.createElement("div");
  time.className = "v";
  time.textContent = `${entry.start} – ${entry.end}`;
  const duration = document.createElement("em");
  duration.textContent = fmtDur(entry.dur);
  time.appendChild(duration);

  const category = document.createElement("div");
  category.className = "c";
  category.style.setProperty("--cat", CATEGORIES[entry.cat].color);
  const key = document.createElement("i");
  key.className = "key";
  category.append(key, document.createTextNode(`${CATEGORIES[entry.cat].label} — ${entry.title}`));
  tip.append(time, category);

  if (entry.note) {
    const note = document.createElement("div");
    note.className = "n";
    note.textContent = entry.note;
    tip.appendChild(note);
  }

  tip.style.display = "block";
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = anchorRect.right + 10;
  let top = anchorRect.top;
  if (left + tipRect.width > innerWidth - 8) left = Math.max(8, anchorRect.left - tipRect.width - 10);
  if (top + tipRect.height > innerHeight - 8) top = innerHeight - tipRect.height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function hideTip() {
  tip.style.display = "none";
}

function renderTimeline(dateISO, entries) {
  const timeline = $("timeline");
  timeline.textContent = "";
  const frameStart = Math.min(DAY_MIN.start, ...entries.map((entry) => Math.floor(entry.startMin / 60) * 60));
  const frameEnd = Math.max(DAY_MIN.end, ...entries.map((entry) => Math.ceil(entry.endMin / 60) * 60));
  timeline.style.height = `${((frameEnd - frameStart) / 60) * CONFIG.hourPx}px`;

  for (let hour = frameStart / 60; hour <= frameEnd / 60; hour += 1) {
    const row = document.createElement("div");
    row.className = "hour";
    row.style.top = `${(hour - frameStart / 60) * CONFIG.hourPx}px`;
    const label = document.createElement("span");
    label.textContent = `${hour}:00`;
    row.appendChild(label);
    timeline.appendChild(row);
  }

  const area = document.createElement("div");
  area.className = "lane-area";
  timeline.appendChild(area);
  assignLanes(entries);

  for (const entry of entries) {
    const block = document.createElement("div");
    block.className = "block";
    block.tabIndex = 0;
    block.dataset.title = entry.title;
    block.style.setProperty("--cat", CATEGORIES[entry.cat].color);
    const top = ((entry.startMin - frameStart) / 60) * CONFIG.hourPx;
    const height = (entry.dur / 60) * CONFIG.hourPx;
    const width = 100 / entry.lanes;
    block.style.top = `${top}px`;
    block.style.height = `${Math.max(6, height - 2)}px`;
    block.style.left = `calc(${entry.lane * width}% + ${entry.lane ? 2 : 0}px)`;
    block.style.width = `calc(${width}% - 2px)`;
    if (height < 18) block.classList.add("sliver");
    else if (height < 34) block.classList.add("compact");

    const title = document.createElement("div");
    title.className = "t";
    title.textContent = entry.title;
    const range = document.createElement("div");
    range.className = "r";
    range.textContent = `${entry.start} – ${entry.end}`;
    if (entry.note) {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = ` · ${entry.note}`;
      range.appendChild(note);
    }
    block.append(title, range);
    block.setAttribute("aria-label", `${entry.start}から${entry.end} ${CATEGORIES[entry.cat].label} ${entry.title}`);
    block.addEventListener("pointerenter", () => showTip(entry, block));
    block.addEventListener("pointerleave", hideTip);
    block.addEventListener("focus", () => showTip(entry, block));
    block.addEventListener("blur", hideTip);
    area.appendChild(block);
  }

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-day";
    empty.innerHTML = "<div><b>この日の記録はまだありません</b>AI に時間の報告をすると、ここへ構造化されます。</div>";
    timeline.appendChild(empty);
  }

  const nowMin = nowMinFor(dateISO);
  if (nowMin != null && nowMin >= frameStart && nowMin <= frameEnd) {
    const line = document.createElement("div");
    line.className = "nowline";
    line.style.top = `${((nowMin - frameStart) / 60) * CONFIG.hourPx}px`;
    timeline.appendChild(line);
  }
}

function renderStats(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.dur, 0);
  const percent = Math.min(100, Math.round((total / FRAME_MIN) * 100));
  const hero = $("hero");
  hero.textContent = "";
  for (const segment of (total ? fmtDur(total) : "0h").split(" ")) {
    const match = /^(\d+)([hm])$/.exec(segment);
    hero.append(match[1]);
    const unit = document.createElement("small");
    unit.textContent = `${match[2]} `;
    hero.appendChild(unit);
  }
  $("herosub").textContent = `${CONFIG.dayStart}:00–${CONFIG.dayEnd}:00 の ${fmtDur(FRAME_MIN)} 枠中 · ${percent}%`;
  $("meterfill").style.width = `${percent}%`;
  $("meter").setAttribute("aria-label", `表示枠のうち${percent}%を記録`);

  const byCategory = {};
  for (const entry of entries) byCategory[entry.cat] = (byCategory[entry.cat] || 0) + entry.dur;
  const max = Math.max(1, ...Object.values(byCategory));
  const categories = $("cats");
  categories.textContent = "";
  for (const [key, definition] of Object.entries(CATEGORIES)) {
    if (!byCategory[key]) continue;
    const row = document.createElement("div");
    row.className = "catrow";
    row.style.setProperty("--cat", definition.color);
    const name = document.createElement("div");
    name.className = "name";
    const dot = document.createElement("i");
    dot.className = "dot";
    name.append(dot, document.createTextNode(definition.label));
    const value = document.createElement("div");
    value.className = "val";
    value.textContent = fmtDur(byCategory[key]);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${(byCategory[key] / max) * 100}%`;
    bar.appendChild(fill);
    row.append(name, value, bar);
    categories.appendChild(row);
  }
  if (!entries.length) categories.textContent = "記録なし";
  $("untracked").textContent = fmtDur(Math.max(0, FRAME_MIN - total));
}

function appendRefChips(container, refs) {
  for (const ref of refs || []) {
    const split = ref.indexOf(" ");
    if (split < 0) continue;
    const date = ref.slice(0, split);
    const title = ref.slice(split + 1);
    const button = document.createElement("button");
    button.className = "refchip";
    button.title = `${ref} へ移動`;
    button.textContent = `↩ ${fmtShortDate(date)} ${title}`;
    button.addEventListener("click", () => jumpToEntry(date, title));
    container.appendChild(button);
  }
}

function renderConditions(dateISO) {
  const panel = $("condpanel");
  const wrap = $("conds");
  const list = CONDITIONS?.[dateISO] || [];
  wrap.textContent = "";
  panel.hidden = !list.length;
  for (const item of list) {
    const row = document.createElement("div");
    row.className = `cond ${item.kind === "decision" ? "decision" : "condition"}`;
    const icon = document.createElement("span");
    icon.className = "ic";
    icon.textContent = item.kind === "decision" ? "↗" : "◌";
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = item.text;
    appendRefChips(body, item.refs);
    row.append(icon, body);
    wrap.appendChild(row);
  }
}

function renderTable(entries) {
  const body = $("logtable").tBodies[0];
  body.textContent = "";
  $("logsummary").textContent = `時間ログ · ${entries.length}件`;
  for (const entry of entries) {
    const row = document.createElement("tr");
    const time = document.createElement("td");
    time.className = "time";
    time.textContent = `${entry.start}–${entry.end}`;
    const category = document.createElement("td");
    const dot = document.createElement("i");
    dot.className = "dot";
    dot.style.setProperty("--cat", CATEGORIES[entry.cat].color);
    category.append(dot, document.createTextNode(CATEGORIES[entry.cat].label));
    const title = document.createElement("td");
    title.textContent = entry.title;
    const note = document.createElement("td");
    note.className = "note";
    note.textContent = entry.note || "";
    row.append(time, category, title, note);
    body.appendChild(row);
  }
}

function renderInbox(prefix, label, icon, items) {
  const box = $(`${prefix}box`);
  const list = Array.isArray(items) ? items : [];
  box.hidden = !list.length;
  if (!list.length) return;

  const summary = $(`${prefix}summary`);
  if (prefix === "reward") {
    const consumed = list.filter((item) => item.consumedAt != null).length;
    summary.textContent = `${label} · ${consumed}/${list.length}消化`;
  } else {
    summary.textContent = `${label} · ${list.length}`;
  }

  const wrap = $(`${prefix}list`);
  wrap.textContent = "";
  const sorted = list.slice().sort((left, right) => right.date.localeCompare(left.date));
  for (const item of sorted) {
    const row = document.createElement("div");
    row.className = "evidence-item";
    const itemIcon = document.createElement("span");
    itemIcon.className = "ic";
    itemIcon.textContent = icon;
    const body = document.createElement("div");
    body.className = "body";

    if (item.title) {
      const title = document.createElement("b");
      title.className = "ntitle";
      title.textContent = item.month ? `${item.month} · ${item.title}` : item.title;
      body.appendChild(title);
    }
    if (item.labels?.length) {
      const meta = document.createElement("div");
      meta.className = "rewardmeta";
      for (const value of item.labels) {
        const tag = document.createElement("span");
        tag.className = "labeltag";
        tag.textContent = value;
        meta.appendChild(tag);
      }
      const state = document.createElement("span");
      state.className = `rewardstate${item.consumedAt ? " done" : ""}`;
      state.textContent = item.consumedAt ? `消化済み ${fmtShortDate(item.consumedAt)}` : "未消化";
      meta.appendChild(state);
      body.appendChild(meta);
    }

    body.appendChild(document.createTextNode(item.text));
    if (item.items?.length) {
      const goals = document.createElement("ol");
      goals.className = "goalitems";
      for (const value of item.items) {
        const goal = document.createElement("li");
        goal.textContent = value;
        goals.appendChild(goal);
      }
      body.appendChild(goals);
    }
    if (item.review) {
      const review = document.createElement("div");
      review.className = "goalreview";
      const labelElement = document.createElement("b");
      labelElement.textContent = "月末評価：";
      review.append(labelElement, document.createTextNode(item.review));
      body.appendChild(review);
    }
    for (const [key, value] of Object.entries(item.cost || {})) {
      const cost = document.createElement("span");
      cost.className = "costtag";
      cost.textContent = `${key} ${value}`;
      body.appendChild(cost);
    }
    if (item.refs?.length) {
      const refs = document.createElement("div");
      appendRefChips(refs, item.refs);
      body.appendChild(refs);
    }
    row.append(itemIcon, body);
    wrap.appendChild(row);
  }
}

function renderRewardSettlements(rewards, settlements) {
  const box = $("rewardsettlementbox");
  const list = Array.isArray(settlements) ? settlements : [];
  box.hidden = !list.length;
  if (!list.length) return;

  const consumed = rewards.filter((item) => item.consumedAt != null);
  const used = new Set(list.flatMap((item) => item.rewards));
  const balance = Math.max(0, consumed.length * 500 - used.size * 500);
  $("rewardsettlementsummary").textContent = `相殺履歴 · 使用${used.size * 500}円枠 / 残り${balance}円枠`;
  const wrap = $("rewardsettlementlist");
  wrap.textContent = "";

  for (const item of list) {
    const row = document.createElement("div");
    row.className = "evidence-item";
    const icon = document.createElement("span");
    icon.className = "ic";
    icon.textContent = "🧾";
    const body = document.createElement("div");
    body.className = "body";
    const title = document.createElement("b");
    title.className = "ntitle";
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "rewardmeta";
    for (const value of [`${item.rewards.length * 500}円枠`, `相殺 ${fmtShortDate(item.settledAt || item.date)}`]) {
      const tag = document.createElement("span");
      tag.className = "rewardstate done";
      tag.textContent = value;
      meta.appendChild(tag);
    }
    body.append(title, meta, document.createTextNode(item.text));
    const targets = document.createElement("ul");
    targets.className = "settlementtargets";
    for (const reward of item.rewards) {
      const target = document.createElement("li");
      target.textContent = reward;
      targets.appendChild(target);
    }
    body.appendChild(targets);
    row.append(icon, body);
    wrap.appendChild(row);
  }
}

let current = null;

function renderChips() {
  const wrap = $("daychips");
  wrap.textContent = "";
  for (const day of LOG_DAYS) {
    const button = document.createElement("button");
    button.className = `chip${day === current ? " on" : ""}`;
    button.textContent = day;
    button.addEventListener("click", () => show(day));
    wrap.appendChild(button);
  }
}

function renderAlert(skipped) {
  document.querySelectorAll(".alert.warn").forEach((node) => node.remove());
  if (!skipped) return;
  const alert = document.createElement("div");
  alert.className = "alert warn";
  alert.textContent = `${skipped}件のエントリが書式エラーで非表示です。console を確認してください。`;
  document.querySelector("main").prepend(alert);
}

function show(dateISO) {
  hideTip();
  current = dateISO;
  if (location.hash.slice(1) !== dateISO) {
    try { history.replaceState(null, "", `#${dateISO}`); }
    catch { location.hash = dateISO; }
  }

  const date = new Date(`${dateISO}T12:00:00`);
  const label = $("datelabel");
  label.textContent = "";
  const year = document.createElement("span");
  year.className = "yr";
  year.textContent = date.getFullYear();
  label.append(year, document.createTextNode(date.toLocaleDateString("ja-JP", {
    month: "long", day: "numeric", weekday: "short",
  })));

  const { entries, skipped } = normalize(dateISO);
  $("entrycount").textContent = `${entries.length} ENTRIES`;
  renderAlert(skipped);
  renderConditions(dateISO);
  renderTimeline(dateISO, entries);
  renderStats(entries);
  renderTable(entries);
  renderChips();
}

function jumpToEntry(date, title) {
  show(date);
  const target = [...document.querySelectorAll(".block")]
    .find((block) => block.dataset.title === title);
  if (!target) return;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1800);
}

$("prev").addEventListener("click", () => show(addDays(current, -1)));
$("next").addEventListener("click", () => show(addDays(current, 1)));
$("today").addEventListener("click", () => show(homeDay()));
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea, select")) return;
  if (event.key === "ArrowLeft") show(addDays(current, -1));
  else if (event.key === "ArrowRight") show(addDays(current, 1));
  else if (event.key === "t" || event.key === "T") show(homeDay());
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".block")) hideTip();
});
window.addEventListener("hashchange", () => {
  const hash = location.hash.slice(1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hash) && hash !== current) show(hash);
});

if (!CONFIG.sampleMode) {
  $("sampleintro").hidden = true;
  $("samplebadge").hidden = true;
  $("today").textContent = "今日";
}

renderInbox("narrative", "進行中の物語", "🧵", NARRATIVES);
renderInbox("goal", "月次目標", "🎯", MONTHLY_GOALS);
renderInbox("harvest", "日を跨ぐ学び", "💡", HARVESTS);
renderInbox("stumble", "つまずき", "🩹", STUMBLES);
renderInbox("agenda", "持ち込み議題", "🗣", AGENDAS);
renderInbox("reward", "体験・ご褒美", "🎁", REWARDS);
renderRewardSettlements(REWARDS, REWARD_SETTLEMENTS);

const hash = location.hash.slice(1);
show(/^\d{4}-\d{2}-\d{2}$/.test(hash) ? hash : homeDay());
if (!CONFIG.sampleMode) setInterval(() => { if (current === effectiveToday()) show(current); }, 60_000);
