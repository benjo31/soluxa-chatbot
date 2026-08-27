import OpenAI from 'openai';

// DeepSeek expose une API compatible OpenAI sur https://api.deepseek.com
export async function* streamChatDeepSeek({ apiKey, model, system, messages }) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const stream = await client.chat.completions.create({
    model: model || 'deepseek-chat',
    stream: true,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function testKeyDeepSeek({ apiKey, model }) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const r = await client.chat.completions.create({
    model: model || 'deepseek-chat',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  });
  return !!r.choices?.[0]?.message;
}
