// ZenPanel - Kho image Docker Hub: tìm kiếm, image phổ biến, danh sách tag
import { badRequest, HttpError } from '../core/validate.js';

const HUB = 'https://hub.docker.com/v2';

export interface HubImage {
  name: string;
  description: string;
  stars: number;
  pulls: number;
  official: boolean;
  category?: string;
}

/** Image phổ biến hiển thị khi chưa tìm kiếm, nhóm theo mục đích */
const FEATURED: [string, string][] = [
  ['nginx', 'Web'],
  ['httpd', 'Web'],
  ['caddy', 'Web'],
  ['traefik', 'Web'],
  ['node', 'Runtime'],
  ['python', 'Runtime'],
  ['php', 'Runtime'],
  ['golang', 'Runtime'],
  ['openjdk', 'Runtime'],
  ['postgres', 'Database'],
  ['mysql', 'Database'],
  ['mariadb', 'Database'],
  ['redis', 'Database'],
  ['mongo', 'Database'],
  ['elasticsearch', 'Database'],
  ['rabbitmq', 'Hạ tầng'],
  ['memcached', 'Hạ tầng'],
  ['registry', 'Hạ tầng'],
  ['ubuntu', 'Hệ điều hành'],
  ['debian', 'Hệ điều hành'],
  ['alpine', 'Hệ điều hành'],
  ['busybox', 'Hệ điều hành'],
  ['wordpress', 'Ứng dụng'],
  ['ghost', 'Ứng dụng'],
];

const cache = new Map<string, { at: number; value: unknown }>();

async function hub<T>(pathname: string): Promise<T> {
  const hit = cache.get(pathname);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as T;
  const res = await fetch(`${HUB}${pathname}`, { headers: { 'User-Agent': 'ZenPanel-Agent' }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new HttpError(404, 'Không tìm thấy image trên Docker Hub');
  if (res.status === 429) throw new HttpError(502, 'Docker Hub đang giới hạn lượt gọi, thử lại sau ít phút');
  if (!res.ok) throw new HttpError(502, `Docker Hub lỗi ${res.status}`);
  const value = (await res.json()) as T;
  cache.set(pathname, { at: Date.now(), value });
  return value;
}

/** "nginx" -> "library/nginx" (image chính thức nằm trong namespace library) */
const repoPath = (name: string) => (name.includes('/') ? name : `library/${name}`);

export class DockerHubService {
  async featured(): Promise<HubImage[]> {
    const items = await Promise.all(
      FEATURED.map(async ([name, category]) => {
        const repo = await hub<{ description: string; star_count: number; pull_count: number }>(`/repositories/library/${name}/`).catch(() => null);
        return { name, description: repo?.description ?? '', stars: repo?.star_count ?? 0, pulls: repo?.pull_count ?? 0, official: true, category };
      }),
    );
    return items;
  }

  async search(query: string, page = 1): Promise<{ results: HubImage[]; total: number }> {
    const q = query.trim();
    if (!q || q.length > 100) throw badRequest('Nhập từ khoá tìm image');
    const data = await hub<{ count: number; results: { repo_name: string; short_description: string; star_count: number; pull_count: number; is_official: boolean }[] }>(
      `/search/repositories/?query=${encodeURIComponent(q)}&page_size=30&page=${Math.max(1, Math.min(20, page))}`,
    );
    return {
      total: data.count,
      results: data.results.map((r) => ({ name: r.repo_name, description: r.short_description, stars: r.star_count, pulls: r.pull_count, official: r.is_official })),
    };
  }

  async tags(name: string): Promise<{ name: string; size: number; updated: string; archs: string[] }[]> {
    if (!/^[a-z0-9][a-z0-9._\-/]{0,200}$/i.test(name)) throw badRequest('Tên image không hợp lệ');
    const data = await hub<{ results: { name: string; full_size: number; last_updated: string; images?: { architecture: string }[] }[] }>(
      `/repositories/${repoPath(name)}/tags/?page_size=40&ordering=last_updated`,
    );
    return data.results.map((t) => ({
      name: t.name,
      size: t.full_size,
      updated: t.last_updated,
      archs: [...new Set((t.images ?? []).map((i) => i.architecture).filter((a) => a && a !== 'unknown'))],
    }));
  }
}
