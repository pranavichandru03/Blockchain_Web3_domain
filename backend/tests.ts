import { getAIResponse } from '../../backend.js';
import { jest } from '@jest/globals';

// Mock OpenAI
jest.mock('openai', () => ({
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: "Mocked AI response" } }],
        usage: { total_tokens: 42 }
      })
    }
  }
}));

describe('AI Service', () => {
  it('returns a cached response if available', async () => {
    const cacheKey = 'test-cache';
    const response1 = await getAIResponse([], cacheKey);
    const response2 = await getAIResponse([], cacheKey);
    expect(response1).toEqual(response2); // Cache hit
  });

  it('handles API errors gracefully', async () => {
    require('openai').chat.completions.create.mockRejectedValueOnce(new Error('API failed'));
    await expect(getAIResponse([{ role: 'user', content: 'Hi' }])).rejects.toThrow('API failed');
  });
});