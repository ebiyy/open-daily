import { loadData, loadLogGroups } from "./project.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export function parseMinutes(value) {
  const match = TIME_RE.exec(value || "");
  if (!match || Number(match[2]) >= 60) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function validDate(value) {
  if (!DATE_RE.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function presentText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateProject() {
  const errors = [];
  let data;
  let groups;

  try {
    data = loadData();
    groups = loadLogGroups();
  } catch (error) {
    return { errors: [`JavaScriptデータを読み込めません: ${error.message}`] };
  }

  const owners = new Map();
  for (const group of groups) {
    if (!group.value || typeof group.value !== "object" || Array.isArray(group.value)) {
      errors.push(`${group.file}: 月別ログは日付キーを持つオブジェクトにしてください`);
      continue;
    }
    const fileMonth = group.file.match(/(\d{4}-\d{2})\.js$/)?.[1];
    for (const date of Object.keys(group.value)) {
      if (owners.has(date)) {
        errors.push(`${date}: ${owners.get(date)} と ${group.file} で日付が重複`);
      }
      owners.set(date, group.file);
      if (!date.startsWith(`${fileMonth}-`)) {
        errors.push(`${group.file}: ${date} はファイルの月と一致しません`);
      }
    }
  }

  const titles = new Map();
  let entries = 0;
  for (const [date, list] of Object.entries(data.LOGS || {})) {
    if (!validDate(date)) errors.push(`LOGS: 不正な日付 ${date}`);
    if (!Array.isArray(list)) {
      errors.push(`LOGS/${date}: 配列ではありません`);
      continue;
    }
    const dayTitles = new Set();
    titles.set(date, dayTitles);
    for (const [index, entry] of list.entries()) {
      const where = `LOGS/${date}[${index}]`;
      entries += 1;
      const start = parseMinutes(entry.start);
      const end = parseMinutes(entry.end);
      if (start == null || end == null || end <= start) {
        errors.push(`${where}: 不正な時間 ${entry.start}–${entry.end}`);
      }
      if (!data.CATEGORIES[entry.cat]) errors.push(`${where}: 未知のカテゴリ ${entry.cat}`);
      if (!presentText(entry.title)) errors.push(`${where}: title がありません`);
      if (dayTitles.has(entry.title)) errors.push(`${where}: 同日タイトル重複 ${entry.title}`);
      dayTitles.add(entry.title);
      if (entry.note != null && typeof entry.note !== "string") {
        errors.push(`${where}: note は文字列にしてください`);
      }
    }
  }

  const checkRefs = (refs, where) => {
    if (!Array.isArray(refs)) {
      errors.push(`${where}: refs は配列にしてください`);
      return;
    }
    for (const ref of refs) {
      if (typeof ref !== "string") {
        errors.push(`${where}: ref は文字列にしてください`);
        continue;
      }
      const split = ref.indexOf(" ");
      const date = split < 0 ? "" : ref.slice(0, split);
      const title = split < 0 ? "" : ref.slice(split + 1);
      if (!titles.get(date)?.has(title)) errors.push(`${where}: 参照先がありません: ${ref}`);
    }
  };

  let conditions = 0;
  let decisions = 0;
  for (const [date, list] of Object.entries(data.CONDITIONS || {})) {
    if (!validDate(date)) errors.push(`CONDITIONS: 不正な日付 ${date}`);
    if (!Array.isArray(list)) {
      errors.push(`CONDITIONS/${date}: 配列ではありません`);
      continue;
    }
    list.forEach((item, index) => {
      const where = `CONDITIONS/${date}[${index}]`;
      if (!presentText(item?.text)) errors.push(`${where}: text がありません`);
      if (!new Set(["condition", "decision"]).has(item?.kind)) {
        errors.push(`${where}: kind は condition または decision です`);
      }
      if (item?.kind === "condition") conditions += 1;
      if (item?.kind === "decision") decisions += 1;
      checkRefs(item?.refs, where);
    });
  }

  const datedLists = {
    HARVESTS: data.HARVESTS,
    STUMBLES: data.STUMBLES,
    NARRATIVES: data.NARRATIVES,
    AGENDAS: data.AGENDAS,
  };
  for (const [name, list] of Object.entries(datedLists)) {
    if (!Array.isArray(list)) {
      errors.push(`${name}: 配列ではありません`);
      continue;
    }
    list.forEach((item, index) => {
      const where = `${name}[${index}]`;
      if (!validDate(item.date)) errors.push(`${where}: 不正な日付 ${item.date}`);
      if (!presentText(item.text)) errors.push(`${where}: text がありません`);
      if (name === "NARRATIVES" && !presentText(item.title)) errors.push(`${where}: title がありません`);
      if (name === "STUMBLES" &&
          (!item.cost || typeof item.cost !== "object" || Array.isArray(item.cost))) {
        errors.push(`${where}: cost はオブジェクトにしてください`);
      }
      checkRefs(item.refs, where);
    });
  }

  if (!Array.isArray(data.MONTHLY_GOALS)) {
    errors.push("MONTHLY_GOALS: 配列ではありません");
  } else {
    data.MONTHLY_GOALS.forEach((item, index) => {
      const where = `MONTHLY_GOALS[${index}]`;
      if (!MONTH_RE.test(item.month || "") || item.date !== `${item.month}-01`) {
        errors.push(`${where}: month または date が不正です`);
      }
      if (!presentText(item.title) || !presentText(item.text) || !presentText(item.review)) {
        errors.push(`${where}: title/text/review が必要です`);
      }
      if (!Array.isArray(item.items) || !item.items.length || !item.items.every(presentText)) {
        errors.push(`${where}: items は空でない文字列配列にしてください`);
      }
      checkRefs(item.refs, where);
    });
  }

  const rewards = Array.isArray(data.REWARDS) ? data.REWARDS : [];
  if (!Array.isArray(data.REWARDS)) errors.push("REWARDS: 配列ではありません");
  const rewardByTitle = new Map();
  rewards.forEach((item, index) => {
    const where = `REWARDS[${index}]`;
    if (!validDate(item.date)) errors.push(`${where}: 不正な追加日 ${item.date}`);
    if (!presentText(item.title) || !presentText(item.text)) errors.push(`${where}: title/text が必要です`);
    if (rewardByTitle.has(item.title)) errors.push(`${where}: title が重複しています`);
    rewardByTitle.set(item.title, item);
    if (!Array.isArray(item.labels) || !item.labels.length || !item.labels.every(presentText)) {
      errors.push(`${where}: labels は空でない文字列配列にしてください`);
    }
    if (item.consumedAt != null && !validDate(item.consumedAt)) {
      errors.push(`${where}: consumedAt が不正です`);
    }
    if (item.consumedAt != null && item.consumedAt < item.date) {
      errors.push(`${where}: consumedAt は追加日以降にしてください`);
    }
    checkRefs(item.refs, where);
  });

  const settlements = Array.isArray(data.REWARD_SETTLEMENTS) ? data.REWARD_SETTLEMENTS : [];
  if (!Array.isArray(data.REWARD_SETTLEMENTS)) {
    errors.push("REWARD_SETTLEMENTS: 配列ではありません");
  }
  const usedRewards = new Set();
  settlements.forEach((item, index) => {
    const where = `REWARD_SETTLEMENTS[${index}]`;
    if (!validDate(item.date) || (item.settledAt != null && !validDate(item.settledAt))) {
      errors.push(`${where}: date または settledAt が不正です`);
    }
    if (!presentText(item.title) || !presentText(item.text)) errors.push(`${where}: title/text が必要です`);
    if (!Array.isArray(item.rewards) || !item.rewards.length) {
      errors.push(`${where}: rewards は空でない配列にしてください`);
      return;
    }
    for (const title of item.rewards) {
      const reward = rewardByTitle.get(title);
      if (!reward) errors.push(`${where}: REWARDS にない体験です: ${title}`);
      else if (reward.consumedAt == null) errors.push(`${where}: 未消化の体験です: ${title}`);
      if (usedRewards.has(title)) errors.push(`${where}: 二重相殺です: ${title}`);
      usedRewards.add(title);
    }
  });

  return {
    errors,
    summary: {
      logFiles: groups.length,
      logDays: Object.keys(data.LOGS || {}).length,
      entries,
      conditions,
      decisions,
      harvests: data.HARVESTS?.length || 0,
      stumbles: data.STUMBLES?.length || 0,
      narratives: data.NARRATIVES?.length || 0,
      monthlyGoals: data.MONTHLY_GOALS?.length || 0,
      agendas: data.AGENDAS?.length || 0,
      rewards: rewards.length,
      rewardSettlements: settlements.length,
    },
  };
}
