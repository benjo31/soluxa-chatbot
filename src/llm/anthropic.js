import Anthropic from '@anthropic-ai/sdk';

export async function* streamChatAnthropic({ apiKey, model, system, messages }) {
  const client = new Anthropic({ apiKey });
  const stream = await client.messages.stream({
    model: model || 'claude-haiku-4-5',
    max_tokens: 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function testKeyAnthropic({ apiKey, model }) {
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: model || 'claude-haiku-4-5',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  });
  return !!r.content?.[0];
}
