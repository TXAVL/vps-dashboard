// ZenPanel - API AI: quản lý gateway trong panel + endpoint chuẩn OpenAI công khai /ai/v1 (xác thực bằng API key gateway)
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { HttpError } from '../core/validate.js';
import type { AiService } from '../services/ai.service.js';
import type { AiGatewayService, GatewayCaller, GatewayLog } from '../services/aigateway.service.js';
import {
  anthropicError,
  anthropicToOpenAi,
  ollamaChatToOpenAi,
  openAiStreamToAnthropic,
  openAiStreamToOllama,
  openAiToAnthropic,
  openAiToOllama,
} from '../services/aigateway.compat.js';
import type { AiCompanyService } from '../services/aicompany.service.js';

/** Trả nguyên response của nhà cung cấp (giữ stream SSE, chống proxy buffer, CORS mở hoàn toàn) */
function pipe(reply: FastifyReply, res: Response) {
  reply.code(res.status)
    .header('Content-Type', res.headers.get('content-type') ?? 'application/json')
    .header('Cache-Control', 'no-cache, no-transform')
    .header('Connection', 'keep-alive')
    .header('X-Accel-Buffering', 'no')
    .header('Access-Control-Allow-Origin', '*')
    .header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS')
    .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key, *');
  return reply.send(res.body ? Readable.fromWeb(res.body as ReadableStream) : '');
}

