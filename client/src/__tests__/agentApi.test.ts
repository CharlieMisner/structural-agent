import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAgentHealth, sendChat, streamChat, AGENT_BASE_URL } from '../services/agentApi';

describe('agentApi service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAgentHealth', () => {
    it('returns health data when response is 200 OK', async () => {
      const mockHealth = {
        status: 'ok',
        service: 'statikor-agent',
        model: 'gemini-3.8-flash',
        api_key_configured: true,
        available_tools: ['tool_1'],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHealth,
      });

      const res = await checkAgentHealth({ authToken: 'test-token' });
      expect(res).toEqual(mockHealth);
      expect(global.fetch).toHaveBeenCalledWith(`${AGENT_BASE_URL}/health`, expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }));
    });

    it('returns null when fetch returns non-200 or throws', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      expect(await checkAgentHealth()).toBeNull();

      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      expect(await checkAgentHealth()).toBeNull();
    });
  });

  describe('sendChat', () => {
    it('sends POST /api/chat and returns response data', async () => {
      const mockChatRes = {
        response: 'Calculated moment is 50 kNm',
        tool_calls: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockChatRes,
      });

      const res = await sendChat({ prompt: 'calculate' }, { authToken: 'my-jwt-token' });
      expect(res).toEqual(mockChatRes);
      expect(global.fetch).toHaveBeenCalledWith(`${AGENT_BASE_URL}/api/chat`, expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-jwt-token',
        }),
      }));
    });

    it('throws error when /api/chat response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(sendChat({ prompt: 'calculate' })).rejects.toThrow('Agent request failed (400): Bad request');
    });
  });

  describe('streamChat', () => {
    it('handles streaming chunks, tokens, tool events, and completion', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"type": "token", "content": "Hello "}\n\n',
        'data: {"type": "tool_start", "tool": "max_moment", "input": {"w": 1}}\n\n',
        'data: {"type": "tool_end", "tool": "max_moment", "output": 10}\n\n',
        'data: {"type": "done"}\n\n',
      ];

      let readIdx = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (readIdx < chunks.length) {
            const val = encoder.encode(chunks[readIdx++]);
            return { done: false, value: val };
          }
          return { done: true, value: undefined };
        }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const onToken = vi.fn();
      const onToolStart = vi.fn();
      const onToolEnd = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await streamChat(
        { prompt: 'test' },
        { onToken, onToolStart, onToolEnd, onDone, onError },
        { authToken: 'stream-token' }
      );

      expect(onToken).toHaveBeenCalledWith('Hello ');
      expect(onToolStart).toHaveBeenCalledWith('max_moment', { w: 1 });
      expect(onToolEnd).toHaveBeenCalledWith('max_moment', 10);
      expect(onDone).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(`${AGENT_BASE_URL}/api/chat/stream`, expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stream-token',
        }),
      }));
    });

    it('handles stream error event and response error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const onError = vi.fn();
      await expect(
        streamChat({ prompt: 'test' }, { onToken: vi.fn(), onError })
      ).rejects.toThrow('Streaming failed (500): Internal server error');
      expect(onError).toHaveBeenCalled();
    });

    it('handles null body error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const onError = vi.fn();
      await expect(
        streamChat({ prompt: 'test' }, { onToken: vi.fn(), onError })
      ).rejects.toThrow('Response body is null');
    });

    it('handles stream error payload and non-json fallback', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"type": "error", "error": "LLM quota exceeded"}\n\n',
        'data: Plain non-json string token\n\n',
      ];

      let readIdx = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (readIdx < chunks.length) {
            const val = encoder.encode(chunks[readIdx++]);
            return { done: false, value: val };
          }
          return { done: true, value: undefined };
        }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const onToken = vi.fn();
      const onError = vi.fn();

      await streamChat({ prompt: 'test' }, { onToken, onError });
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onToken).toHaveBeenCalledWith('Plain non-json string token');
    });
  });
});
