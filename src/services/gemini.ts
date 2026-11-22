/** Minimal Gemini REST client (generateContent with JSON output). */

import { takeGlobalSlot } from "../db/usage";
import { pacificDate } from "../utils/time";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
  /** 429 = quota used up; retrying right away won't help. */
  get isQuota(): boolean {
    return this.status === 429;
  }
}

export async function generateJson(
  env: Pick<Env, "GEMINI_API_KEY" | "GEMINI_MODEL" | "DB" | "DAILY_GLOBAL_LIMIT">,
  opts: { system: string; parts: GeminiPart[]; schema: object; temperature?: number },
): Promise<{ json: unknown; usage: GeminiUsage }> {
  // Every call (retries too) counts against the shared daily budget (Spec 6.4)
  if (!(await takeGlobalSlot(env.DB, pacificDate(Date.now()), Number(env.DAILY_GLOBAL_LIMIT)))) {
    throw new GeminiError(429, "DAILY_GLOBAL_LIMIT reached");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: opts.schema,
        temperature: opts.temperature ?? 0.7,
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new GeminiError(res.status, `Gemini HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const usage: GeminiUsage = {
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new GeminiError(
      200,
      `Gemini returned no text (${data.candidates?.[0]?.finishReason ?? "?"})`,
    );
  }
  return { json: JSON.parse(text), usage }; // SyntaxError if the model broke the JSON
}
