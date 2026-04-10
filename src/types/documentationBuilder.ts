/**
 * ISSUE-175: 블록 기반 동의서 빌더 타입 정의
 *
 * 동의서는 4개 섹션(body / patient_input / doctor_sign / patient_sign)으로 구성되며,
 * 각 섹션은 여러 블록(date / text_chart / text_content / choice)을 가질 수 있다.
 *
 * 백엔드에는 JSON.stringify(structured) 형태로 Content 컬럼에 저장되며,
 * StructureType="structured" 일 때만 이 구조를 사용한다.
 */

export type SectionKey = "body" | "patient_input" | "doctor_sign" | "patient_sign";

export type BlockType = "date" | "text_chart" | "text_content" | "choice";

export interface DateBlock {
    id: string;
    type: "date";
    title: string;
    required: boolean;
}

export interface TextChartBlock {
    id: string;
    type: "text_chart";
    title: string;
    required: boolean;
    /** 차트에서 입력 안내 placeholder (선택) */
    placeholder?: string;
}

export type TextSize = "sm" | "base" | "lg";
export type TextWeight = "normal" | "bold";
export type TextColor = "default" | "muted" | "danger" | "primary";

export interface TextContentBlock {
    id: string;
    type: "text_content";
    title: string;
    required: boolean;
    /** 고정 안내 문구 본문 */
    content: string;
    /** 본문 스타일 옵션 (글씨 크기/굵기/색상) */
    fontSize?: TextSize;
    fontWeight?: TextWeight;
    color?: TextColor;
}

export interface ChoiceOption {
    id: string;
    label: string;
    /** 옆에 비고 입력란 표시 여부 (예: "기타: ___") */
    hasNote: boolean;
}

export interface ChoiceBlock {
    id: string;
    type: "choice";
    title: string;
    required: boolean;
    selectionType: "single" | "multi";
    options: ChoiceOption[];
}

export type DocumentationBlock = DateBlock | TextChartBlock | TextContentBlock | ChoiceBlock;

export interface DocumentationSection {
    key: SectionKey;
    blocks: DocumentationBlock[];
}

/** 의사 서명란 설정 */
export interface DoctorSignatureConfig {
    /** 담당의 서명 받기 */
    primary: boolean;
    /** 설명자 서명 받기 */
    explainer: boolean;
}

/** 환자 서명란 설정 */
export interface PatientSignatureConfig {
    /** 환자와의 관계 입력 받기 */
    relation: boolean;
    /** 환자 서명 받기 */
    patient: boolean;
    /** 법정 대리인 서명 받기 */
    legalGuardian: boolean;
    /** 대리인 사유 옵션 (체크박스) */
    legalGuardianReasons: ChoiceOption[];
}

export interface SignatureConfig {
    doctor: DoctorSignatureConfig;
    patient: PatientSignatureConfig;
}

export interface DocumentationStructured {
    sections: DocumentationSection[];
    signatureConfig: SignatureConfig;
}

// ============================================================
// Helpers
// ============================================================

export const SECTION_LABELS: Record<SectionKey, string> = {
    body: "본문",
    patient_input: "환자 입력란",
    doctor_sign: "의사 서명란",
    patient_sign: "환자 서명란",
};

export const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
    body: "안내문, 날짜, 선택형 항목 등 자유롭게 구성",
    patient_input: "환자가 직접 작성하는 항목 (서술형, 선택형)",
    doctor_sign: "담당의/설명자 서명을 받는 영역",
    patient_sign: "환자/법정 대리인 서명 + 대리 사유",
};

/** 섹션별로 허용되는 블록 타입 (signature 섹션은 별도 panel 사용) */
export const ALLOWED_BLOCK_TYPES_BY_SECTION: Record<SectionKey, BlockType[]> = {
    body: ["date", "text_chart", "text_content", "choice"],
    patient_input: ["text_chart", "text_content", "choice"],
    doctor_sign: [],
    patient_sign: [],
};

/** signature 섹션 여부 — 별도 패널 렌더링 */
export function isSignatureSection(key: SectionKey): boolean {
    return key === "doctor_sign" || key === "patient_sign";
}

export const BLOCK_LABELS: Record<BlockType, string> = {
    date: "날짜 입력란",
    text_chart: "서술형 작성란",
    text_content: "서술형 내용",
    choice: "선택형 내용",
};

