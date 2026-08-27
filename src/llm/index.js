import { streamChatOpenAI, testKeyOpenAI } from './openai.js';
import { streamChatAnthropic, testKeyAnthropic } from './anthropic.js';
import { streamChatDeepSeek, testKeyDeepSeek } from './deepseek.js';

export function streamChat(provider, opts) {
  if (provider === 'anthropic') return streamChatAnthropic(opts);
  if (provider === 'deepseek') return streamChatDeepSeek(opts);
  return streamChatOpenAI(opts);
}

export function testKey(provider, opts) {
  if (provider === 'anthropic') return testKeyAnthropic(opts);
  if (provider === 'deepseek') return testKeyDeepSeek(opts);
  return testKeyOpenAI(opts);
}
