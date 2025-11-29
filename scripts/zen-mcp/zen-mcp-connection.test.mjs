import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZenMcpConnection } from './zen-mcp-connection.mjs';

describe('ZenMcpConnection', () => {
  let connection;
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    connection = new ZenMcpConnection({ fetch: mockFetch });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default timeout of 10000ms', () => {
      const conn = new ZenMcpConnection();
      expect(conn.timeout).toBe(10000);
    });

    it('should accept custom timeout', () => {
      const conn = new ZenMcpConnection({ timeout: 5000 });
      expect(conn.timeout).toBe(5000);
    });

    it('should use provided fetch function', () => {
      const customFetch = vi.fn();
      const conn = new ZenMcpConnection({ fetch: customFetch });
      expect(conn.fetch).toBe(customFetch);
    });

    it('should use globalThis.fetch if not provided', () => {
      const conn = new ZenMcpConnection();
      expect(conn.fetch).toBeDefined();
    });
  });

  describe('_getTestEndpoint', () => {
    it('should return Gemini endpoint', () => {
      const endpoint = connection._getTestEndpoint('gemini');
      expect(endpoint).toBe('https://generativelanguage.googleapis.com/v1/models');
    });

    it('should return OpenAI endpoint', () => {
      const endpoint = connection._getTestEndpoint('openai');
      expect(endpoint).toBe('https://api.openai.com/v1/models');
    });

    it('should return OpenRouter endpoint', () => {
      const endpoint = connection._getTestEndpoint('openrouter');
      expect(endpoint).toBe('https://openrouter.ai/api/v1/models');
    });

    it('should return XAI endpoint', () => {
      const endpoint = connection._getTestEndpoint('xai');
      expect(endpoint).toBe('https://api.x.ai/v1/models');
    });

    it('should throw error for Azure without endpoint option', () => {
      expect(() => {
        connection._getTestEndpoint('azure');
      }).toThrow('Azure OpenAI requires an endpoint URL');
    });

    it('should return Azure endpoint with custom option', () => {
      const endpoint = connection._getTestEndpoint('azure', {
        endpoint: 'https://mydeployment.openai.azure.com',
      });
      expect(endpoint).toBe(
        'https://mydeployment.openai.azure.com/openai/models?api-version=2024-02-15-preview'
      );
    });

    it('should throw error for DIAL without endpoint option', () => {
      expect(() => {
        connection._getTestEndpoint('dial');
      }).toThrow('DIAL requires an endpoint URL');
    });

    it('should return DIAL endpoint with custom option', () => {
      const endpoint = connection._getTestEndpoint('dial', {
        endpoint: 'https://my-dial-server.com',
      });
      expect(endpoint).toBe('https://my-dial-server.com/v1/models');
    });

    it('should throw error for unknown provider', () => {
      expect(() => {
        connection._getTestEndpoint('unknown-provider');
      }).toThrow('Unknown provider: unknown-provider');
    });
  });

  describe('_getAuthHeader', () => {
    it('should return x-goog-api-key for Gemini', () => {
      const header = connection._getAuthHeader('gemini', 'test-key-123');
      expect(header).toEqual({ 'x-goog-api-key': 'test-key-123' });
    });

    it('should return Bearer token for OpenAI', () => {
      const header = connection._getAuthHeader('openai', 'sk-test-123');
      expect(header).toEqual({ Authorization: 'Bearer sk-test-123' });
    });

    it('should return Bearer token for OpenRouter', () => {
      const header = connection._getAuthHeader('openrouter', 'test-key-123');
      expect(header).toEqual({ Authorization: 'Bearer test-key-123' });
    });

    it('should return api-key for Azure', () => {
      const header = connection._getAuthHeader('azure', 'azure-key-123');
      expect(header).toEqual({ 'api-key': 'azure-key-123' });
    });

    it('should return Bearer token for XAI', () => {
      const header = connection._getAuthHeader('xai', 'xai-key-123');
      expect(header).toEqual({ Authorization: 'Bearer xai-key-123' });
    });

    it('should return Bearer token for DIAL', () => {
      const header = connection._getAuthHeader('dial', 'dial-key-123');
      expect(header).toEqual({ Authorization: 'Bearer dial-key-123' });
    });

    it('should throw error for unknown provider', () => {
      expect(() => {
        connection._getAuthHeader('unknown-provider', 'key');
      }).toThrow('Unknown provider: unknown-provider');
    });
  });

  describe('testProvider - OpenRouter', () => {
    it('should return success with latency and model count', async () => {
      const responseData = {
        data: [{ id: 'model-1' }, { id: 'model-2' }, { id: 'model-3' }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(responseData),
      });

      const result = await connection.testProvider('openrouter', 'test-key');

      expect(result).toEqual({
        success: true,
        provider: 'openrouter',
        latencyMs: expect.any(Number),
        modelCount: 3,
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include latency measurement', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const result = await connection.testProvider('openrouter', 'key');

      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
    });
  });

  describe('testProvider - OpenAI', () => {
    it('should return success for OpenAI', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'm1' }, { id: 'm2' }] }),
      });

      const result = await connection.testProvider('openai', 'sk-test');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('openai');
      expect(result.modelCount).toBe(2);
    });

    it('should use correct auth header for OpenAI', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await connection.testProvider('openai', 'sk-test-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-123',
          }),
        })
      );
    });
  });

  describe('testProvider - Gemini', () => {
    it('should return success for Gemini', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ models: [{ name: 'model1' }] }),
      });

      const result = await connection.testProvider('gemini', 'test-key');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('gemini');
      expect(result.modelCount).toBe(1);
    });

    it('should use correct auth header for Gemini', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      await connection.testProvider('gemini', 'api-key-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'api-key-123',
          }),
        })
      );
    });
  });

  describe('testProvider - XAI', () => {
    it('should return success for XAI', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'grok-1' }] }),
      });

      const result = await connection.testProvider('xai', 'xai-test-key');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('xai');
      expect(result.modelCount).toBe(1);
    });

    it('should use correct auth header for XAI', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await connection.testProvider('xai', 'xai-key-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer xai-key-123',
          }),
        })
      );
    });
  });

  describe('testProvider - Azure (without endpoint)', () => {
    it('should return success with note about endpoint requirement', async () => {
      const result = await connection.testProvider('azure', 'azure-key');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('azure');
      expect(result.note).toContain('endpoint required');
      expect(result.modelCount).toBe(0);
    });
  });

  describe('testProvider - Azure (with endpoint)', () => {
    it('should test with custom endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'gpt-4' }] }),
      });

      const result = await connection.testProvider('azure', 'azure-key', {
        endpoint: 'https://myinstance.openai.azure.com',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('azure');
      expect(result.modelCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('myinstance.openai.azure.com'),
        expect.any(Object)
      );
    });
  });

  describe('testProvider - DIAL (without endpoint)', () => {
    it('should return success with note about endpoint requirement', async () => {
      const result = await connection.testProvider('dial', 'dial-key');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('dial');
      expect(result.note).toContain('endpoint required');
      expect(result.modelCount).toBe(0);
    });
  });

  describe('testProvider - DIAL (with endpoint)', () => {
    it('should test with custom endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'model-1' }] }),
      });

      const result = await connection.testProvider('dial', 'dial-key', {
        endpoint: 'https://my-dial-server.com',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('dial');
      expect(result.modelCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-dial-server.com/v1/models',
        expect.any(Object)
      );
    });
  });

  describe('testProvider - error handling', () => {
    it('should handle 401 Unauthorized (invalid API key)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: { message: 'Invalid API key' } }),
      });

      const result = await connection.testProvider('openai', 'invalid-key');

      expect(result).toEqual({
        success: false,
        provider: 'openai',
        error: 'Invalid API key',
        statusCode: 401,
      });
    });

    it('should handle 403 Forbidden (insufficient permissions)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result).toEqual({
        success: false,
        provider: 'openai',
        error: 'API key lacks required permissions',
        statusCode: 403,
      });
    });

    it('should handle 429 Rate Limited', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result).toEqual({
        success: false,
        provider: 'openai',
        error: 'Rate limited - try again later',
        statusCode: 429,
      });
    });

    it('should handle 500 Server Error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result).toEqual({
        success: false,
        provider: 'openai',
        error: 'Provider service error',
        statusCode: 500,
      });
    });

    it('should handle 503 Service Unavailable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result).toEqual({
        success: false,
        provider: 'openai',
        error: 'Provider service error',
        statusCode: 503,
      });
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(false);
      expect(result.provider).toBe('openai');
      expect(result.error).toBe('Network error - check connection');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(false);
      expect(result.provider).toBe('openai');
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('testProvider - timeout handling', () => {
    it('should use AbortSignal with timeout duration', async () => {
      let capturedSignal = null;

      mockFetch.mockImplementation((url, options) => {
        capturedSignal = options.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ data: [] }),
        });
      });

      const customTimeout = 5000;
      const conn = new ZenMcpConnection({ fetch: mockFetch, timeout: customTimeout });
      await conn.testProvider('openai', 'key');

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should succeed before timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(true);
    });
  });

  describe('listModels', () => {
    it('should return models for OpenRouter', async () => {
      const responseData = {
        data: [
          { id: 'model-1', name: 'Model 1' },
          { id: 'model-2', name: 'Model 2' },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(responseData),
      });

      const result = await connection.listModels('openrouter', 'test-key');

      expect(result).toEqual({
        success: true,
        models: [
          { id: 'model-1', name: 'Model 1' },
          { id: 'model-2', name: 'Model 2' },
        ],
      });
    });

    it('should return models for OpenAI', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4', owned_by: 'openai' },
            { id: 'gpt-3.5-turbo', owned_by: 'openai' },
          ],
        }),
      });

      const result = await connection.listModels('openai', 'key');

      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(2);
    });

    it('should return error for Azure without endpoint', async () => {
      const result = await connection.listModels('azure', 'key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Azure OpenAI requires an endpoint');
    });

    it('should return error for DIAL without endpoint', async () => {
      const result = await connection.listModels('dial', 'key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DIAL requires an endpoint');
    });

    it('should handle error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.listModels('openai', 'invalid-key');

      expect(result).toEqual({
        success: false,
        error: 'Invalid API key',
        statusCode: 401,
      });
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await connection.listModels('openai', 'key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error - check connection');
    });

    it('should use correct endpoint for Gemini', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ models: [] }),
      });

      await connection.listModels('gemini', 'key');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1/models',
        expect.any(Object)
      );
    });
  });

  describe('testProvider - fetch options', () => {
    it('should set method to GET', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await connection.testProvider('openai', 'key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should include Content-Type header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await connection.testProvider('openai', 'key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should use AbortSignal for timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await connection.testProvider('openai', 'key');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty model list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(true);
      expect(result.modelCount).toBe(0);
    });

    it('should handle missing data field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(true);
      expect(result.modelCount).toBe(0);
    });

    it('should handle null API key gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', null);

      expect(result.success).toBe(false);
    });

    it('should handle empty API key gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', '');

      expect(result.success).toBe(false);
    });

    it('should handle whitespace-only API key', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await connection.testProvider('openai', '   ');

      expect(result.success).toBe(false);
    });

    it('should recover from abort error', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await connection.testProvider('openai', 'key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('multiple concurrent requests', () => {
    it('should handle multiple concurrent testProvider calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'model-1' }] }),
      });

      const results = await Promise.all([
        connection.testProvider('openai', 'key1'),
        connection.testProvider('gemini', 'key2'),
        connection.testProvider('openrouter', 'key3'),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple concurrent listModels calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const results = await Promise.all([
        connection.listModels('openai', 'key1'),
        connection.listModels('gemini', 'key2'),
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('result object immutability', () => {
    it('should return new object each time', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      const result1 = await connection.testProvider('openai', 'key');
      const result2 = await connection.testProvider('openai', 'key');

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });
});
