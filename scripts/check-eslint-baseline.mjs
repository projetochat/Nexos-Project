import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, "scripts/eslint-baseline.json");
const outputFile = "tmp/eslint-current.json";
const outputPath = resolve(root, outputFile);

mkdirSync(dirname(outputPath), { recursive: true });

const eslintBin = command("bunx", resolve(root, "node_modules/.bin/eslint"));
const eslintArgs = eslintBin.viaBunx
  ? ["eslint", ".", "--format", "json", "--output-file", outputFile]
  : [".", "--format", "json", "--output-file", outputFile];
const eslint = spawnSync(eslintBin.path, eslintArgs, {
  cwd: root,
  stdio: "inherit",
});

if (eslint.status !== 0 && eslint.status !== 1) {
  process.exit(eslint.status ?? 1);
}

const baseline = readJson(baselinePath);
const current = summarize(readJson(outputPath));
rmSync(outputPath, { force: true });

const regressions = [];
compareRules({ regressions, baselineRules: baseline.rules, currentRules: current.rules });
compareFiles({ regressions, baselineFiles: baseline.files, currentFiles: current.files });

if (regressions.length > 0) {
  console.error("ESLint baseline regression detected:");
  for (const item of regressions) console.error(`- ${item}`);
  process.exit(1);
}

console.log(
  `ESLint baseline OK: ${current.totals.errors} errors and ${current.totals.warnings} warnings within legacy baseline.`,
);

function summarize(results) {
  const files = {};
  const rules = {};
  const totals = { errors: 0, warnings: 0 };

  for (const result of results) {
    const fileRules = {};
    const filePath = toProjectPath(result.filePath);
    totals.errors += result.errorCount ?? 0;
    totals.warnings += result.warningCount ?? 0;

    for (const message of result.messages) {
      const rule = message.ruleId || "fatal/parser";
      fileRules[rule] = (fileRules[rule] ?? 0) + 1;
      rules[rule] = (rules[rule] ?? 0) + 1;
    }

    if (Object.keys(fileRules).length > 0) files[filePath] = fileRules;
  }

  return { totals, rules, files };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function compareRules({ regressions, baselineRules, currentRules }) {
  for (const [rule, count] of Object.entries(currentRules)) {
    const baselineCount = baselineRules[rule] ?? 0;
    if (count > baselineCount) {
      regressions.push(`rule ${rule}: ${count} current > ${baselineCount} baseline`);
    }
  }
}

function compareFiles({ regressions, baselineFiles, currentFiles }) {
  for (const [file, rules] of Object.entries(currentFiles)) {
    const baselineRules = baselineFiles[file];
    if (!baselineRules) {
      regressions.push(`new linted file with messages: ${file}`);
      continue;
    }

    for (const [rule, count] of Object.entries(rules)) {
      const baselineCount = baselineRules[rule] ?? 0;
      if (count > baselineCount) {
        regressions.push(`${file} ${rule}: ${count} current > ${baselineCount} baseline`);
      }
    }
  }
}

function toProjectPath(absolutePath) {
  return relative(root, absolutePath).split("\\").join("/");
}

function command(name, fallback) {
  const candidate = process.platform === "win32" ? `${name}.exe` : name;
  const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  if (result.status === 0) return { path: candidate, viaBunx: name === "bunx" };
  return {
    path: process.platform === "win32" ? `${fallback}.exe` : fallback,
    viaBunx: false,
  };
}
