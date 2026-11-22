import type { Api } from "grammy";

/** Base64 without Node's Buffer (works in Workers). Chunked to stay fast on ~1 MB files. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Download a Telegram file into memory (never stored — Spec 4.5).
 * The URL contains the bot token, so it is never logged.
 */
export async function downloadTelegramFile(
  api: Api,
  token: string,
  fileId: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error("telegram file has no path");
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`telegram file download failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("voice file too large");
  return bytes;
}
