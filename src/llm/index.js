import { streamChatOpenAI, testKeyOpenAI } from './openai.js';
import { streamChatAnthropic, testKeyAnthropic } from './anthropic.js';

export function streamChat(provider, opts) {
  if (provider === 'anthropic') return streamChatAnthropic(opts);
  return streamChatOpenAI(opts);
}

export function testKey(provider, opts) {
  if (provider === 'anthropic') return testKeyAnthropic(opts);
  return testKeyOpenAI(opts);
}
