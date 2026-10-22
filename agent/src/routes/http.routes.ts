// ZenPanel - API của API Tester (kiểu Postman)
import type { FastifyInstance } from 'fastify';
import type { HttpClientService, SendInput, Workspace } from '../services/httpclient.service.js';

export async function httpRoutes(app: FastifyInstance, deps: { http: HttpClientService }): Promise<void> {
  const { http } = deps;
  app.get('/api/http/workspace', async () => http.workspace());
  app.put('/api/http/workspace', async (req) => http.save((req.body ?? {}) as Partial<Workspace>));
  app.post('/api/http/workspace/reset', async () => http.reset());
  app.post('/api/http/send', async (req) => http.send((req.body ?? {}) as SendInput));
}
