const SPECIFIC_QUEUE_CATEGORIES: Array<{
  pattern: RegExp;
  category: string;
  defaultDurationMinutes: number;
}> = [
  { pattern: /슈링크/i, category: "슈링크", defaultDurationMinutes: 30 },
  { pattern: /인모드/i, category: "인모드", defaultDurationMinutes: 20 },
  { pattern: /온다/i, category: "온다", defaultDurationMinutes: 25 },
  { pattern: /시크릿/i, category: "시크릿", defaultDurationMinutes: 20 },
  { pattern: /엘리시스/i, category: "엘리시스", defaultDurationMinutes: 20 },
  { pattern: /울쎄라/i, category: "울쎄라", defaultDurationMinutes: 25 },
  { pattern: /텐써마/i, category: "텐써마", defaultDurationMinutes: 25 },
  { pattern: /올리지오/i, category: "올리지오", defaultDurationMinutes: 25 },
  { pattern: /티타늄/i, category: "티타늄", defaultDurationMinutes: 25 },
  { pattern: /써마지/i, category: "써마지", defaultDurationMinutes: 25 },
];

const GENERAL_QUEUE_CATEGORIES: Array<{
  pattern: RegExp;
  category: string;
  defaultDurationMinutes: number;
}> = [
  { pattern: /(상담|진료|초진|재진)/, category: "상담", defaultDurationMinutes: 15 },
  { pattern: /(다이어트|감량|삭센다|위고비|비만)/, category: "다이어트", defaultDurationMinutes: 10 },
  { pattern: /(제모|겨드랑이|인중|브라질리언|비키니|헤어라인|종아리|팔|다리)/, category: "제모", defaultDurationMinutes: 15 },
  { pattern: /(여드름|압출|아그네스|포텐자 acne)/i, category: "여드름", defaultDurationMinutes: 30 },
  { pattern: /(모공|흉터|프락셀|co2)/i, category: "모공", defaultDurationMinutes: 20 },
  { pattern: /(색소|토닝|기미|잡티|문신제거|피코|루비|색소침착|pdrn)/i, category: "색소", defaultDurationMinutes: 20 },
  { pattern: /(스킨부스터|리쥬란|쥬베룩|쥬베룩 볼륨)/, category: "스킨부스터/약침", defaultDurationMinutes: 25 },
  { pattern: /(아쿠아필|모델링팩|라라필|LDM|관리|스킨케어)/i, category: "스킨케어", defaultDurationMinutes: 20 },
];

function findSpecificQueueCategory(name?: string) {
  const text = String(name || "").trim();
  if (!text) return null;
  return SPECIFIC_QUEUE_CATEGORIES.find((rule) => rule.pattern.test(text)) || null;
}

export function inferQueueCategory(name?: string): string {
  const text = String(name || "").trim();
  if (!text) return "기타";

  const specific = findSpecificQueueCategory(text);
  if (specific) return specific.category;

  const general = GENERAL_QUEUE_CATEGORIES.find((rule) => rule.pattern.test(text));
  return general?.category || "기타";
}

export function normalizeTicketQueueCategory(
  currentQueueCategoryName?: string,
  ticketName?: string
): string | undefined {
  const current = String(currentQueueCategoryName || "").trim();
  const specific = findSpecificQueueCategory(ticketName);

  if (specific) return specific.category;
  if (current) return current;

  const inferred = inferQueueCategory(ticketName);
  return inferred || undefined;
}

export function getDefaultQueueDurationMinutes(
  queueCategoryName?: string,
  usageUnit?: string
): number | undefined {
  if (usageUnit === "package") return 60;

  const queueCategory = String(queueCategoryName || "").trim();
  if (!queueCategory) return undefined;

  const specific = SPECIFIC_QUEUE_CATEGORIES.find((rule) => rule.category === queueCategory);
  if (specific) return specific.defaultDurationMinutes;

  const general = GENERAL_QUEUE_CATEGORIES.find((rule) => rule.category === queueCategory);
  return general?.defaultDurationMinutes;
}

export function normalizeTicketQueueDurationMinutes(params: {
  usageUnit?: string;
  currentDurationMinutes?: number;
  previousQueueCategoryName?: string;
  nextQueueCategoryName?: string;
}): number | undefined {
  const {
    usageUnit,
    currentDurationMinutes,
    previousQueueCategoryName,
    nextQueueCategoryName,
  } = params;
  const currentDuration = Math.max(0, Number(currentDurationMinutes || 0));
  const nextCategory = String(nextQueueCategoryName || "").trim();
  const previousCategory = String(previousQueueCategoryName || "").trim();
  const defaultDuration = getDefaultQueueDurationMinutes(nextCategory, usageUnit);

  if (!defaultDuration) {
    return currentDuration > 0 ? Math.trunc(currentDuration) : undefined;
  }

  if (currentDuration <= 0 || previousCategory !== nextCategory) {
    return defaultDuration;
  }

  return Math.trunc(currentDuration);
}
