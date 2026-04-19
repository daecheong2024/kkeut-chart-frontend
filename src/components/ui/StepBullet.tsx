interface StepBulletProps {
    n: number;
    size?: "sm" | "md" | "lg";
    tone?: "default" | "muted";
}

const SIZE_MAP: Record<NonNullable<StepBulletProps["size"]>, string> = {
    sm: "h-4 w-4 text-[9px]",
    md: "h-6 w-6 text-[10px]",
    lg: "h-7 w-7 text-[12px]",
};

export function StepBullet({ n, size = "md", tone = "default" }: StepBulletProps) {
    const bg = tone === "muted" ? "bg-[#C9A0A8]" : "bg-[#D27A8C]";
    return (
        <span className={`inline-flex items-center justify-center rounded-full font-extrabold text-white shrink-0 ${SIZE_MAP[size]} ${bg}`}>
            {n}
        </span>
    );
}