/** Route trong panel (yêu cầu đăng nhập) */
export async function aiPanelRoutes(app: FastifyInstance, deps: { ai: AiService; gateway: AiGatewayService; company: AiCompanyService }): Promise<void> {
  const { ai, gateway, company } = deps;
  type Params = { id: string };

  app.get('/api/ai/providers/:id/models', async (req) => ai.models((req.params as Params).id, (req.query as { refresh?: string }).refresh === '1'));
  app.put('/api/ai/providers/:id/default-model', async (req) => {
    ai.setDefaultModel((req.params as Params).id, (req.body as { model?: string | null } | undefined)?.model ?? null);
    return ai.list();
  });
  app.post('/api/ai/providers/:id/accounts', async (req) => {
    const body = (req.body ?? {}) as { key?: string; name?: string };
    await ai.addAccount((req.params as Params).id, body.key ?? '', body.name);
    return ai.list();
  });
  app.delete('/api/ai/providers/:id/accounts/:keyId', async (req) => {
    const params = req.params as { id: string; keyId: string };
    ai.removeAccount(params.id, params.keyId);
    return ai.list();
  });
  app.put('/api/ai/providers/:id/accounts/:keyId/reset', async (req) => {
    const params = req.params as { id: string; keyId: string };
    ai.resetAccountStatus(params.id, params.keyId);
    return ai.list();
  });

  app.get('/api/ai/models', async () => gateway.allModels());

  // Quản lý Sub AI Agents
  app.get('/api/ai/subagents', async () => gateway.getSubAgents());
  app.post('/api/ai/subagents', async (req) => gateway.saveSubAgent((req.body ?? {}) as Parameters<typeof gateway.saveSubAgent>[0]));
  app.delete('/api/ai/subagents/:id', async (req) => {
    gateway.deleteSubAgent((req.params as Params).id);
    return { ok: true };
  });

  // Quản lý AI Company Orchestrator (Master Bot & Workers)
  app.get('/api/ai/company', async () => company.getConfig());
  app.put('/api/ai/company', async (req) => company.saveConfig((req.body ?? {}) as Parameters<typeof company.saveConfig>[0]));
  app.post('/api/ai/company/workers', async (req) => company.saveWorker((req.body ?? {}) as Parameters<typeof company.saveWorker>[0]));
  app.delete('/api/ai/company/workers/:id', async (req) => {
    company.deleteWorker((req.params as Params).id);
    return { ok: true };
  });
  app.post('/api/ai/company/reset', async () => company.resetDefault());

  // Điều phối công việc AI Company qua Server-Sent Events (SSE)
  app.post('/api/ai/company/chat', async (req, reply) => {
    const body = (req.body ?? {}) as { prompt?: string };
    const prompt = body.prompt?.trim() ?? '';
    if (!prompt) return reply.code(400).send({ error: 'Vui lòng nhập yêu cầu công việc' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      for await (const ev of company.dispatchStream(prompt)) {
        reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
      reply.raw.write(`data: [DONE]\n\n`);
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });

  // Quản lý API Keys cấp phát cho Gateway
  app.get('/api/ai/gateway/keys', async () => gateway.listApiKeys());
  app.post('/api/ai/gateway/keys', async (req) => gateway.createApiKey((req.body ?? {}) as Parameters<typeof gateway.createApiKey>[0]));
  app.put('/api/ai/gateway/keys/:id', async (req) => gateway.updateApiKey((req.params as Params).id, (req.body ?? {}) as Parameters<typeof gateway.updateApiKey>[1]));
  app.delete('/api/ai/gateway/keys/:id', async (req) => {
    gateway.deleteApiKey((req.params as Params).id);
    return { ok: true };
  });

  app.get('/api/ai/gateway', async () => gateway.getSettings());
  app.put('/api/ai/gateway', async (req) => gateway.update((req.body ?? {}) as Record<string, never>));
  app.post('/api/ai/gateway/regenerate', async () => gateway.regenerateKey());
  app.get('/api/ai/gateway/logs', async () => gateway.logs());
  app.delete('/api/ai/gateway/logs', async () => {
    gateway.clearLogs();
    return { ok: true };
  });

  // Playground trong panel dùng chung logic định tuyến với gateway
  app.post('/api/ai/chat', async (req, reply) => pipe(reply, await gateway.chat((req.body ?? {}) as Record<string, unknown>, 'playground')));
}

/** Prefix chính của AI Gateway; hỗ trợ đầy đủ /zen/v1, /ai/v1 và chuẩn OpenAI quốc tế /v1 */
export const GATEWAY_PREFIXES = ['/zen/v1', '/ai/v1', '/v1'];

function getGatewayGuide(gateway: AiGatewayService) {
  const s = gateway.getSettings();
  return {
    status: s.enabled ? 'online' : 'disabled',
    service: 'TXAZENPANEL AI Gateway (9Router compatible)',
    version: '0.6.4',
    description: 'Cổng điều phối AI thông minh 3 tầng (3-Tier) chuẩn OpenAI. Hỗ trợ đầy đủ cho Postman, cURL, AI Agents, LangChain, Next.js, n8n, Cursor, Claude Code, Cline.',
    currentConfiguration: {
      defaultModel: s.defaultModel || 'Chưa cấu hình (fallback về provider đầu tiên)',
      tier1Model: s.tier1Model || s.defaultModel || 'auto',
      tier2Model: s.tier2Model || s.fallbacks[0] || 'Chưa cấu hình',
      tier3Model: s.tier3Model || s.fallbacks[1] || 'Chưa cấu hình',
      fallbacks: s.fallbacks,
      rtkTokenSaver: s.rtkEnabled ? 'Đang bật' : 'Đang tắt',
      rotationStrategy: s.rotationStrategy,
    },
    authentication: {
      header: 'Authorization: Bearer <API_KEY> hoặc x-api-key: <API_KEY>',
      format: 'tzp_live_xxxxxxxxxxxxxxxxxxxxxxxx (hoặc tzp_...)',
      postmanTab: 'Authorization -> Type: Bearer Token -> điền API Key vào ô Token',
    },
    modelRoutingAliases: {
      'auto': 'Tự động gọi model chính (Tier 1 hoặc defaultModel). Khi bị lỗi hoặc 429 Rate Limit, tự động nhảy sang Tier 2 -> Tier 3 -> danh sách fallbacks.',
      'tier1': 'Gọi model chính cao cấp (Tier 1).',
      'tier2': 'Gọi model tốc độ cao / chi phí thấp (Tier 2).',
      'tier3': 'Gọi model miễn phí / cứu cánh (Tier 3).',
      '<provider>/<model>': 'Gọi trực tiếp model theo tên, ví dụ: gemini/gemini-3.5-flash-lite, openai/gpt-4o, anthropic/claude-3-7-sonnet-20250219, deepseek/deepseek-chat',
      'agent/<subagent_id>': 'Gọi Sub-Agent chuyên môn hoá đã cấu hình trong ZenPanel.',
    },
    endpoints: [
      {
        method: 'POST',
        path: '/chat/completions',
        aliases: ['/zen/v1/chat/completions', '/v1/chat/completions', '/ai/v1/chat/completions'],
        auth: 'Required (Bearer Token)',
        description: 'Tạo hội thoại AI chuẩn OpenAI (hỗ trợ stream: true/false).',
        sampleRequest: {
          model: 'auto',
          messages: [{ role: 'user', content: 'Xin chào AI Gateway!' }],
          stream: false,
        },
      },
      {
        method: 'POST / PUT',
        path: '/config',
        aliases: ['/zen/v1/config', '/models/default'],
        auth: 'Required (Bearer Token)',
        description: 'Set nhanh model mặc định và model dự phòng trực tiếp bằng API từ Postman mà không cần mở Dashboard ZenPanel.',
        sampleRequest: {
          model: 'gemini/gemini-3.5-flash-lite',
          tier1Model: 'gemini/gemini-3.5-flash-lite',
          tier2Model: 'openai/gpt-4o-mini',
          fallbacks: ['openai/gpt-4o-mini'],
        },
      },
      {
        method: 'GET',
        path: '/config',
        aliases: ['/zen/v1/config', '/settings'],
        auth: 'Required (Bearer Token)',
        description: 'Xem cấu hình gateway hiện tại (default model, 3 tiers, fallbacks).',
      },
      {
        method: 'GET',
        path: '/models',
        aliases: ['/zen/v1/models', '/v1/models'],
        auth: 'Required (Bearer Token)',
        description: 'Liệt kê danh sách tất cả model khả dụng từ các nhà cung cấp đã kết nối và các Sub-Agent kèm 3 tầng auto/tier1/tier2/tier3.',
      },
      {
        method: 'GET',
        path: '/models/:id',
        auth: 'Required (Bearer Token)',
        description: 'Xem chi tiết context length và pricing của một model cụ thể.',
      },
      {
        method: 'GET',
        path: '/providers',
        auth: 'Required (Bearer Token)',
        description: 'Xem danh sách các nhà cung cấp AI đã kết nối và số lượng accounts trong pool.',
      },
      {
        method: 'GET',
        path: '/usage',
        auth: 'Required (Bearer Token)',
        description: 'Thống kê lượng request, tokens và độ trễ theo từng model trong N giờ gần nhất (param: ?hours=24).',
      },
      {
        method: 'GET',
        path: '/health',
        auth: 'None (Public)',
        description: 'Kiểm tra trạng thái gateway (online / disabled).',
      },
      {
        method: 'GET',
        path: '/guide',
        aliases: ['/docs', '/help', '/zen/v1', '/v1'],
        auth: 'None (Public)',
        description: 'Tài liệu hướng dẫn đầy đủ này cho AI Agent, Postman và ứng dụng bên ngoài.',
      },
      {
        method: 'GET',
        path: '/postman.json',
        aliases: ['/postman'],
        auth: 'None (Public)',
        description: 'Xuất Postman Collection v2.1.0 hoàn chỉnh để import ngay vào Postman chỉ với 1 click!',
      },
    ],
  };
}

function buildPostmanCollection(baseUrl: string) {
  return {
    info: {
      name: 'ZenPanel AI Gateway (OpenAI Compatible & 9Router)',
      description: 'Bộ sưu tập Postman Collection đầy đủ cho ZenPanel AI Gateway. Hỗ trợ Chat Completions, Auto-Routing 3 Tầng, và Set nhanh Model Default / Fallbacks qua API.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: baseUrl, type: 'string' },
      { key: 'apiKey', value: 'tzp_live_xxxxxxxxxxxxxxxxxxxxxxxx', type: 'string' },
    ],
    item: [
      {
        name: '01. [Public] Xem hướng dẫn API & Endpoints',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/guide',
          description: 'Xem chi tiết tất cả endpoint, alias và trạng thái gateway mà không cần authentication.',
        },
      },
      {
        name: '02. [Public] Kiểm tra sức khỏe Gateway (Health Check)',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/health',
        },
      },
      {
        name: '03. [Chat] Test Auto Routing 3 Tầng (Stream False)',
        request: {
          method: 'POST',
          url: '{{baseUrl}}/chat/completions',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
            { key: 'Content-Type', value: 'application/json', type: 'text' },
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              model: 'auto',
              messages: [{ role: 'user', content: 'Xin chào AI Gateway! Hãy phản hồi ngắn gọn 1 câu.' }],
              stream: false,
            }, null, 2),
          },
        },
      },
      {
        name: '04. [Chat] Test Streaming SSE (Stream True)',
        request: {
          method: 'POST',
          url: '{{baseUrl}}/chat/completions',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
            { key: 'Content-Type', value: 'application/json', type: 'text' },
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              model: 'auto',
              messages: [{ role: 'user', content: 'Đếm từ 1 đến 5.' }],
              stream: true,
            }, null, 2),
          },
        },
      },
      {
        name: '05. [Config] Xem cấu hình Gateway hiện tại',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/config',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
          ],
        },
      },
      {
        name: '06. [Config] Set nhanh Model Default & Model dự phòng (Thay thế tức thì)',
        request: {
          method: 'POST',
          url: '{{baseUrl}}/config',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
            { key: 'Content-Type', value: 'application/json', type: 'text' },
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify({
              model: 'gemini-3.5-flash-lite',
              tier1Model: 'gemini-3.5-flash-lite',
              tier2Model: 'openai/gpt-4o-mini',
              fallbacks: ['openai/gpt-4o-mini'],
            }, null, 2),
          },
        },
      },
      {
        name: '07. [Models] Lấy danh sách Models & Tiers',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/models',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
          ],
        },
      },
      {
        name: '08. [Providers] Danh sách Nhà cung cấp & Account Pool',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/providers',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
          ],
        },
      },
      {
        name: '09. [Usage] Thống kê tiêu thụ Token 24h',
        request: {
          method: 'GET',
          url: '{{baseUrl}}/usage?hours=24',
          header: [
            { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
          ],
        },
      },
    ],
  };
}

