import OpenAI from 'openai';

export async function* streamChatOpenAI({ apiKey, model, system, messages }) {
  const client = new OpenAI({ apiKey });
  const stream = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
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

export async function testKeyOpenAI({ apiKey, model }) {
  const client = new OpenAI({ apiKey });
  const r = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  });
  return !!r.choices?.[0]?.message;
}
