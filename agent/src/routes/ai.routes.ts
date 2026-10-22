// ZenPanel - API AI: quản lý gateway trong panel + endpoint chuẩn OpenAI công khai /ai/v1 (xác thực bằng API key gateway)
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { HttpError } from '../core/validate.js';
import type { AiService } from '../services/ai.service.js';
import type { AiGatewayService, GatewayLog } from '../services/aigateway.service.js';

/** Trả nguyên response của nhà cung cấp (giữ stream SSE) */
function pipe(reply: FastifyReply, res: Response) {
  reply.code(res.status).header('Content-Type', res.headers.get('content-type') ?? 'application/json').header('Cache-Control', 'no-cache');
  return reply.send(res.body ? Readable.fromWeb(res.body as ReadableStream) : '');
}

/** Route trong panel (yêu cầu đăng nhập) */
export async function aiPanelRoutes(app: FastifyInstance, deps: { ai: AiService; gateway: AiGatewayService }): Promise<void> {
  const { ai, gateway } = deps;
  type Params = { id: string };

  app.get('/api/ai/providers/:id/models', async (req) => ai.models((req.params as Params).id, (req.query as { refresh?: string }).refresh === '1'));
  app.put('/api/ai/providers/:id/default-model', async (req) => {
    ai.setDefaultModel((req.params as Params).id, (req.body as { model?: string | null } | undefined)?.model ?? null);
    return ai.list();
  });
  app.get('/api/ai/models', async () => gateway.allModels());

  app.get('/api/ai/gateway', async () => gateway.getSettings());
  app.put('/api/ai/gateway', async (req) => gateway.update((req.body ?? {}) as Record<string, never>));
  app.post('/api/ai/gateway/regenerate', async () => gateway.regenerateKey());
  app.get('/api/ai/gateway/logs', async () => gateway.logs());

  // Playground trong panel dùng chung logic định tuyến với gateway
  app.post('/api/ai/chat', async (req, reply) => pipe(reply, await gateway.chat((req.body ?? {}) as Record<string, unknown>, 'playground')));
}

/** Prefix chính của AI Gateway; /ai/v1 giữ lại để app đã cấu hình bản cũ vẫn chạy */
export const GATEWAY_PREFIXES = ['/zen/v1', '/ai/v1'];

/** Endpoint công khai chuẩn OpenAI: http(s)://<panel>/zen/v1 */
export async function aiGatewayRoutes(app: FastifyInstance, deps: { gateway: AiGatewayService }): Promise<void> {
  const { gateway } = deps;

  // Lỗi theo định dạng OpenAI để SDK / n8n / Open WebUI hiển thị đúng
  app.setErrorHandler((err: Error, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: { message: err.message, type: status === 401 ? 'authentication_error' : 'zenpanel_gateway_error', code: status } });
  });

  // /health công khai để kiểm tra gateway sống, mọi endpoint khác cần API key tzp_
  app.get('/health', async () => ({ status: gateway.getSettings().enabled ? 'ok' : 'disabled', name: 'TXAZENPANEL AI Gateway', time: new Date().toISOString() }));

  app.register(async (secured) => {
    secured.addHook('preHandler', async (req) => {
      if (!gateway.getSettings().enabled) throw new HttpError(503, 'AI Gateway đang tắt. Bật trong ZenPanel → AI Gateway.');
      if (!gateway.verifyKey(req.headers.authorization ?? (req.headers['x-api-key'] as string | undefined))) {
        throw new HttpError(401, 'API key của ZenPanel AI Gateway không đúng (key phải bắt đầu bằng tzp_)');
      }
    });

    secured.get('/models', async () => ({
      object: 'list',
      data: (await gateway.allModels()).map((m) => ({ id: m.id, object: 'model', owned_by: m.provider, name: m.name, context_length: m.contextLength, pricing: m.pricing })),
    }));
    // id có dấu "/" (vd anthropic/claude-x) nên dùng wildcard
    secured.get('/models/*', async (req) => gateway.modelInfo((req.params as { '*': string })['*']));
    secured.get('/providers', async () => gateway.providers());
    secured.get('/key', async () => gateway.keyInfo());
    secured.get('/usage', async (req) => gateway.usage(Number((req.query as { hours?: string }).hours) || 24));
    secured.post('/chat/completions', async (req, reply) => pipe(reply, await gateway.chat((req.body ?? {}) as Record<string, unknown>, 'api')));
    secured.post('/completions', async (req, reply) => pipe(reply, await gateway.completions((req.body ?? {}) as Record<string, unknown>)));
    secured.post('/embeddings', async (req, reply) => pipe(reply, await gateway.embeddings((req.body ?? {}) as Record<string, unknown>)));
  });
}

export type { GatewayLog };
