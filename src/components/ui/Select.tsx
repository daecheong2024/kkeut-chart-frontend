import React from "react";
import { cn } from "../../lib/cn";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options?: { value: string; label: string }[];
};

export function Select({ className, children, options, ...props }: Props) {
  return (
    <select
      className={cn(
        "h-10 rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 text-sm outline-none focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]",
        className
      )}
      {...props}
    >
      {/* Support legacy options prop if used elsewhere, though current usage suggests children */}
      {options ? options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      )) : children}
    </select>
  );
}
