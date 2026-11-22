/** Minimal Gemini REST client (generateContent with JSON output). */

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
  env: Pick<Env, "GEMINI_API_KEY" | "GEMINI_MODEL">,
  opts: { system: string; parts: GeminiPart[]; schema: object; temperature?: number },
): Promise<{ json: unknown; usage: GeminiUsage }> {
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