/** Endpoint công khai chuẩn OpenAI: http(s)://<panel>/zen/v1 */
export async function aiGatewayRoutes(app: FastifyInstance, deps: { gateway: AiGatewayService }): Promise<void> {
  const { gateway } = deps;

  // Xử lý CORS Options Preflight toàn diện cho mọi app web / Postman / Docker
  app.options('/*', async (_req, reply) => {
    return reply
      .code(204)
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key, *')
      .header('Access-Control-Max-Age', '86400')
      .send();
  });

  // Tự động gắn CORS header trên tất cả response gửi đi
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key, *');
    return payload;
  });

  // Lỗi theo định dạng chuẩn OpenAI để Postman / SDK / n8n / Open WebUI hiển thị chi tiết và chính xác
  app.setErrorHandler((err: Error, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    let errorType = 'zenpanel_gateway_error';
    if (status === 401) errorType = 'authentication_error';
    else if (status === 400) errorType = 'invalid_request_error';
    else if (status === 404) errorType = 'not_found_error';
    else if (status === 429) errorType = 'rate_limit_error';
    else if (status === 503) errorType = 'service_unavailable_error';
    else if (status === 502) errorType = 'bad_gateway_error';

    return reply
      .code(status)
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key, *')
      .send({
        error: {
          message: err.message || 'Đã xảy ra lỗi trong quá trình xử lý yêu cầu AI Gateway.',
          type: errorType,
          param: null,
          code: status,
        },
      });
  });

  // GET / hoặc /guide, /docs, /help: Hướng dẫn đầy đủ cho AI Agent / Postman
  const guideHandler = async () => getGatewayGuide(gateway);
  app.get('/', guideHandler);
  app.get('/guide', guideHandler);
  app.get('/docs', guideHandler);
  app.get('/help', guideHandler);

  // Xuất Postman Collection v2.1.0 chuẩn tự động nhận diện host
  const postmanHandler = async (req: { protocol?: string; headers: Record<string, string | string[] | undefined> }) => {
    const proto = req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || '127.0.0.1:2083';
    const baseUrl = `${proto}://${host}/zen/v1`;
    return buildPostmanCollection(baseUrl);
  };
  app.get('/postman.json', postmanHandler);
  app.get('/postman', postmanHandler);

  // /health công khai để kiểm tra gateway sống, mọi endpoint khác cần API key tzp_
  app.get('/health', async () => ({ status: gateway.getSettings().enabled ? 'ok' : 'disabled', name: 'TXAZENPANEL AI Gateway', time: new Date().toISOString() }));

  app.register(async (secured) => {
    secured.addHook('preHandler', async (req) => {
      if (!gateway.getSettings().enabled) {
        throw new HttpError(503, 'AI Gateway đang tạm tắt. Vui lòng bật gateway tại ZenPanel → AI Gateway để sử dụng.');
      }
      const verified = gateway.verifyKey(req.headers.authorization ?? (req.headers['x-api-key'] as string | undefined));
      if (!verified.ok) {
        const status = verified.reason === 'rate_limited' || verified.reason === 'quota' ? 429 : 401;
        throw new HttpError(status, verified.message || 'API key của ZenPanel AI Gateway không hợp lệ (phải bắt đầu bằng tzp_).');
      }
      (req as unknown as { zpCaller: GatewayCaller }).zpCaller = { keyId: verified.keyId, keyName: verified.keyName };
    });
    const callerOf = (req: unknown) => (req as { zpCaller?: GatewayCaller }).zpCaller;

    // API chuẩn Anthropic Messages: Claude Code đặt ANTHROPIC_BASE_URL=https://<host>/zen là dùng được mọi model
    secured.post('/messages', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const model = String(body.model ?? 'auto');
      try {
        const res = await gateway.chat(anthropicToOpenAi(body), 'api', callerOf(req));
        if (body.stream) return pipe(reply, openAiStreamToAnthropic(res, model));
        const json = (await res.json()) as Record<string, unknown>;
        return reply.code(200).header('Content-Type', 'application/json').send(openAiToAnthropic(json, model));
      } catch (err) {
        const { status, body: errBody } = anthropicError(err);
        return reply.code(status).send(errBody);
      }
    });
    // Ước lượng token (Claude Code gọi trước khi gửi) - ~4 ký tự / token
    secured.post('/messages/count_tokens', async (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      return { input_tokens: Math.ceil(JSON.stringify([body.system ?? '', body.messages ?? [], body.tools ?? []]).length / 4) };
    });

    // Endpoint xem và set nhanh model mặc định & model dự phòng qua API Token (Postman / AI Agent)
    secured.get('/config', async () => gateway.getSettings());
    secured.get('/settings', async () => gateway.getSettings());
    secured.post('/config', async (req) => gateway.quickSet((req.body ?? {}) as Record<string, unknown>));
    secured.put('/config', async (req) => gateway.quickSet((req.body ?? {}) as Record<string, unknown>));
    secured.post('/models/default', async (req) => gateway.quickSet((req.body ?? {}) as Record<string, unknown>));
    secured.put('/models/default', async (req) => gateway.quickSet((req.body ?? {}) as Record<string, unknown>));

    secured.get('/models', async () => {
      const s = gateway.getSettings();
      const realModels = await gateway.allModels();
      const virtualModels = [
        { id: 'auto', object: 'model', owned_by: 'zenpanel', name: `Smart 3-Tier Routing (${s.tier1Model || s.defaultModel || 'auto'})`, context_length: 128000 },
        { id: 'tier1', object: 'model', owned_by: 'zenpanel', name: `Tier 1: High Performance (${s.tier1Model || 'Chưa cấu hình'})`, context_length: 128000 },
        { id: 'tier2', object: 'model', owned_by: 'zenpanel', name: `Tier 2: Fast & Low-cost (${s.tier2Model || 'Chưa cấu hình'})`, context_length: 128000 },
        { id: 'tier3', object: 'model', owned_by: 'zenpanel', name: `Tier 3: Free / Fallback (${s.tier3Model || 'Chưa cấu hình'})`, context_length: 128000 },
      ];
      return {
        object: 'list',
        data: [
          ...virtualModels,
          ...realModels.map((m) => ({ id: m.id, object: 'model', owned_by: m.provider, name: m.name, context_length: m.contextLength, pricing: m.pricing })),
        ],
      };
    });
    // id có dấu "/" (vd anthropic/claude-x) nên dùng wildcard
    secured.get('/models/*', async (req) => gateway.modelInfo((req.params as { '*': string })['*']));
    secured.get('/providers', async () => gateway.providers());
    secured.get('/key', async () => gateway.keyInfo());
    secured.get('/usage', async (req) => gateway.usage(Number((req.query as { hours?: string }).hours) || 24));
    secured.post('/chat/completions', async (req, reply) => pipe(reply, await gateway.chat((req.body ?? {}) as Record<string, unknown>, 'api', callerOf(req))));
    secured.post('/completions', async (req, reply) => pipe(reply, await gateway.completions((req.body ?? {}) as Record<string, unknown>)));
    secured.post('/embeddings', async (req, reply) => pipe(reply, await gateway.embeddings((req.body ?? {}) as Record<string, unknown>)));
  });
}


