import React from "react";
import { cn } from "../../lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-[rgb(var(--kkeut-border))] bg-white px-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[rgba(var(--kkeut-primary),.55)] focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.15)]",
        className
      )}
      {...props}
    />
  );
}
