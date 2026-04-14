import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import apiClient from "../services/apiClient";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

export default function SignupPage() {
    const nav = useNavigate();
    const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);

    const [formData, setFormData] = useState({
        email: "",
        password: "",
        passwordConfirm: "",
        name: "",
        phone: "",
        branchId: "",
        partId: "",
        birthDate: "",
    });

    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [showPw, setShowPw] = useState(false);
    const [showPwConfirm, setShowPwConfirm] = useState(false);

    useEffect(() => {
        apiClient
            .get("/branches")
            .then((res) => {
                setBranches(Array.isArray(res.data) ? res.data : []);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!formData.branchId) {
            setDepartments([]);
            return;
        }
        apiClient
            .get(`/settings/departments?branchId=${formData.branchId}`)
            .then((res) => {
                const data = res.data;
                const items = Array.isArray(data) ? data : (data?.items ?? []);
                setDepartments(items);
            })
            .catch(() => setDepartments([]));
    }, [formData.branchId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const pwLength = formData.password.length >= 8;
    const pwMatch = formData.password.length > 0 && formData.password === formData.passwordConfirm;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);

        if (
            !formData.email ||
            !formData.password ||
            !formData.passwordConfirm ||
            !formData.name ||
            !formData.phone ||
            !formData.branchId ||
            !formData.partId ||
            !formData.birthDate
        ) {
            setErr("모든 필드를 입력해 주세요.");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            setErr("올바른 이메일 형식이 아닙니다.");
            return;
        }

        if (!pwLength) {
            setErr("비밀번호는 8자 이상이어야 합니다.");
            return;
        }

        if (!pwMatch) {
            setErr("비밀번호가 일치하지 않습니다.");
            return;
        }

        const phoneClean = formData.phone.replace(/-/g, "");
        if (!/^01[016789]\d{7,8}$/.test(phoneClean)) {
            setErr("올바른 휴대전화 번호 형식이 아닙니다.");
            return;
        }

        setSaving(true);

        try {
            await apiClient.post("/auth/register", {
                email: formData.email,
                password: formData.password,
                name: formData.name,
                branchId: parseInt(formData.branchId, 10) || 0,
                departmentId: parseInt(formData.partId, 10) || 0,
                telNo: formData.phone,
                birthDay: formData.birthDate,
            });

            alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
            nav("/login");
        } catch (e: any) {
            const msg = e.response?.data?.message || "회원가입 처리 중 오류가 발생했습니다.";
            setErr(msg);
        } finally {
            setSaving(false);
        }
    };

    const selectClass =
        "h-11 w-full rounded-xl border border-[rgb(var(--kkeut-border))] bg-[rgb(var(--kkeut-bg-input))] px-3 text-sm focus:border-[rgb(var(--kkeut-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--kkeut-primary))] disabled:opacity-50";

    return (
        <div className="kkeut-bg-soft flex min-h-screen items-center justify-center p-4">
            <div className="w-full max-w-lg">
                <div className="rounded-[28px] border border-[rgb(var(--kkeut-border))] bg-white p-8 shadow-soft md:p-10">
                    <div className="mb-8 flex flex-col items-center">
                        <BrandMark size={72} />
                        <h1 className="mt-4 text-xl font-bold text-gray-900">회원가입</h1>
                        <p className="mt-1 text-sm text-gray-400">직원 계정을 생성합니다</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <section>
                            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[rgb(var(--kkeut-primary))]">계정 정보</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">아이디 (이메일)</label>
                                    <Input name="email" type="email" placeholder="name@company.com" value={formData.email} onChange={handleChange} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">비밀번호</label>
                                    <div className="relative">
                                        <Input
                                            name="password"
                                            type={showPw ? "text" : "password"}
                                            placeholder="8자 이상 입력해주세요"
                                            value={formData.password}
                                            onChange={handleChange}
                                            className="pr-10"
                                        />
                                        <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {formData.password.length > 0 && (
                                        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                                            {pwLength ? (
                                                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> 8자 이상</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /> 8자 이상 필요</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">비밀번호 확인</label>
                                    <div className="relative">
                                        <Input
                                            name="passwordConfirm"
                                            type={showPwConfirm ? "text" : "password"}
                                            placeholder="비밀번호를 다시 입력해주세요"
                                            value={formData.passwordConfirm}
                                            onChange={handleChange}
                                            className="pr-10"
                                        />
                                        <button type="button" onClick={() => setShowPwConfirm(!showPwConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            {showPwConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    {formData.passwordConfirm.length > 0 && (
                                        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                                            {pwMatch ? (
                                                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> 비밀번호 일치</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /> 비밀번호 불일치</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <hr className="border-[rgb(var(--kkeut-border))]" />

                        <section>
                            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[rgb(var(--kkeut-primary))]">개인 정보</h2>
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-gray-700">이름</label>
                                        <Input name="name" placeholder="홍길동" value={formData.name} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-gray-700">생년월일</label>
                                        <Input name="birthDate" type="date" max="9999-12-31" value={formData.birthDate} onChange={handleChange} />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">휴대폰 번호</label>
                                    <Input name="phone" placeholder="010-1234-5678" value={formData.phone} onChange={handleChange} />
                                </div>
                            </div>
                        </section>

                        <hr className="border-[rgb(var(--kkeut-border))]" />

                        <section>
                            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[rgb(var(--kkeut-primary))]">소속 정보</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">지점</label>
                                    <select name="branchId" className={selectClass} value={formData.branchId} onChange={handleChange}>
                                        <option value="">선택</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">파트(직무)</label>
                                    <select name="partId" className={selectClass} value={formData.partId} onChange={handleChange} disabled={!formData.branchId}>
                                        <option value="">선택</option>
                                        {departments.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </section>

                        {err && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
                        )}

                        <Button type="submit" className="mt-2 w-full" disabled={saving}>
                            {saving ? "가입 처리 중..." : "가입하기"}
                        </Button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-500">
                        이미 계정이 있으신가요?{" "}
                        <Link to="/login" className="font-semibold text-[rgb(var(--kkeut-primary))] hover:underline">
                            로그인하기
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
