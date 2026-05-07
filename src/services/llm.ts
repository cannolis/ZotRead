import { getPref } from "../utils/prefs";

/**
 * OpenAI-compatible chat completion client.
 *
 * Designed to work with any OpenAI-compatible endpoint:
 *   - DeepSeek:    baseURL = https://api.deepseek.com    (default)
 *   - OpenRouter:  baseURL = https://openrouter.ai/api/v1
 *   - OpenAI:      baseURL = https://api.openai.com/v1
 *   - Local Ollama: baseURL = http://localhost:11434/v1
 *
 * Reads `baseURL`, `apiKey`, `model` from Zotero preferences.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  seed?: number;
}

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function readConfig(): LLMConfig {
  const baseURL = (getPref("llm.baseURL") as string) || DEFAULT_BASE_URL;
  const apiKey = (getPref("llm.apiKey") as string) || "";
  const model = (getPref("llm.model") as string) || DEFAULT_MODEL;
  return { baseURL: baseURL.replace(/\/+$/, ""), apiKey, model };
}

let lastErrorToastAt = 0;
function maybeToastError(msg: string): void {
  // De-dup: suppress repeat toasts within 20 s — LLM failures tend to cascade
  // across batch calls and we don't want to spam the UI.
  const now = Date.now();
  if (now - lastErrorToastAt < 20_000) return;
  lastErrorToastAt = now;
  try {
    // Lazy-load to avoid a circular import at module init.
    import("../modules/toast")
      .then(({ toastError }) => toastError(`ZotRead LLM: ${msg}`))
      .catch(() => undefined);
  } catch (_e) {
    /* ignore */
  }
}

export async function chat(
  messages: ChatMessage[],
  options: LLMCallOptions = {},
): Promise<string> {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    const e = new Error(
      "No API key configured. Open Settings → ZotRead and paste one.",
    );
    maybeToastError(e.message);
    throw e;
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: options.temperature ?? 0.3,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  // Deterministic runs — provider ignores if unsupported.
  if (typeof options.seed === "number") body.seed = options.seed;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  // OpenRouter asks for these optional headers for ranking stats
  if (cfg.baseURL.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://zotread.app";
    headers["X-Title"] = "ZotRead";
  }

  const url = `${cfg.baseURL}/chat/completions`;
  Zotero.debug(`[ZotRead] LLM call: ${cfg.model} @ ${cfg.baseURL}`);

  try {
    const response = await Zotero.HTTP.request("POST", url, {
      headers,
      body: JSON.stringify(body),
      responseType: "json",
      timeout: 60000,
    });

    const json = response.response as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (json.error) {
      const msg = json.error.message ?? "unknown error";
      maybeToastError(msg);
      throw new Error(`LLM error: ${msg}`);
    }
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      maybeToastError("empty response");
      throw new Error("LLM returned no content");
    }
    return text;
  } catch (e) {
    const msg = String(e);
    // Don't double-toast errors we already surfaced above.
    if (
      !msg.startsWith("Error: LLM error:") &&
      !msg.includes("empty response")
    ) {
      maybeToastError(msg.slice(0, 120));
    }
    throw e;
  }
}

export async function chatJSON<T>(
  messages: ChatMessage[],
  options: LLMCallOptions = {},
): Promise<T> {
  const raw = await chat(messages, {
    ...options,
    responseFormat: "json_object",
  });
  // Defensive: some providers wrap or add markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    Zotero.debug(`[ZotRead] JSON parse failed, raw: ${raw}`);
    throw new Error(`LLM returned non-JSON: ${(e as Error).message}`);
  }
}

export async function ping(): Promise<boolean> {
  try {
    await chat(
      [{ role: "user", content: "Reply with the single word: pong" }],
      { maxTokens: 10 },
    );
    return true;
  } catch (e) {
    Zotero.debug(`[ZotRead] LLM ping failed: ${String(e)}`);
    return false;
  }
}
