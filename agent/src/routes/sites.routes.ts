// ZenPanel - API Website, Cloudflare và Cài đặt panel
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/context.js';
import { requireString } from '../core/validate.js';
import type { CloudflareService } from '../services/cloudflare.service.js';
import type { SiteInput, SiteService } from '../services/site.service.js';

export async function siteRoutes(app: FastifyInstance, ctx: AppContext, deps: { sites: SiteService; cloudflare: CloudflareService }): Promise<void> {
  const { sites, cloudflare } = deps;

  // ------------------------------------------------------------ Websites
  app.get('/api/sites', async () => ({
    sites: sites.list(),
    defaultRoot: ctx.adapter.defaultWebRoot(),
    webServers: await Promise.all(
      ctx.adapter.webServers().map(async (d) => ({ kind: d.kind, label: d.label, supports: d.supports, installed: Boolean(await d.detect()) })),
    ),
  }));

  app.post('/api/sites', async (req) => sites.create((req.body ?? {}) as SiteInput));
  app.put('/api/sites/:id', async (req) => sites.update((req.params as { id: string }).id, (req.body ?? {}) as SiteInput & { enabled?: boolean }));
  app.get('/api/sites/:id/stats', async (req) => sites.stats((req.params as { id: string }).id));

  app.delete('/api/sites/:id', async (req) => {
    const deleteFiles = (req.query as { deleteFiles?: string }).deleteFiles === 'true';
    await sites.remove((req.params as { id: string }).id, deleteFiles);
    return { ok: true };
  });

  app.post('/api/sites/:id/ssl', async (req) => {
    const body = (req.body ?? {}) as { enabled?: boolean; email?: string };
    const id = (req.params as { id: string }).id;
    return body.enabled === false ? sites.disableSSL(id) : sites.enableSSL(id, body.email);
  });

  app.post('/api/webservers/:kind/install', async (req) => {
    await sites.installWebServer((req.params as { kind: string }).kind);
    return { ok: true };
  });

  // ------------------------------------------------------------ Cloudflare
  app.get('/api/cloudflare', async () => cloudflare.status());
  app.put('/api/cloudflare/token', async (req) => {
    await cloudflare.saveToken(String((req.body as { token?: string } | undefined)?.token ?? ''));
    return cloudflare.status();
  });
  app.get('/api/cloudflare/zones', async () => cloudflare.zones());
  app.patch('/api/cloudflare/zones/:id/settings/:setting', async (req) => {
    const { id, setting } = req.params as { id: string; setting: string };
    await cloudflare.updateSetting(id, setting, requireString((req.body as { value?: string } | undefined)?.value, 'value'));
    return { ok: true };
  });
  app.post('/api/cloudflare/zones/:id/purge', async (req) => {
    await cloudflare.purgeCache((req.params as { id: string }).id);
    return { ok: true };
  });
  app.get('/api/cloudflare/zones/:id/dns', async (req) => cloudflare.dnsRecords((req.params as { id: string }).id));
  app.post('/api/cloudflare/zones/:id/dns', async (req) => {
    await cloudflare.createDns((req.params as { id: string }).id, (req.body ?? {}) as Record<string, never>);
    return { ok: true };
  });
  app.delete('/api/cloudflare/zones/:id/dns/:recordId', async (req) => {
    const { id, recordId } = req.params as { id: string; recordId: string };
    await cloudflare.deleteDns(id, recordId);
    return { ok: true };
  });
}
