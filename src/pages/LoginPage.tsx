import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useAuthStore } from "../stores/useAuthStore";
import { useSettingsStore } from "../stores/useSettingsStore";

export default function LoginPage() {
  const nav = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { settings } = useSettingsStore();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [branchId, setBranchId] = useState(settings.branches?.[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId && settings.branches.length > 0) {
      setBranchId(settings.branches[0]?.id || "");
    }
  }, [settings.branches, branchId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await login(email.trim(), pw, branchId);
      nav("/app");
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "로그인에 실패했습니다.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  // Field input shared style
  const inputStyle = (active: boolean): React.CSSProperties => ({
    width: "100%",
    height: 52,
    padding: "0 18px",
    borderRadius: 12,
    border: active ? "1.5px solid #D27A8C" : "1.5px solid transparent",
    background: "#FCEBEF",
    fontSize: 14,
    color: "#2A1F22",
    outline: "none",
    transition: "all 0.2s ease",
    fontWeight: 500,
    boxSizing: "border-box",
    boxShadow: active ? "0 0 0 4px rgba(226, 107, 124, 0.10)" : "none",
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#5C2A35",
    letterSpacing: "0.1px",
  };

  return (
    <div
      style={{
        fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
        background: "linear-gradient(135deg, #FCEBEF 0%, #FCF7F8 50%, #FCEBEF 100%)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        padding: "24px",
      }}
    >
      {/* Soft background blobs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-15%", left: "-10%", width: 520, height: 520, borderRadius: "50%", background: "rgba(248, 220, 226, 0.45)", filter: "blur(120px)" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-10%", width: 560, height: 560, borderRadius: "50%", background: "rgba(252, 235, 239, 0.6)", filter: "blur(120px)" }} />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          maxWidth: 1080,
          width: "100%",
        }}
      >
        {/* LEFT — Brand panel */}
        <section
          style={{
            position: "relative",
            borderRadius: 28,
            background: "#7A5560",
            padding: "44px 40px",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 600,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(92, 42, 53, 0.28)",
          }}
        >
          {/* Decorative circles */}
          <div style={{ position: "absolute", top: -120, right: -80, width: 360, height: 360, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ position: "absolute", bottom: -160, right: 40, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <div style={{ position: "absolute", bottom: 80, left: -60, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />

          {/* Top pill */}
          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 9999,
                background: "rgba(0,0,0,0.18)",
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 700,
                color: "#FCEBEF",
                letterSpacing: "0.3px",
              }}
            >
              병원 차트
            </div>
          </div>

          {/* Center: logo + uppercase title */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 28, marginTop: 16, alignItems: "flex-start" }}>
            <BrandMark size={180} />
            <h1
              style={{
                fontSize: 50,
                fontWeight: 900,
                letterSpacing: "-1.4px",
                lineHeight: 1.02,
                color: "#fff",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              KKEUT
              <br />
              CHART
              <br />
              SIGN-IN
            </h1>
          </div>

          {/* Footer accent */}
          <div style={{ position: "relative", zIndex: 2, fontSize: 11, color: "rgba(252, 235, 239, 0.55)", letterSpacing: "0.5px" }}>
            © KKEUT HEALTHCARE
          </div>
        </section>

        {/* RIGHT — Sign-in form */}
        <section
          style={{
            borderRadius: 28,
            background: "#FFFFFF",
            padding: "48px 44px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: 600,
            boxShadow: "0 24px 60px rgba(226, 107, 124, 0.10)",
          }}
        >
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* 지점 */}
            <div>
              <label style={labelStyle}>지점 선택</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                onFocus={() => setFocusedField("branch")}
                onBlur={() => setFocusedField(null)}
                style={{
                  ...inputStyle(focusedField === "branch"),
                  appearance: "none",
                  cursor: "pointer",
                  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path fill='%2399354E' d='M6 8L0 0h12z'/></svg>\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 18px center",
                  paddingRight: 44,
                }}
              >
                {settings.branches.length === 0 && <option value="">지점을 불러오는 중...</option>}
                {settings.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* 아이디 */}
            <div>
              <label style={labelStyle}>아이디</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="아이디를 입력해 주세요"
                autoComplete="email"
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                style={inputStyle(focusedField === "email")}
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label style={labelStyle}>비밀번호</label>
              <input
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호를 입력해 주세요"
                type="password"
                autoComplete="current-password"
                onFocus={() => setFocusedField("pw")}
                onBlur={() => setFocusedField(null)}
                style={inputStyle(focusedField === "pw")}
              />
            </div>

            {/* Notice */}
            <div
              style={{
                borderRadius: 12,
                background: "#FCF7F8",
                border: "1px solid #F8DCE2",
                padding: "12px 16px",
                fontSize: 12,
                color: "#8B5A66",
                fontWeight: 500,
                lineHeight: 1.5,
              }}
            >
              공용 PC에서는 로그인 후 반드시 로그아웃해 주세요.
            </div>

            {/* Error */}
            {err && (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid #F4C7CE",
                  background: "#FCEBEF",
                  padding: "12px 16px",
                  fontSize: 13,
                  color: "#8B3F50",
                  fontWeight: 600,
                }}
              >
                {err}
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={saving}
              style={{
                height: 56,
                width: "100%",
                borderRadius: 14,
                background: saving ? "#E5B5C0" : "linear-gradient(135deg, #E5A0AC 0%, #D58594 100%)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 800,
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                letterSpacing: "0.5px",
                boxShadow: saving ? "none" : "0 12px 28px rgba(213, 133, 148, 0.36)",
                marginTop: 4,
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.background = "linear-gradient(135deg, #D58594 0%, #B96B7B 100%)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.currentTarget.style.background = "linear-gradient(135deg, #E5A0AC 0%, #D58594 100%)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              {saving ? "로그인 중..." : "로그인"}
            </button>

            {/* Signup button */}
            <button
              type="button"
              onClick={() => nav("/signup")}
              style={{
                height: 56,
                width: "100%",
                borderRadius: 14,
                background: "#fff",
                color: "#5C2A35",
                fontSize: 16,
                fontWeight: 800,
                border: "1.5px solid #F8DCE2",
                cursor: "pointer",
                transition: "all 0.2s ease",
                letterSpacing: "0.3px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FCEBEF";
                e.currentTarget.style.borderColor = "#D27A8C";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.borderColor = "#F8DCE2";
              }}
            >
              회원가입
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
