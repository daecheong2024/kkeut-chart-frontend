/* eslint-disable no-console */
import XLSX from "xlsx";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  inferQueueCategory,
  getDefaultQueueDurationMinutes,
} from "./ticketQueueCategoryRules.js";

const EXCEL_PATH_DEFAULT = "c:/Users/jihon/Downloads/시술상세목록_통합_guro_2026-03-05.xlsx";
const SHEET_NAME_DEFAULT = "전체상세목록";
const BRANCH_ID_DEFAULT = 1;
const SQL_ARGS = [
  "exec",
  "-i",
  "kkeut_sqlserver",
  "/opt/mssql-tools18/bin/sqlcmd",
  "-S",
  "localhost",
  "-U",
  "sa",
  "-P",
  "Brief_server_secret_key_12345!",
  "-C",
  "-d",
  "BriefServerLocal",
  "-y",
  "0",
  "-Y",
  "0",
  "-w",
  "65535",
];

function runSqlQuery(query) {
  const result = spawnSync("docker", SQL_ARGS, {
    input: query,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlcmd failed").trim());
  }
  return String(result.stdout || "");
}

function getCurrentTicketsJson(branchId) {
  const sql = `
SET NOCOUNT ON;
SELECT TicketsJson FROM tb_chart_config WHERE BranchId = ${Number(branchId)};
`;
  const raw = runSqlQuery(sql);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return { items: [], presets: [], memberships: [] };
  }
  const jsonText = raw.slice(start, end + 1).replace(/\r?\n/g, "");
  try {
    const parsed = JSON.parse(jsonText);
    return {
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      presets: Array.isArray(parsed?.presets) ? parsed.presets : [],
      memberships: Array.isArray(parsed?.memberships) ? parsed.memberships : [],
    };
  } catch (e) {
    console.warn("[warn] Failed to parse current TicketsJson. Fallback to empty.", e.message);
    return { items: [], presets: [], memberships: [] };
  }
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePrice(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function hashKey(value) {
  return createHash("md5").update(String(value)).digest("hex").slice(0, 12);
}

function parseSessionCount(name) {
  const matches = [...String(name).matchAll(/(\d+)\s*회(?!차)/g)];
  if (!matches.length) return null;
  const nums = matches.map((m) => Number(m[1])).filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

function parseWeekCount(name) {
  const m = String(name).match(/(\d+)\s*주/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseValidDays(name) {
  const text = String(name);
  let m = text.match(/(\d+)\s*년/);
  if (m) return Number(m[1]) * 365;
  m = text.match(/(\d+)\s*개월/);
  if (m) return Number(m[1]) * 30;
  m = text.match(/(\d+)\s*월/);
  if (m) return Number(m[1]) * 30;
  m = text.match(/(\d+)\s*주/);
  if (m) return Number(m[1]) * 7;
  m = text.match(/(\d+)\s*일/);
  if (m) return Number(m[1]);
  return null;
}

function inferUsageUnit(name) {
  const text = String(name);
  if (/패키지/i.test(text)) return "package";
  if (/(무제한|년권|개월권|월권|주권|일권|1년|2년|3년|\d+\s*개월|\d+\s*주)/.test(text)) return "period";
  return "session";
}

function inferRestriction(rightType) {
  const src = String(rightType || "").replace(/\s+/g, "").trim();
  if (!src) return {};

  let allowedDays;
  if (src.includes("화수목")) {
    allowedDays = [2, 3, 4];
  } else if (src.includes("평일") && src.includes("일요일")) {
    allowedDays = [0, 1, 2, 3, 4, 5];
  } else if (src.includes("평일")) {
    allowedDays = [1, 2, 3, 4, 5];
  } else if (src.includes("일요일")) {
    allowedDays = [0];
  }

  let allowedTimeRange;
  if (src.includes("18시이전")) {
    allowedTimeRange = { start: "09:00", end: "18:00" };
  }

  return {
    ...(allowedDays ? { allowedDays } : {}),
    ...(allowedTimeRange ? { allowedTimeRange } : {}),
  };
}

function inferQueueCategoryLegacy(name) {
  const t = String(name || "");

  if (/(상담|진료|초진|재진)/.test(t)) return "상담";
  if (/(다이어트|감량|환|한약)/.test(t)) return "다이어트";
  if (/(제모|겨드랑이|인중|브라질리언|비키니|수염|종아리|팔 상완|팔 하완)/.test(t)) return "제모";
  if (/(슈링크)/.test(t)) return "슈링크";
  if (/(인모드)/.test(t)) return "인모드";
  if (/(온다)/.test(t)) return "온다";
  if (/(리프팅|울쎄라|텐써마|올리지오|티타늄|써마지)/.test(t)) return "리프팅";
  if (/(점제거|비립종|사마귀|쥐젖|CO2)/i.test(t)) return "점제거";
  if (/(색소|토닝|기미|홍조|흑자|문신제거|아그네스|PDRN|레이저토닝)/i.test(t)) return "색소";
  if (/(스킨부스터|리쥬란|쥬베룩|샤넬|쥬베룩|레디어스)/.test(t)) return "스킨부스터";
  if (/(아쿠아필|모델링팩|크라이오|압출|LDM|필링|스킨)/.test(t)) return "스킨케어";
  return "기타";
}

function inferQueueDurationMinutesLegacy(queueCategoryName, usageUnit) {
  if (usageUnit === "package") return 60;
  const map = {
    상담: 15,
    다이어트: 10,
    제모: 15,
    슈링크: 30,
    인모드: 20,
    온다: 25,
    리프팅: 25,
    점제거: 10,
    색소: 20,
    스킨부스터: 25,
    스킨케어: 20,
    기타: 15,
  };
  return map[queueCategoryName] || 15;
}

function nextCodeGenerator(existingItems) {
  let maxNum = 1000000;
  for (const item of existingItems || []) {
    const code = String(item?.code || "").trim();
    const m = code.match(/^A(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  const used = new Set((existingItems || []).map((x) => String(x?.code || "").trim()).filter(Boolean));
  return () => {
    let code = "";
    while (!code || used.has(code)) {
      maxNum += 1;
      code = `A${String(maxNum).padStart(7, "0")}`;
    }
    used.add(code);
    return code;
  };
}

function buildImportedTickets(rows, existingItems) {
  const dedup = new Map();
  for (const row of rows) {
    const rawName = normalizeName(row[0]);
    if (!rawName) continue;
    const rightType = normalizeName(row[1]);
    const price = normalizePrice(row[2]);
    const key = `${rawName}||${rightType}||${price}`;
    if (!dedup.has(key)) dedup.set(key, { rawName, rightType, price });
  }

  const items = [...dedup.values()];
  const nameFrequency = {};
  for (const item of items) {
    const base = item.rightType ? `${item.rawName} (${item.rightType})` : item.rawName;
    nameFrequency[base] = (nameFrequency[base] || 0) + 1;
  }

  const codeGen = nextCodeGenerator(existingItems);
  const existingById = new Map((existingItems || []).map((x) => [String(x?.id || ""), x]));

  let seq = 0;
  const imported = [];
  for (const item of items) {
    seq += 1;
    const baseName = item.rightType ? `${item.rawName} (${item.rightType})` : item.rawName;
    const duplicateName = nameFrequency[baseName] > 1;
    const displayName = duplicateName ? `${baseName} - ${item.price.toLocaleString()}원` : baseName;

    const usageUnit = inferUsageUnit(displayName);
    const sessionCount = parseSessionCount(displayName);
    const weekCount = parseWeekCount(displayName);
    const validDaysParsed = parseValidDays(displayName);
    const restriction = inferRestriction(item.rightType);
    const queueCategoryName = inferQueueCategory(displayName);
    const queueDurationMinutes =
      getDefaultQueueDurationMinutes(queueCategoryName, usageUnit) || 15;

    const sourceKey = `${item.rawName}||${item.rightType}||${item.price}`;
    const id = `t_excel_${hashKey(sourceKey)}`;
    const prev = existingById.get(id);

    const next = {
      id,
      code: prev?.code || codeGen(),
      name: displayName,
      usageUnit,
      price: item.price,
      enabled: true,
      autoTodoEnabled: true,
      autoTodoTasks: [],
      queueCategoryName,
      queueDurationMinutes,
      ...(restriction.allowedDays ? { allowedDays: restriction.allowedDays } : {}),
      ...(restriction.allowedTimeRange ? { allowedTimeRange: restriction.allowedTimeRange } : {}),
    };

    if (usageUnit === "period") {
      const validDays = validDaysParsed && validDaysParsed > 0 ? validDaysParsed : 365;
      const maxTotalCount = sessionCount && sessionCount > 0 ? sessionCount : 0;
      next.validDays = validDays;
      next.totalCount = maxTotalCount > 0 ? maxTotalCount : 0;
      next.maxTotalCount = maxTotalCount;
      next.minIntervalDays = queueCategoryName === "제모" ? 28 : 0;
    } else if (usageUnit === "package") {
      const totalCount = sessionCount || weekCount || 1;
      next.totalCount = totalCount;
      next.minIntervalDays = 0;
    } else {
      next.totalCount = sessionCount || 1;
      if (queueCategoryName === "제모") next.minIntervalDays = 28;
    }

    imported.push(next);
  }

  return imported;
}

function buildPresetId(label) {
  return `preset_excel_${hashKey(label)}`;
}

function buildImportedPresets(rows, existingPresets) {
  const unique = [...new Set(rows.map((r) => normalizeName(r[1])).filter(Boolean))];
  const byLabel = new Map((existingPresets || []).map((x) => [String(x?.label || ""), x]));
  const imported = [];
  for (const label of unique) {
    const restriction = inferRestriction(label);
    const prev = byLabel.get(label);
    imported.push({
      id: prev?.id || buildPresetId(label),
      label,
      ...(restriction.allowedDays ? { allowedDays: restriction.allowedDays } : {}),
      ...(restriction.allowedTimeRange ? { allowedTimeRange: restriction.allowedTimeRange } : {}),
    });
  }
  return imported;
}

function updateTicketsJson(branchId, payload) {
  const jsonText = JSON.stringify(payload);
  const escaped = jsonText.replace(/'/g, "''");
  const sql = `
SET NOCOUNT ON;
DECLARE @json nvarchar(max) = N'${escaped}';
UPDATE tb_chart_config
SET TicketsJson = @json,
    Modifier = N'excel_import',
    ModifyTime = GETDATE()
WHERE BranchId = ${Number(branchId)};

SELECT @@ROWCOUNT AS UpdatedRows;
`;
  return runSqlQuery(sql);
}

function main() {
  const excelPath = process.argv[2] || EXCEL_PATH_DEFAULT;
  const sheetName = process.argv[3] || SHEET_NAME_DEFAULT;
  const branchId = Number(process.argv[4] || BRANCH_ID_DEFAULT);

  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const rows = XLSX.utils
    .sheet_to_json(sheet, { header: 1, defval: "" })
    .slice(1)
    .filter((r) => normalizeName(r[0]));

  const current = getCurrentTicketsJson(branchId);
  const existingItems = Array.isArray(current.items) ? current.items : [];
  const existingPresets = Array.isArray(current.presets) ? current.presets : [];
  const memberships = Array.isArray(current.memberships) ? current.memberships : [];

  const importedItems = buildImportedTickets(rows, existingItems);
  const importedPresets = buildImportedPresets(rows, existingPresets);

  const nonExcelItems = existingItems.filter((x) => !String(x?.id || "").startsWith("t_excel_"));
  const nonExcelPresets = existingPresets.filter((x) => !String(x?.id || "").startsWith("preset_excel_"));

  const finalPayload = {
    items: [...nonExcelItems, ...importedItems],
    presets: [...nonExcelPresets, ...importedPresets],
    memberships,
  };

  const out = updateTicketsJson(branchId, finalPayload);

  const unitStats = importedItems.reduce((acc, item) => {
    acc[item.usageUnit] = (acc[item.usageUnit] || 0) + 1;
    return acc;
  }, {});
  const categoryStats = importedItems.reduce((acc, item) => {
    const key = String(item.queueCategoryName || "기타");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log("[done] branch:", branchId);
  console.log("[done] excel rows:", rows.length);
  console.log("[done] imported items:", importedItems.length);
  console.log("[done] kept non-excel items:", nonExcelItems.length);
  console.log("[done] imported presets:", importedPresets.length);
  console.log("[done] kept memberships:", memberships.length);
  console.log("[stats] usageUnit:", unitStats);
  console.log("[stats] queueCategory:", categoryStats);
  console.log("[sql]");
  console.log(out.trim());
}

main();
