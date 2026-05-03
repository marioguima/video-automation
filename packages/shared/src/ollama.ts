type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

type OllamaChatOptions = {
  baseUrl: string;
  model: string;
  messages: OllamaMessage[];
  format?: "json";
  temperature?: number;
  timeoutMs?: number;
  keepAlive?: string | number;
};

export async function ollamaHealth(baseUrl: string): Promise<{ ok: boolean; models: string[] }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) {
    return { ok: false, models: [] };
  }
  const data = (await res.json()) as { models?: { name?: string }[] };
  const models = data.models?.map((m) => m.name ?? "").filter(Boolean) ?? [];
  return { ok: true, models };
}

export async function ollamaChat(options: OllamaChatOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 600000);
  const res = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      format: options.format,
      stream: false,
      temperature: options.temperature,
      keep_alive: options.keepAlive
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}
