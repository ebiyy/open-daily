import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");

const PATHS = {
  template: path.join(ROOT, "src/template.html"),
  styles: path.join(ROOT, "src/styles.css"),
  model: path.join(ROOT, "src/data-model.js"),
  context: path.join(ROOT, "data/context.js"),
  logs: path.join(ROOT, "data/logs"),
  app: path.join(ROOT, "src/app.js"),
  output: path.join(ROOT, "index.html"),
};

const TOKENS = {
  styles: "/*__OPEN_DAILY_STYLES__*/",
  data: "/*__OPEN_DAILY_DATA__*/",
  app: "/*__OPEN_DAILY_APP__*/",
};

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\s+$/, "");
}

export function logFiles() {
  return fs.readdirSync(PATHS.logs)
    .filter((file) => /^\d{4}-\d{2}\.js$/.test(file))
    .sort()
    .map((file) => path.join(PATHS.logs, file));
}

export function logSources() {
  const files = logFiles();
  if (!files.length) throw new Error("data/logs に YYYY-MM.js がありません");
  return files.map((file) => ({ file, source: read(file) }));
}

export function composeDataSource() {
  const logs = logSources().map(({ source }) => source).join(",\n");
  return [
    read(PATHS.model),
    "",
    "const LOGS = Object.assign({},",
    logs,
    ");",
    "",
    read(PATHS.context),
  ].join("\n");
}

export function loadLogGroups() {
  const context = vm.createContext({});
  new vm.Script(read(PATHS.model), { filename: "src/data-model.js" }).runInContext(context);
  return logSources().map(({ file, source }) => {
    const filename = path.relative(ROOT, file);
    const value = new vm.Script(source, { filename }).runInContext(context);
    return { file: filename, value };
  });
}

export function loadData() {
  const context = vm.createContext({});
  new vm.Script(composeDataSource(), { filename: "open-daily-data.js" }).runInContext(context);
  new vm.Script(`
    globalThis.__openDaily = {
      CONFIG, CATEGORIES, LOGS, CONDITIONS, HARVESTS, STUMBLES,
      NARRATIVES, MONTHLY_GOALS, AGENDAS, REWARDS, REWARD_SETTLEMENTS
    };
  `).runInContext(context);
  return context.__openDaily;
}

function replaceOnce(source, token, value) {
  const parts = source.split(token);
  if (parts.length !== 2) {
    throw new Error(`テンプレートトークン ${token} は1個必要です`);
  }
  return parts[0] + value + parts[1];
}

export function renderIndex() {
  let html = read(PATHS.template);
  html = replaceOnce(html, TOKENS.styles, read(PATHS.styles));
  html = replaceOnce(html, TOKENS.data, composeDataSource());
  html = replaceOnce(html, TOKENS.app, read(PATHS.app));
  return html + "\n";
}

export function outputPath() {
  return PATHS.output;
}
