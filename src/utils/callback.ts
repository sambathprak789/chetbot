import type { Lang } from "../messages";

/** Inline button payloads (Telegram limit: 64 bytes). */
export type Action =
  | { type: "like" | "dislike"; requestId: number; batch: number }
  | { type: "more"; requestId: number }
  | { type: "lang"; language: Lang; requestId: number }
  | { type: "delete"; confirm: boolean };

export function encodeAction(a: Action): string {
  switch (a.type) {
    case "like":
    case "dislike":
      return `${a.type}:${a.requestId}:${a.batch}`;
    case "more":
      return `more:${a.requestId}`;
    case "lang":
      return `lang:${a.language}:${a.requestId}`;
    case "delete":
      return `del:${a.confirm ? "yes" : "no"}`;
  }
}

const int = (s: string | undefined) => (s && /^\d{1,12}$/.test(s) ? Number(s) : null);

/** Returns null for anything we did not create (never trust callback data). */
export function decodeAction(data: string | undefined): Action | null {
  const [type, a, b] = (data ?? "").split(":");
  if (type === "like" || type === "dislike") {
    const requestId = int(a);
    const batch = int(b);
    return requestId && batch ? { type, requestId, batch } : null;
  }
  if (type === "more") {
    const requestId = int(a);
    return requestId ? { type, requestId } : null;
  }
  if (type === "lang" && (a === "km" || a === "en")) {
    const requestId = int(b);
    return requestId ? { type, language: a, requestId } : null;
  }
  if (type === "del" && (a === "yes" || a === "no") && b === undefined) {
    return { type: "delete", confirm: a === "yes" };
  }
  return null;
}
