import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Lock, Mail, MapPin, ShieldCheck } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
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

  return (
    <div style={{ fontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif", background: "#FAF3F5", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -80, left: "-8%", width: 400, height: 400, borderRadius: "50%", background: "rgba(248, 220, 226, 0.3)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-5%", width: 450, height: 450, borderRadius: "50%", background: "rgba(232, 234, 246, 0.5)", filter: "blur(90px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 10, display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 24, maxWidth: 960, width: "100%", padding: "0 24px" }}>
        <section style={{
          borderRadius: 16,
          background: "linear-gradient(155deg, #5C2A35 0%, #7A2E3D 52%, #E26B7C 100%)",
          padding: 40,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          border: "1px solid rgba(248, 220, 226, 0.2)",
          boxShadow: "0 24px 60px rgba(92, 42, 53, 0.18)",
          minHeight: 520,
        }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              borderRadius: 9999, border: "1px solid rgba(232, 234, 246, 0.3)",
              background: "rgba(255,255,255,0.1)", padding: "4px 12px",
              fontSize: 12, fontWeight: 600, color: "#FCEBEF",
            }}>
              <ShieldCheck style={{ width: 14, height: 14 }} />
              KKEUT CHART
            </div>
            <h2 style={{ marginTop: 20, fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff", lineHeight: 1.2 }}>
              끗 한의원 차트 시스템
            </h2>
    
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)", padding: "14px 16px",
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#FCEBEF" }}>실시간 진료 상태 공유</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#E5B5C0", fontWeight: 400 }}>대기/진행/완료 상태와 할일을 즉시 반영</div>
            </div>
            <div style={{
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.08)", padding: "14px 16px",
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#FCEBEF" }}>차트 기반 수납 연동</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#E5B5C0", fontWeight: 400 }}>차트 데이터와 결제 내역을 한 번에 관리</div>
            </div>
          </div>
        </section>

        <section style={{
          borderRadius: 16,
          background: "#FFFFFF",
          border: "1px solid #F8DCE2",
          padding: 32,
          boxShadow: "0 4px 12px rgba(226, 107, 124, 0.08)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <BrandMark size={220} />
          </div>

          <div style={{ marginTop: 8, textAlign: "center" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#5C2A35", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
              로그인
            </h1>
            <p style={{ marginTop: 6, fontSize: 13, color: "#616161", fontWeight: 400 }}>
              아이디와 비밀번호를 입력해 주세요.
            </p>
          </div>

          <form onSubmit={onSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "#242424", letterSpacing: "0.1px" }}>
                아이디(이메일)
              </label>
              <div style={{ position: "relative" }}>
                <Mail style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#E5B5C0", pointerEvents: "none" }} />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@hospital.com"
                  autoComplete="email"
                  style={{
                    width: "100%", height: 48, paddingLeft: 40, paddingRight: 12,
                    borderRadius: 8, border: "none",
                    borderBottom: "2px solid #F8DCE2",
                    background: "#FCEBEF", fontSize: 14, color: "#242424",
                    outline: "none", transition: "all 0.2s ease-in-out",
                    fontWeight: 400, boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderBottomColor = "#F49EAF"; e.currentTarget.style.background = "#F0F0F8"; }}
                  onBlur={(e) => { e.currentTarget.style.borderBottomColor = "#F8DCE2"; e.currentTarget.style.background = "#FCEBEF"; }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "#242424", letterSpacing: "0.1px" }}>
                비밀번호
              </label>
              <div style={{ position: "relative" }}>
                <Lock style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#E5B5C0", pointerEvents: "none" }} />
                <input
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="비밀번호를 입력해 주세요."
                  type="password"
                  autoComplete="current-password"
                  style={{
                    width: "100%", height: 48, paddingLeft: 40, paddingRight: 12,
                    borderRadius: 8, border: "none",
                    borderBottom: "2px solid #F8DCE2",
                    background: "#FCEBEF", fontSize: 14, color: "#242424",
                    outline: "none", transition: "all 0.2s ease-in-out",
                    fontWeight: 400, boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderBottomColor = "#F49EAF"; e.currentTarget.style.background = "#F0F0F8"; }}
                  onBlur={(e) => { e.currentTarget.style.borderBottomColor = "#F8DCE2"; e.currentTarget.style.background = "#FCEBEF"; }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "#242424", letterSpacing: "0.1px" }}>
                접속 지점
              </label>
              <div style={{ position: "relative" }}>
                <MapPin style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#E5B5C0", pointerEvents: "none", zIndex: 1 }} />
                <Building2 style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#F8DCE2", pointerEvents: "none", zIndex: 1 }} />
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  style={{
                    width: "100%", height: 48, paddingLeft: 40, paddingRight: 36,
                    borderRadius: 8, border: "none",
                    borderBottom: "2px solid #F8DCE2",
                    background: "#FCEBEF", fontSize: 14, color: "#242424",
                    outline: "none", transition: "all 0.2s ease-in-out",
                    fontWeight: 500, appearance: "none", cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderBottomColor = "#F49EAF"; e.currentTarget.style.background = "#F0F0F8"; }}
                  onBlur={(e) => { e.currentTarget.style.borderBottomColor = "#F8DCE2"; e.currentTarget.style.background = "#FCEBEF"; }}
                >
                  {settings.branches.length === 0 && <option value="">지점을 불러오는 중...</option>}
                  {settings.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {err && (
              <div style={{
                borderRadius: 8, border: "1px solid #EF9A9A",
                background: "#FFEBEE", padding: "10px 14px",
                fontSize: 13, color: "#C62828", fontWeight: 500,
              }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                height: 48, width: "100%", borderRadius: 8,
                background: saving ? "#E5B5C0" : "#E26B7C",
                color: "#fff", fontSize: 15, fontWeight: 600,
                border: "none", cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s ease-in-out",
                letterSpacing: "0.1px",
                boxShadow: "0 4px 12px rgba(226, 107, 124, 0.2)",
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "#99354E"; }}
              onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = "#E26B7C"; }}
            >
              {saving ? "로그인 중..." : "로그인"}
            </button>

            <button
              type="button"
              onClick={() => nav("/signup")}
              style={{
                height: 44, width: "100%", borderRadius: 8,
                background: "transparent",
                color: "#E26B7C", fontSize: 14, fontWeight: 600,
                border: "1px solid #F8DCE2", cursor: "pointer",
                transition: "all 0.2s ease-in-out",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#FCEBEF"; e.currentTarget.style.borderColor = "#E26B7C"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#F8DCE2"; }}
            >
              회원가입
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
