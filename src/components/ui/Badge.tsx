import { cn } from "../../lib/cn";

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[rgb(var(--kkeut-border))] bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700",
        className
      )}
    >
      {children}
    </span>
  );
}
