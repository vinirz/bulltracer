import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const EDGE_PADDING = 8;

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const bubbleWidth = bubbleRef.current?.offsetWidth ?? 0;
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;

    let left = triggerRect.left + triggerRect.width / 2 - bubbleWidth / 2;
    left = Math.min(Math.max(left, EDGE_PADDING), window.innerWidth - bubbleWidth - EDGE_PADDING);

    const top =
      side === "top"
        ? triggerRect.top - bubbleHeight - 8
        : triggerRect.bottom + 8;

    setPosition({ top, left });
  }, [open, side]);

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={id} tabIndex={0} className={cn("inline-flex outline-none", className)}>
        {children}
      </span>
      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.span
              ref={bubbleRef}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                visibility: position ? "visible" : "hidden",
              }}
              className={cn(
                "pointer-events-none z-50 w-max max-w-72 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 shadow-lg",
              )}
            >
              {content}
            </motion.span>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
