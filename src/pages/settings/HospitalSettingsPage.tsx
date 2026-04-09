import React, { useMemo, useState, useEffect } from "react";
import { TopBar } from "../../components/layout/TopBar";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { hospitalSettingsService, HospitalSettings } from "../../services/hospitalSettingsService";
import { useCurrentUserPermissions } from "../../hooks/useCurrentUserPermissions";
import { NoPermissionOverlay } from "../../components/common/NoPermissionOverlay";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_DAYS = ["월", "화", "수", "목", "금"] as const;
const WEEKEND_DAYS = ["토", "일"] as const;

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

type HospitalEditorState = {
  mode: "field";
  key: keyof HospitalSettings;
  label: string;
  value: string;
  inputType: "text" | "date";
  placeholder?: string;
};

function ImageField({
  label,
  value,
  imageType,
  branchId,
  onUploaded,
  onDeleted,
}: {
  label: string;
  value?: string;
  imageType: string;
  branchId: string;
  onUploaded: (url: string) => void;
  onDeleted: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const result = await hospitalSettingsService.uploadImage(branchId, imageType, file);
      onUploaded(result.url);
    } catch (e: any) {
      alert(e?.response?.data?.message || "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await hospitalSettingsService.deleteImage(branchId, imageType);
      onDeleted();
    } catch (e: any) {
      alert(e?.response?.data?.message || "이미지 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="rounded-2xl border border-[#F8DCE2] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold">{label}</div>
        <div className="flex items-center gap-2">
          <label className={`cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await handleUpload(f);
                e.target.value = "";
              }}
            />
            <span className="rounded-lg border border-[#F8DCE2] bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
              {uploading ? "업로드 중..." : "이미지 업로드"}
            </span>
          </label>
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={!value || uploading}>
            삭제
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-xl border border-[#F8DCE2] bg-gray-50">
          {value ? (
            <img src={value.startsWith("http") ? value : `${import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, "") || ""}${value}`} alt={label} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">미등록</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HospitalSettingsPage() {
  const { settings, updateSettings } = useSettingsStore();
  const activeBranchId = settings.activeBranchId;
  const { permissions, loaded: permLoaded } = useCurrentUserPermissions(activeBranchId);
  if (permLoaded && !permissions["settings.hospital"]) return <NoPermissionOverlay />;

  const [draft, setDraft] = useState<Partial<HospitalSettings>>({
    branchId: activeBranchId,
    operatingHours: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<HospitalEditorState | null>(null);
  const [editorError, setEditorError] = useState("");

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings.hospital), [draft, settings.hospital]);

  useEffect(() => {
    const branchId = String(activeBranchId || "").trim();
    if (!branchId) {
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await hospitalSettingsService.get(branchId);
        if (data) {
          const normalized: HospitalSettings = {
            ...data,
            branchId: String(data.branchId || branchId),
            operatingHours: data.operatingHours || {},
          };
          updateSettings({ hospital: normalized as any });
          setDraft(normalized);
        } else {
          setDraft({ branchId: branchId, operatingHours: {} });
        }
      } catch (error) {
        console.error("Failed to load hospital settings:", error);
        setDraft({ branchId: branchId, operatingHours: {} });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [activeBranchId, updateSettings]);

  const field = (
    key: keyof HospitalSettings,
    label: string,
    placeholder?: string,
    type: string = "text"
  ) => (
    <button
      type="button"
      className="rounded-2xl border border-[#F8DCE2] bg-white p-4 text-left shadow-sm transition hover:border-[#E26B7C] hover:bg-[#FCEBEF]"
      onClick={() => {
        setEditor({
          mode: "field",
          key,
          label,
          value: type === "date" ? String((draft as any)[key] || "").substring(0, 10) : String((draft as any)[key] || ""),
          inputType: type === "date" ? "date" : "text",
          placeholder,
        });
        setEditorError("");
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-gray-500">{label}</div>
        <span className="text-[11px] font-semibold text-slate-500">수정</span>
      </div>
      <div className="mt-2 rounded-lg border border-[#F8DCE2] bg-[#FCF7F8] px-3 py-2 text-sm font-semibold text-[#242424]">
        {key === "effectiveDate"
          ? ((draft as any)[key] || "").substring(0, 10) || placeholder || "미입력"
          : (draft as any)[key] || placeholder || "미입력"}
      </div>
    </button>
  );

  const updateOperatingHour = (day: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      operatingHours: {
        ...(prev.operatingHours || {}),
        [day]: value,
      },
    }));
  };

  const applyBulkHours = (days: readonly string[], value: string) => {
    setDraft((prev) => {
      const hours = { ...(prev.operatingHours || {}) };
      days.forEach((d) => { hours[d] = value; });
      return { ...prev, operatingHours: hours };
    });
  };

  const save = async () => {
    const branchId = String(activeBranchId || "").trim();
    if (!branchId) {
      alert("지점 정보가 없습니다. 다시 로그인해 주세요.");
      return;
    }
    try {
      setSaving(true);
      const payload: HospitalSettings = {
        ...(draft as HospitalSettings),
        branchId: activeBranchId,
        operatingHours: draft.operatingHours || {},
      };

      await hospitalSettingsService.update(payload);
      updateSettings({ hospital: payload as any });

      alert("저장되었습니다.");
    } catch (error) {
      console.error("Failed to save hospital settings:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
        <TopBar title="설정 > 병원" />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-[#616161]">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FAF3F5]" style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif" }}>
      <TopBar title="설정 > 병원" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-[#5C2A35]">병원정보</div>
            <div className="mt-1 text-sm text-gray-600">
              병원 기본 정보와 로고/직인 이미지, 운영시간을 설정합니다. (지점: {activeBranchId})
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDraft({ branchId: activeBranchId, operatingHours: {} })}
              disabled={saving}
            >
              초기화
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {field("hospitalNameKo", "병원명(한글)")}
          {field("hospitalNameEn", "병원명(영문)")}

          {field("businessNumber", "사업자번호")}
          {field("providerNumber", "요양기관번호")}
          {field("medicalDepartments", "진료과목")}
          {field("effectiveDate", "적용기간", "YYYY-MM-DD", "date")}

          <div className="lg:col-span-2">{field("address", "주소")}</div>

          {field("phone", "전화번호")}
          {field("fax", "FAX 번호")}
          {field("industrialAccidentNumber", "산재지정번호")}
          {field("billingAgencyNumber", "청구대행업체번호")}
          {field("directorName", "병원장 성명")}
          {field("directorBirthDate", "병원장 생년월일", "YYYY-MM-DD", "date")}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#F8DCE2] bg-white p-4">
            <div className="text-sm font-bold text-[#5C2A35]">운영시간</div>
            <div className="mt-1 text-xs text-gray-500">
              요일별 운영시간을 설정합니다. 시작/종료 시간을 선택하세요.
            </div>
            <div className="mt-3 flex items-center gap-2">
              {[
                { label: "평일 일괄", days: WEEKDAY_DAYS },
                { label: "주말 일괄", days: WEEKEND_DAYS },
              ].map(({ label, days }) => {
                const refDay = days[0];
                const refVal = draft.operatingHours?.[refDay] || "";
                const [s, e] = refVal.includes("~") ? refVal.split("~").map((v) => v.trim()) : ["", ""];
                return (
                  <div key={label} className="flex items-center gap-1.5 rounded-lg border border-[#F8DCE2] bg-white px-3 py-1.5">
                    <span className="text-xs font-bold text-[#E26B7C]">{label}</span>
                    <select
                      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                      value={s}
                      onChange={(ev) => applyBulkHours(days, `${ev.target.value}~${e}`)}
                    >
                      <option value="">시작</option>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">~</span>
                    <select
                      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                      value={e}
                      onChange={(ev) => applyBulkHours(days, `${s}~${ev.target.value}`)}
                    >
                      <option value="">종료</option>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-2">
              {WEEKDAYS_KO.map((day) => {
                const raw = draft.operatingHours?.[day] || "";
                const [startVal, endVal] = raw.includes("~") ? raw.split("~").map((s) => s.trim()) : ["", ""];
                return (
                  <div
                    key={day}
                    className="flex items-center gap-3 rounded-lg border border-[#F8DCE2] bg-[#FCF7F8] px-4 py-2.5"
                  >
                    <div className="w-8 text-sm font-bold text-gray-700">{day}</div>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#F49EAF] cursor-pointer"
                      value={startVal}
                      onChange={(e) => {
                        const next = `${e.target.value}~${endVal}`;
                        updateOperatingHour(day, next);
                      }}
                    >
                      <option value="">시작</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-400">~</span>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#F49EAF] cursor-pointer"
                      value={endVal}
                      onChange={(e) => {
                        const next = `${startVal}~${e.target.value}`;
                        updateOperatingHour(day, next);
                      }}
                    >
                      <option value="">종료</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {raw && (
                      <button
                        type="button"
                        className="ml-auto text-xs font-semibold text-gray-400 hover:text-rose-500"
                        onClick={() => updateOperatingHour(day, "")}
                      >
                        초기화
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <ImageField
              label="병원 로고"
              value={draft.logoDataUrl}
              imageType="logo"
              branchId={String(activeBranchId || "")}
              onUploaded={(url) => setDraft((p) => ({ ...p, logoDataUrl: url }))}
              onDeleted={() => setDraft((p) => ({ ...p, logoDataUrl: undefined }))}
            />
            <ImageField
              label="병원 직인"
              value={draft.stampHospitalDataUrl}
              imageType="stamp-hospital"
              branchId={String(activeBranchId || "")}
              onUploaded={(url) => setDraft((p) => ({ ...p, stampHospitalDataUrl: url }))}
              onDeleted={() => setDraft((p) => ({ ...p, stampHospitalDataUrl: undefined }))}
            />
            <ImageField
              label="병원장 직인"
              value={draft.stampDirectorDataUrl}
              imageType="stamp-director"
              branchId={String(activeBranchId || "")}
              onUploaded={(url) => setDraft((p) => ({ ...p, stampDirectorDataUrl: url }))}
              onDeleted={() => setDraft((p) => ({ ...p, stampDirectorDataUrl: undefined }))}
            />
          </div>
        </div>
      </div>

      {editor && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          onMouseDown={() => {
            setEditor(null);
            setEditorError("");
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#F8DCE2] bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-xl font-extrabold text-slate-900">{editor.label}</div>
              <div className="mt-1 text-sm text-slate-500">목록에서는 읽기만 하고, 수정은 모달에서 입력합니다.</div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <div className="mb-1 text-xs font-bold text-slate-500">값</div>
                <Input
                  autoFocus
                  type={editor.inputType}
                  max={editor.inputType === "date" ? "9999-12-31" : undefined}
                  value={editor.value}
                  placeholder={editor.placeholder}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setEditor((prev) => (prev ? { ...prev, value: nextValue } : prev));
                    if (editorError) setEditorError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    setDraft((prev) => ({ ...prev, [editor.key]: editor.value }));
                    setEditor(null);
                    setEditorError("");
                  }}
                />
              </div>
              {editorError && <div className="text-xs font-semibold text-rose-600">{editorError}</div>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#F8DCE2] bg-[#FCF7F8] px-6 py-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditor(null);
                  setEditorError("");
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, [editor.key]: editor.value }));
                  setEditor(null);
                  setEditorError("");
                }}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
