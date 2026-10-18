import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-200",
  success: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  danger: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
  warning: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  info: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  outline: "border border-zinc-700 text-zinc-300",
};

const dotClasses: Record<BadgeVariant, string> = {
  default: "bg-zinc-400",
  success: "bg-emerald-400",
  danger: "bg-red-400",
  warning: "bg-amber-400",
  info: "bg-blue-400",
  outline: "bg-zinc-500",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Exibe um ponto pulsante, para sinalizar estados ativos/críticos ao vivo. */
  pulse?: boolean;
}

export function Badge({
  className,
  variant = "default",
  pulse,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              dotClasses[variant],
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              dotClasses[variant],
            )}
          />
        </span>
      ) : null}
      {children}
    </span>
  );
}
