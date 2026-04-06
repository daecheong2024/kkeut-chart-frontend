const KNOWN_BRANCH_NAME_FIXUPS: Record<string, string> = {
  "援щ줈점": "구로점",
  "援щ줈": "구로",
  "援山委": "구로점",
  "援山": "구로",
};

export function normalizeBranchName(name: unknown, branchId?: unknown): string {
  const raw = String(name ?? "").trim();
  const id = String(branchId ?? "").trim();
  if (!raw) {
    return id ? `지점 ${id}` : "지점";
  }

  const compact = raw.replace(/\s+/g, "");
  if (KNOWN_BRANCH_NAME_FIXUPS[raw]) return KNOWN_BRANCH_NAME_FIXUPS[raw];
  if (KNOWN_BRANCH_NAME_FIXUPS[compact]) return KNOWN_BRANCH_NAME_FIXUPS[compact];

  // Fallback: when known branch id carries "guro" but name is broken.
  const loweredId = id.toLowerCase();
  const hasHangul = /[가-힣]/.test(raw);
  const hasLatinOrDigit = /[a-z0-9]/i.test(raw);
  if (!hasHangul && !hasLatinOrDigit && /guro|구로/.test(loweredId)) {
    return "구로점";
  }

  return raw;
}