/** 새 블록 ID 생성 */
export function newBlockId(): string {
    return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function newOptionId(): string {
    return `opt_${Math.random().toString(36).slice(2, 8)}`;
}

/** 블록 타입별 디폴트 인스턴스 생성 */
export function createBlock(type: BlockType): DocumentationBlock {
    const id = newBlockId();
    const baseTitle = BLOCK_LABELS[type];
    switch (type) {
        case "date":
            return { id, type, title: baseTitle, required: false };
        case "text_chart":
            return { id, type, title: baseTitle, required: false };
        case "text_content":
            return {
                id,
                type,
                title: baseTitle,
                required: false,
                content: "",
                fontSize: "base",
                fontWeight: "normal",
                color: "default",
            };
        case "choice":
            return {
                id,
                type,
                title: baseTitle,
                required: true,
                selectionType: "single",
                options: [],
            };
    }
}

/** 기본 대리인 사유 옵션 6개 */
export function createDefaultLegalGuardianReasons(): ChoiceOption[] {
    return [
        { id: newOptionId(), label: "신체적 정신적 장애로 또는 미성년자로 내용에 대해서 이해하지 못함", hasNote: false },
        { id: newOptionId(), label: "환자 본인이 승낙에 대한 권한을 특정인에게 위임함", hasNote: false },
        { id: newOptionId(), label: "환자가 미성년자로서 설명내용에 대하여 이해하지 못함", hasNote: false },
        { id: newOptionId(), label: "전화동의 (환자의 의식이 없고 환자보호자 현장 부재시)", hasNote: false },
        { id: newOptionId(), label: "환자의 의식이 없고 응급상태인 경우", hasNote: false },
        { id: newOptionId(), label: "기타", hasNote: true },
    ];
}

/** 빈 동의서 구조 (4 섹션, 빈 블록 배열, 기본 서명 설정) */
export function createEmptyStructured(): DocumentationStructured {
    return {
        sections: [
            { key: "body", blocks: [] },
            { key: "patient_input", blocks: [] },
            { key: "doctor_sign", blocks: [] },
            { key: "patient_sign", blocks: [] },
        ],
        signatureConfig: {
            doctor: { primary: false, explainer: false },
            patient: {
                relation: true,
                patient: true,
                legalGuardian: true,
                legalGuardianReasons: createDefaultLegalGuardianReasons(),
            },
        },
    };
}

/** JSON 문자열 → DocumentationStructured (안전 파싱) */
export function parseStructured(content: string | null | undefined): DocumentationStructured {
    if (!content || !content.trim()) return createEmptyStructured();
    try {
        const parsed = JSON.parse(content);
        if (!parsed || !Array.isArray(parsed.sections)) return createEmptyStructured();

        const sectionMap = new Map<SectionKey, DocumentationSection>();
        for (const section of parsed.sections) {
            if (!section?.key) continue;
            sectionMap.set(section.key, {
                key: section.key,
                blocks: Array.isArray(section.blocks) ? section.blocks : [],
            });
        }

        const sections: DocumentationSection[] = (["body", "patient_input", "doctor_sign", "patient_sign"] as SectionKey[]).map(
            (key) => sectionMap.get(key) ?? { key, blocks: [] }
        );

        const defaultEmpty = createEmptyStructured();
        const signatureConfig: SignatureConfig = parsed.signatureConfig
            ? {
                doctor: {
                    primary: Boolean(parsed.signatureConfig.doctor?.primary),
                    explainer: Boolean(parsed.signatureConfig.doctor?.explainer),
                },
                patient: {
                    relation: parsed.signatureConfig.patient?.relation ?? true,
                    patient: parsed.signatureConfig.patient?.patient ?? true,
                    legalGuardian: parsed.signatureConfig.patient?.legalGuardian ?? true,
                    legalGuardianReasons: Array.isArray(parsed.signatureConfig.patient?.legalGuardianReasons)
                        ? parsed.signatureConfig.patient.legalGuardianReasons
                        : createDefaultLegalGuardianReasons(),
                },
            }
            : defaultEmpty.signatureConfig;

        return { sections, signatureConfig };
    } catch {
        return createEmptyStructured();
    }
}

/** DocumentationStructured → JSON string (저장용) */
export function serializeStructured(structured: DocumentationStructured): string {
    return JSON.stringify(structured);
}

/** TextContentBlock 스타일 → CSS 클래스 (미리보기/실제 렌더 공용) */
export function textContentStyleClass(block: TextContentBlock): string {
    const sizeClass: Record<TextSize, string> = {
        sm: "text-[12px]",
        base: "text-[13px]",
        lg: "text-[16px]",
    };
    const weightClass: Record<TextWeight, string> = {
        normal: "font-normal",
        bold: "font-bold",
    };
    const colorClass: Record<TextColor, string> = {
        default: "text-[#2A1F22]",
        muted: "text-[#8B5A66]",
        danger: "text-[#C53030]",
        primary: "text-[#8B3F50]",
    };
    return [
        sizeClass[block.fontSize ?? "base"],
        weightClass[block.fontWeight ?? "normal"],
        colorClass[block.color ?? "default"],
    ].join(" ");
}
