import { Fragment } from "react";

import { cn } from "@/lib/utils";

const tokenPattern =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function tokenClassName(token: string): string {
  if (/^"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:$/.test(token)) return "text-sky-300";
  if (/^"/.test(token)) return "text-emerald-300";
  if (/^(true|false)$/.test(token)) return "text-amber-300";
  if (token === "null") return "text-zinc-500";
  return "text-orange-300";
}

/**
 * Highlighter de JSON leve, sem dependências externas: tokeniza chaves,
 * strings, números, booleanos e null via regex e aplica cores Tailwind.
 */
export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  const json = JSON.stringify(value, null, 2);

  const parts: Array<{ text: string; isToken: boolean }> = [];
  let lastIndex = 0;
  for (const match of json.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ text: json.slice(lastIndex, index), isToken: false });
    }
    parts.push({ text: match[0], isToken: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < json.length) {
    parts.push({ text: json.slice(lastIndex), isToken: false });
  }

  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-400",
        className,
      )}
    >
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.isToken ? (
            <span className={tokenClassName(part.text)}>{part.text}</span>
          ) : (
            part.text
          )}
        </Fragment>
      ))}
    </pre>
  );
}
