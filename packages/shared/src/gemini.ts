type GeminiRole = "system" | "user" | "assistant";

type GeminiMessage = { role: GeminiRole; content: string };

type GeminiChatOptions = {
  apiKey: string;
  model: string;
  messages: GeminiMessage[];
  baseUrl?: string;
  format?: "json";
  temperature?: number;
  timeoutMs?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function toGeminiRole(role: GeminiRole): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

export async function geminiChat(options: GeminiChatOptions): Promise<string> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }
  const model = options.model.trim();
  if (!model) {
    throw new Error("Gemini model is required");
  }

  const systemText = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const contents = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: toGeminiRole(message.role),
      parts: [{ text: message.content }]
    }));

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: systemText || "Return a valid JSON object." }] });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature
  };
  if (options.format === "json") {
    generationConfig.responseMimeType = "application/json";
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig
  };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 600000);
  const baseUrl = (options.baseUrl ?? DEFAULT_GEMINI_BASE_URL).replace(/\/$/, "");
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const responseText = await res.text();
  let data: GeminiResponse = {};
  try {
    data = JSON.parse(responseText) as GeminiResponse;
  } catch {
    data = { error: { message: responseText } };
  }
  if (!res.ok) {
    throw new Error(`Gemini chat failed: ${res.status} ${data.error?.message ?? "unknown error"}`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini prompt blocked: ${data.promptFeedback.blockReason}`);
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return text;
}
