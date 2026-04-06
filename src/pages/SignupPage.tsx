import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import apiClient from "../services/apiClient";

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

    useEffect(() => {
        apiClient.get("/branches").then((res) => {
            setBranches(Array.isArray(res.data) ? res.data : []);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!formData.branchId) { setDepartments([]); return; }
        apiClient.get(`/settings/departments?branchId=${formData.branchId}`).then((res) => {
            const data = res.data;
            const items = Array.isArray(data) ? data : (data?.items ?? []);
            setDepartments(items);
        }).catch(() => setDepartments([]));
    }, [formData.branchId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);

        // Basic Validation
        if (!formData.email || !formData.password || !formData.passwordConfirm || !formData.name || !formData.phone || !formData.branchId || !formData.partId || !formData.birthDate) {
            setErr("모든 필드를 입력해 주세요.");
            return;
        }

        // Specific Validations
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            setErr("올바른 이메일 형식이 아닙니다.");
            return;
        }

        if (formData.password.length < 8) {
            setErr("비밀번호는 8자 이상이어야 합니다.");
            return;
        }

        if (formData.password !== formData.passwordConfirm) {
            setErr("비밀번호가 일치하지 않습니다.");
            return;
        }

        const phoneRegex = /^01(?:0|1|[6-9])(?:\d{3}|\d{4})\d{4}$/; // Generic Generic KR mobile number format (010, 011, etc without hyphens or allowing hyphens)
        // Let's make it a bit flexible: allow 010-1234-5678 or 01012345678
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
            console.error(e);
            console.log("SERVER ERROR DETAIL:", e.response?.data); // [NEW] Check this in browser console
            const msg = e.response?.data?.message || "회원가입 처리 중 오류가 발생했습니다.";
            setErr(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="kkeut-bg-soft min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="rounded-[28px] border border-[rgb(var(--kkeut-border))] bg-white p-8 shadow-soft">
                    <div className="mb-6 flex flex-col items-center">
                        <BrandMark />
                        <h1 className="mt-4 text-xl font-bold text-gray-900">회원가입</h1>
                        <p className="mt-2 text-sm text-gray-500">
                            KKEUT Clinic Network에 오신 것을 환영합니다.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                아이디 (이메일)
                            </label>
                            <Input
                                name="email"
                                type="email"
                                placeholder="name@company.com"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                비밀번호
                            </label>
                            <Input
                                name="password"
                                type="password"
                                placeholder="8자 이상 입력해주세요"
                                value={formData.password}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                비밀번호 확인
                            </label>
                            <Input
                                name="passwordConfirm"
                                type="password"
                                placeholder="비밀번호를 다시 입력해주세요"
                                value={formData.passwordConfirm}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                이름
                            </label>
                            <Input
                                name="name"
                                placeholder="홍길동"
                                value={formData.name}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                휴대폰 번호
                            </label>
                            <Input
                                name="phone"
                                placeholder="010-1234-5678"
                                value={formData.phone}
                                onChange={handleChange}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                지점 선택
                            </label>
                            <select
                                name="branchId"
                                className="w-full rounded-xl border border-[rgb(var(--kkeut-border))] bg-[rgb(var(--kkeut-bg-input))] px-3 py-2.5 text-sm focus:border-[rgb(var(--kkeut-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--kkeut-primary))] disabled:opacity-50"
                                value={formData.branchId}
                                onChange={handleChange}
                            >
                                <option value="">지점을 선택하세요</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                파트(직무) 선택
                            </label>
                            <select
                                name="partId"
                                className="w-full rounded-xl border border-[rgb(var(--kkeut-border))] bg-[rgb(var(--kkeut-bg-input))] px-3 py-2.5 text-sm focus:border-[rgb(var(--kkeut-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--kkeut-primary))] disabled:opacity-50"
                                value={formData.partId}
                                onChange={handleChange}
                            >
                                <option value="">부서를 선택하세요</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                생년월일
                            </label>
                            <Input
                                name="birthDate"
                                type="date"
                                value={formData.birthDate}
                                onChange={handleChange}
                            />
                        </div>

                        {err && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {err}
                            </div>
                        )}

                        <Button type="submit" className="w-full mt-4" disabled={saving}>
                            {saving ? "가입 처리 중..." : "가입하기"}
                        </Button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-600">
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
