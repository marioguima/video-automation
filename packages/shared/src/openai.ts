type OpenAiRole = "system" | "user" | "assistant";

type OpenAiMessage = { role: OpenAiRole; content: string };

type OpenAiChatOptions = {
  apiKey: string;
  model: string;
  messages: OpenAiMessage[];
  baseUrl?: string;
  format?: "json";
  temperature?: number;
  timeoutMs?: number;
};

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export async function openAiCompatibleChat(options: OpenAiChatOptions): Promise<string> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("API key is required");
  }
  const model = options.model.trim();
  if (!model) {
    throw new Error("Model is required");
  }

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature
  };
  if (options.format === "json") {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 600000);
  const baseUrl = (options.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const responseText = await res.text();
  let data: OpenAiChatResponse = {};
  try {
    data = JSON.parse(responseText) as OpenAiChatResponse;
  } catch {
    data = { error: { message: responseText } };
  }

  if (!res.ok) {
    throw new Error(`OpenAI-compatible chat failed: ${res.status} ${data.error?.message ?? "unknown error"}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("OpenAI-compatible provider returned an empty response");
  }
  return text;
}
