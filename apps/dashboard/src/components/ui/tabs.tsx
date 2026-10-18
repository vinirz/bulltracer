import { motion } from "motion/react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  layoutId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Componentes de Tabs devem estar dentro de <Tabs>");
  return ctx;
}

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const layoutId = useId();
  const value = controlledValue ?? uncontrolledValue;
  const setValue = onValueChange ?? setUncontrolledValue;
  return (
    <TabsContext.Provider value={{ value, setValue, layoutId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
  activeClassName,
}: {
  value: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const { value: active, setValue, layoutId } = useTabsContext();
  const isActive = active === value;

  return (
    <button
      type="button"
      onClick={() => setValue(value)}
      className={cn(
        "relative rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200",
        isActive && "text-zinc-100",
        className,
      )}
    >
      {isActive ? (
        <motion.span
          layoutId={`${layoutId}-indicator`}
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
          className={cn("absolute inset-0 rounded-md bg-zinc-800", activeClassName)}
        />
      ) : null}
      <span className="relative">{children}</span>
    </button>
  );
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  const { value: active } = useTabsContext();
  if (active !== value) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="mt-3"
    >
      {children}
    </motion.div>
  );
}