/**
 * API tương thích Ollama (Open WebUI, Continue, Page Assist, n8n Ollama node...):
 * base URL https://<host>/ollama (key qua header Authorization) hoặc https://<host>/ollama/k/<API_KEY> (client không gửi được header)
 */
export async function ollamaRoutes(app: FastifyInstance, deps: { gateway: AiGatewayService }): Promise<void> {
  const { gateway } = deps;

  app.addHook('preHandler', async (req) => {
    if (req.url.endsWith('/') || req.url.endsWith('/api/version')) return;
    if (!gateway.getSettings().enabled) throw new HttpError(503, 'AI Gateway đang tạm tắt');
    const pathKey = (req.params as { key?: string }).key;
    const verified = gateway.verifyKey(pathKey ?? req.headers.authorization ?? (req.headers['x-api-key'] as string | undefined));
    if (!verified.ok) throw new HttpError(verified.reason === 'rate_limited' || verified.reason === 'quota' ? 429 : 401, verified.message ?? 'API key không hợp lệ');
    (req as unknown as { zpCaller: GatewayCaller }).zpCaller = { keyId: verified.keyId, keyName: verified.keyName };
  });
  const callerOf = (req: unknown) => (req as { zpCaller?: GatewayCaller }).zpCaller;

  app.get('/', async () => 'Ollama is running');
  app.get('/api/version', async () => ({ version: '0.6.8' }));
  app.get('/api/tags', async () => {
    const s = gateway.getSettings();
    const names = ['auto', 'tier1', 'tier2', 'tier3', ...s.combos.map((c) => c.name), ...(await gateway.allModels()).map((m) => m.id)];
    const modified_at = new Date().toISOString();
    return {
      models: [...new Set(names)].map((name) => ({ name, model: name, modified_at, size: 0, digest: name, details: { format: 'gguf', family: name.split('/')[0], parameter_size: '', quantization_level: '' } })),
    };
  });
  app.get('/api/ps', async () => ({ models: [] }));
  app.post('/api/show', async (req) => {
    const model = String((req.body as { model?: string; name?: string } | undefined)?.model ?? (req.body as { name?: string } | undefined)?.name ?? '');
    return { modelfile: '', parameters: '', template: '', details: { family: model.split('/')[0], format: 'gguf' }, model_info: {}, capabilities: ['completion', 'tools'] };
  });

  const handle = (generate: boolean) => async (req: { body: unknown }, reply: FastifyReply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const model = String(body.model ?? 'auto');
    const res = await gateway.chat(ollamaChatToOpenAi(body, generate), 'api', callerOf(req));
    if (body.stream !== false) return pipe(reply, openAiStreamToOllama(res, model, generate));
    return reply.send(openAiToOllama((await res.json()) as Record<string, unknown>, model, generate));
  };
  app.post('/api/chat', handle(false));
  app.post('/api/generate', handle(true));

  const embed = async (req: { body: unknown }) => {
    const body = (req.body ?? {}) as { model?: string; input?: unknown; prompt?: string };
    const input = body.input ?? body.prompt ?? '';
    const res = await gateway.embeddings({ model: body.model, input });
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    const vectors = (json.data ?? []).map((d) => d.embedding);
    return body.prompt !== undefined ? { embedding: vectors[0] ?? [] } : { model: body.model, embeddings: vectors };
  };
  app.post('/api/embed', embed);
  app.post('/api/embeddings', embed);
}

export type { GatewayLog };
