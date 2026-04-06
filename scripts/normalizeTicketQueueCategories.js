/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import {
  normalizeTicketQueueCategory,
  normalizeTicketQueueDurationMinutes,
} from "./ticketQueueCategoryRules.js";

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
  return JSON.parse(raw.slice(start, end + 1).replace(/\r?\n/g, ""));
}

function updateTicketsJson(branchId, payload) {
  const jsonText = JSON.stringify(payload);
  const escaped = jsonText.replace(/'/g, "''");
  const sql = `
SET NOCOUNT ON;
DECLARE @json nvarchar(max) = N'${escaped}';
UPDATE tb_chart_config
SET TicketsJson = @json,
    Modifier = N'ticket_category_normalizer',
    ModifyTime = GETDATE()
WHERE BranchId = ${Number(branchId)};

SELECT @@ROWCOUNT AS UpdatedRows;
`;
  return runSqlQuery(sql);
}

function normalizeItems(items) {
  const changes = [];
  const nextItems = (Array.isArray(items) ? items : []).map((item) => {
    const previousQueueCategoryName = String(
      item?.queueCategoryName || item?.autoTodoProcedureName || ""
    ).trim();
    const nextQueueCategoryName = normalizeTicketQueueCategory(
      previousQueueCategoryName,
      item?.name
    );
    const nextQueueDurationMinutes = normalizeTicketQueueDurationMinutes({
      usageUnit: item?.usageUnit,
      currentDurationMinutes: item?.queueDurationMinutes,
      previousQueueCategoryName,
      nextQueueCategoryName,
    });

    const changed =
      previousQueueCategoryName !== String(nextQueueCategoryName || "").trim() ||
      Number(item?.queueDurationMinutes || 0) !== Number(nextQueueDurationMinutes || 0) ||
      typeof item?.autoTodoProcedureName !== "undefined";

    if (changed) {
      changes.push({
        code: item?.code,
        name: item?.name,
        fromCategory: previousQueueCategoryName || "",
        toCategory: nextQueueCategoryName || "",
        fromDuration: Number(item?.queueDurationMinutes || 0) || 0,
        toDuration: Number(nextQueueDurationMinutes || 0) || 0,
      });
    }

    return {
      ...item,
      queueCategoryName: nextQueueCategoryName || undefined,
      queueDurationMinutes: nextQueueDurationMinutes,
      autoTodoProcedureName: undefined,
    };
  });

  return { nextItems, changes };
}

function main() {
  const branchId = Number(process.argv[2] || BRANCH_ID_DEFAULT);
  const current = getCurrentTicketsJson(branchId);
  const { nextItems, changes } = normalizeItems(current.items);

  if (changes.length === 0) {
    console.log("[done] no ticket queue category changes needed");
    return;
  }

  const payload = {
    items: nextItems,
    presets: Array.isArray(current.presets) ? current.presets : [],
    memberships: Array.isArray(current.memberships) ? current.memberships : [],
  };

  const out = updateTicketsJson(branchId, payload);

  console.log("[done] branch:", branchId);
  console.log("[done] changed items:", changes.length);
  for (const change of changes.slice(0, 100)) {
    console.log(
      `${change.code || "-"} | ${change.name || "-"} | ${change.fromCategory || "-"} -> ${change.toCategory || "-"} | ${change.fromDuration} -> ${change.toDuration}`
    );
  }
  console.log("[sql]");
  console.log(out.trim());
}

main();
