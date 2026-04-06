import React from "react";
import { cn } from "../../lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-9" : "h-10",
        variant === "primary" &&
          "bg-[rgb(var(--kkeut-primary))] text-white hover:opacity-95 focus:ring-[rgba(var(--kkeut-primary),.35)]",
        variant === "outline" &&
          "border border-[rgb(var(--kkeut-border))] bg-white text-[rgb(var(--kkeut-ink))] hover:bg-gray-50 focus:ring-gray-200",
        variant === "ghost" &&
          "bg-transparent text-[rgb(var(--kkeut-ink))] hover:bg-gray-100 focus:ring-gray-200",
        className
      )}
      {...props}
    />
  );
}
