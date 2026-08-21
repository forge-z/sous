export type AIMessage = { role: "system" | "user" | "assistant"; content: string };
export interface AIProvider { name: string; complete(messages: AIMessage[]): Promise<string> }

class MockProvider implements AIProvider {
  name = "mock";
  async complete() { return "Use the urgent ingredients first, then build a simple meal around them."; }
}

class OpenAICompatibleProvider implements AIProvider {
  name = "openai-compatible";
  async complete(messages: AIMessage[]) {
    const baseUrl = process.env.AI_BASE_URL;
    const key = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL;
    if (!baseUrl || !key || !model) throw new Error("AI provider is not configured");
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ model, messages, temperature: 0.4 })
    });
    if (!response.ok) throw new Error("AI provider request failed");
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export function getAIProvider(): AIProvider {
  return process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock" ? new OpenAICompatibleProvider() : new MockProvider();
}
