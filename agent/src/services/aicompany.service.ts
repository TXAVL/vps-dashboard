// ZenPanel - AI Company Orchestrator: Hệ thống Công ty AI Agent đa phòng ban
// 1 Master Bot (Sếp Tổng / CEO) phân chia công việc cho các Worker (Phòng ban),
// thu thập kết quả và tổng hợp báo cáo hoàn chỉnh gửi người dùng.

import { readJson, writeJson } from '../core/store.js';
import { badRequest } from '../core/validate.js';
import type { AiService } from './ai.service.js';
import type { AiGatewayService } from './aigateway.service.js';

export interface CompanyWorker {
  id: string;
  name: string;
  role: string;
  avatar: string; // Emoji biểu tượng
  targetModel: string; // 'auto' hoặc cụ thể ví dụ 'openai/gpt-4o'
  systemPrompt: string;
  enabled: boolean;
}

export interface MasterBotConfig {
  name: string;
  role: string;
  targetModel: string;
  systemPrompt: string;
}

export interface AiCompanyConfig {
  enabled: boolean;
  masterBot: MasterBotConfig;
  workers: CompanyWorker[];
}

export interface CompanySubtask {
  workerId: string;
  workerName: string;
  instruction: string;
}

export interface CompanyPlan {
  taskSummary: string;
  subtasks: CompanySubtask[];
}

export interface CompanyStreamEvent {
  type: 'phase' | 'plan' | 'worker_start' | 'worker_done' | 'worker_error' | 'boss_chunk' | 'done' | 'error';
  phase?: 'planning' | 'working' | 'synthesizing' | 'completed';
  message?: string;
  plan?: CompanyPlan;
  workerId?: string;
  workerName?: string;
  modelUsed?: string;
  instruction?: string;
  result?: string;
  delta?: string;
  fullReport?: string;
  error?: string;
}

const COMPANY_CONFIG_FILE = 'ai-company.json';

const DEFAULT_WORKERS: CompanyWorker[] = [
  {
    id: 'dev',
    name: 'Kỹ sư Phần mềm (Tech Lead)',
    role: 'Phát triển mã nguồn, kiến trúc hệ thống, cấu hình VPS & Linux shell',
    avatar: '💻',
    targetModel: 'auto',
    systemPrompt:
      'Bạn là Kỹ sư Phần mềm & Quản trị Hệ thống Linux cao cấp. Hãy đưa ra giải pháp kỹ thuật chính xác, code sạch, tối ưu, lệnh shell có giải thích rõ ràng và an toàn.',
    enabled: true,
  },
  {
    id: 'content',
    name: 'Biên tập & Truyền thông',
    role: 'Soạn thảo nội dung, copywriting, tài liệu hướng dẫn, tối ưu thông điệp',
    avatar: '✍️',
    targetModel: 'auto',
    systemPrompt:
      'Bạn là Chuyên gia Biên tập & Truyền thông. Hãy diễn đạt gãy gọn, thu hút, dễ hiểu đối với người đọc, tối ưu cấu trúc bài viết và truyền tải thông điệp sâu sắc.',
    enabled: true,
  },
  {
    id: 'qa',
    name: 'Kiểm thử & Đánh giá Rủi ro',
    role: 'Rà soát lỗi tiềm ẩn, bảo mật, tính khả thi, phản biện logic',
    avatar: '🔍',
    targetModel: 'auto',
    systemPrompt:
      'Bạn là Chuyên gia Kiểm thử (QA) và Bảo mật Hệ thống. Nhiệm vụ của bạn là rà soát kỹ lưỡng, chỉ ra các góc khuất, rủi ro tiềm ẩn, lỗ hổng bảo mật và đề xuất phương án dự phòng.',
    enabled: true,
  },
  {
    id: 'research',
    name: 'Nghiên cứu & Dữ liệu',
    role: 'Thu thập thông tin chuyên sâu, so sánh đối chuẩn và phân tích logic',
    avatar: '📊',
    targetModel: 'auto',
    systemPrompt:
      'Bạn là Chuyên viên Nghiên cứu & Phân tích Dữ liệu. Hãy cung cấp luận điểm sắc bén, đối chiếu các giải pháp, phân tích ưu nhược điểm và tìm nguyên nhân gốc rễ.',
    enabled: true,
  },
];

const DEFAULT_CONFIG: AiCompanyConfig = {
  enabled: true,
  masterBot: {
    name: 'TXAZENPANEL Sếp Tổng',
    role: 'CEO & Tổng Điều Phối Hệ Thống',
    targetModel: 'auto',
    systemPrompt:
      'Bạn là Sếp Tổng (CEO & Master Orchestrator) của hệ thống AI Company. Bạn có tư duy lãnh đạo sắc bén, biết bóc tách vấn đề phức tạp thành các nhiệm vụ cụ thể cho từng phòng ban, sau đó tổng hợp các báo cáo thành một bản kết quả hoàn chỉnh, chuyên nghiệp và có giá trị thực thi cao nhất cho người dùng.',
  },
  workers: DEFAULT_WORKERS,
};

export class AiCompanyService {
  constructor(
    private readonly ai: AiService,
    private readonly gateway: AiGatewayService,
  ) {}

  getConfig(): AiCompanyConfig {
    const raw = readJson<Partial<AiCompanyConfig>>(COMPANY_CONFIG_FILE, {});
    return {
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_CONFIG.enabled,
      masterBot: {
        name: raw.masterBot?.name?.trim() || DEFAULT_CONFIG.masterBot.name,
        role: raw.masterBot?.role?.trim() || DEFAULT_CONFIG.masterBot.role,
        targetModel: raw.masterBot?.targetModel?.trim() || DEFAULT_CONFIG.masterBot.targetModel,
        systemPrompt: raw.masterBot?.systemPrompt?.trim() || DEFAULT_CONFIG.masterBot.systemPrompt,
      },
      workers: Array.isArray(raw.workers) && raw.workers.length > 0 ? raw.workers : DEFAULT_WORKERS,
    };
  }

  saveConfig(patch: Partial<AiCompanyConfig>): AiCompanyConfig {
    const current = this.getConfig();
    const updated: AiCompanyConfig = {
      ...current,
      ...patch,
      masterBot: patch.masterBot ? { ...current.masterBot, ...patch.masterBot } : current.masterBot,
      workers: patch.workers ? patch.workers : current.workers,
    };
    writeJson(COMPANY_CONFIG_FILE, updated);
    return updated;
  }

  saveWorker(worker: Partial<CompanyWorker> & { id?: string; name: string }): CompanyWorker {
    const config = this.getConfig();
    const cleanName = worker.name.trim();
    if (!cleanName) throw badRequest('Tên phòng ban/công nhân AI không được để trống');

    const id = (worker.id || cleanName)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 32);

    const newWorker: CompanyWorker = {
      id,
      name: cleanName,
      role: worker.role?.trim() || 'Chuyên viên thực thi nhiệm vụ',
      avatar: worker.avatar?.trim() || '👷',
      targetModel: worker.targetModel?.trim() || 'auto',
      systemPrompt: worker.systemPrompt?.trim() || 'Bạn là trợ lý chuyên nghiệp.',
      enabled: worker.enabled !== undefined ? Boolean(worker.enabled) : true,
    };

    const idx = config.workers.findIndex((w) => w.id === id);
    if (idx >= 0) {
      config.workers[idx] = newWorker;
    } else {
      config.workers.push(newWorker);
    }

    this.saveConfig({ workers: config.workers });
    return newWorker;
  }

  deleteWorker(id: string): void {
    const config = this.getConfig();
    config.workers = config.workers.filter((w) => w.id !== id);
    this.saveConfig({ workers: config.workers });
  }

  resetDefault(): AiCompanyConfig {
    writeJson(COMPANY_CONFIG_FILE, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  /**
   * Xác định model thực thi tốt nhất cho từng worker:
   * - Nếu worker chỉ định model cụ thể và provider của nó đã có key -> Dùng model đó.
   * - Nếu có nhiều provider kết nối, phân chia model thông minh theo vai trò.
   * - Nếu chỉ có 1 provider / 1 key kết nối: Tất cả đều dùng model duy nhất đó (1 con làm nhiều việc).
   */
  private pickModelForWorker(worker: CompanyWorker, configuredProviders: string[]): string {
    if (worker.targetModel && worker.targetModel !== 'auto') {
      const slash = worker.targetModel.indexOf('/');
      const provider = slash > 0 ? worker.targetModel.slice(0, slash) : '';
      if (configuredProviders.includes(provider)) {
        return worker.targetModel;
      }
    }

    // Nếu chỉ có 1 provider kết nối: dùng 'auto' (chính provider đó)
    if (configuredProviders.length <= 1) {
      return 'auto';
    }

    // Nếu có nhiều provider kết nối: phân chia thông minh theo vai trò
    if (worker.id === 'dev' && configuredProviders.includes('anthropic')) return 'anthropic/claude-3-5-sonnet-20241022';
    if (worker.id === 'dev' && configuredProviders.includes('openai')) return 'openai/gpt-4o';
    if (worker.id === 'content' && configuredProviders.includes('gemini')) return 'gemini/gemini-2.0-flash';
    if (worker.id === 'qa' && configuredProviders.includes('openai')) return 'openai/gpt-4o-mini';

    return 'auto';
  }

  /**
   * Luồng điều phối AI Company (Master Bot + Workers):
   * Trả về SSE Stream từng bước sống động
   */
  async *dispatchStream(prompt: string): AsyncGenerator<CompanyStreamEvent> {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      yield { type: 'error', error: 'Vui lòng nhập yêu cầu công việc cho Sếp điều phối' };
      return;
    }

    const config = this.getConfig();
    const activeWorkers = config.workers.filter((w) => w.enabled);
    if (activeWorkers.length === 0) {
      yield { type: 'error', error: 'Công ty hiện chưa có phòng ban/công nhân AI nào được kích hoạt' };
      return;
    }

    // Lấy danh sách provider thực sự có kết nối key
    const configuredProviders = this.ai
      .list()
      .filter((p) => p.configured)
      .map((p) => p.id);

    // =========================================================================
    // PHA 1: SẾP LẬP KẾ HOẠCH & CHIA VIỆC (PLANNING)
    // =========================================================================
    yield {
      type: 'phase',
      phase: 'planning',
      message: `👔 ${config.masterBot.name} đang họp phân tích đề bài và phân chia nhiệm vụ cho các phòng ban...`,
    };

    const workerCatalog = activeWorkers.map((w) => `- Mã "${w.id}": ${w.name} (Vai trò: ${w.role})`).join('\n');

    const planningSystem = `${config.masterBot.systemPrompt}
Bạn là Sếp Tổng. Nhiệm vụ của bạn là nhận yêu cầu của người dùng, phân tích và chia việc cho các phòng ban công ty phù hợp nhất.
Dưới đây là danh sách các phòng ban khả dụng trong công ty:
${workerCatalog}

YÊU CẦU ĐẶC BIỆT:
Bạn PHẢI trả về ĐÚNG MỘT KHỐI JSON hợp lệ (không kèm markdown \`\`\`json, không lời giải thích ngoài lề) theo cấu trúc sau:
{
  "taskSummary": "Tóm tắt ngắn gọn 1-2 câu về mục tiêu tổng quát của dự án",
  "subtasks": [
    {
      "workerId": "mã_phòng_ban_từ_danh_sách",
      "instruction": "Yêu cầu chi tiết, nhiệm vụ rõ ràng giao cho phòng ban này thực hiện"
    }
  ]
}
Hãy chọn từ 1 đến ${Math.min(activeWorkers.length, 4)} phòng ban thực sự cần thiết cho yêu cầu này.`;

    let plan: CompanyPlan = {
      taskSummary: cleanPrompt.slice(0, 80),
      subtasks: activeWorkers.slice(0, 2).map((w) => ({
        workerId: w.id,
        workerName: w.name,
        instruction: cleanPrompt,
      })),
    };

    try {
      const planRes = await this.gateway.chat(
        {
          model: config.masterBot.targetModel || 'auto',
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: planningSystem },
            { role: 'user', content: `Yêu cầu cần giải quyết:\n"${cleanPrompt}"` },
          ],
        },
        'api',
      );

      if (planRes.ok) {
        const json = (await planRes.json()) as { choices?: { message?: { content?: string } }[] };
        const rawContent = json.choices?.[0]?.message?.content?.trim() || '';
        const cleanedJson = rawContent
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '')
          .trim();

        const parsed = JSON.parse(cleanedJson) as Partial<CompanyPlan>;
        if (parsed.subtasks && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
          plan = {
            taskSummary: parsed.taskSummary?.trim() || cleanPrompt.slice(0, 80),
            subtasks: parsed.subtasks.map((st) => {
              const matched = activeWorkers.find((w) => w.id === st.workerId) || activeWorkers[0];
              return {
                workerId: matched.id,
                workerName: matched.name,
                instruction: st.instruction?.trim() || cleanPrompt,
              };
            }),
          };
        }
      }
    } catch {
      // Fallback dùng plan mặc định nếu AI không trả về json chuẩn
    }

    yield {
      type: 'plan',
      plan,
      message: `👔 Sếp đã hoàn thành kế hoạch! Bắt đầu phân chia cho ${plan.subtasks.length} phòng ban thực thi.`,
    };

    // =========================================================================
    // PHA 2: CÁC CÔNG NHÂN / PHÒNG BAN THỰC THI (WORKER EXECUTION)
    // =========================================================================
    yield {
      type: 'phase',
      phase: 'working',
      message: '👷 Các công nhân AI đang đồng loạt xử lý nhiệm vụ được giao...',
    };

    const workerOutputs: { workerId: string; workerName: string; avatar: string; instruction: string; result: string }[] = [];

    for (const subtask of plan.subtasks) {
      const worker = activeWorkers.find((w) => w.id === subtask.workerId) || activeWorkers[0];
      const modelToUse = this.pickModelForWorker(worker, configuredProviders);

      yield {
        type: 'worker_start',
        workerId: worker.id,
        workerName: worker.name,
        modelUsed: modelToUse,
        instruction: subtask.instruction,
        message: `${worker.avatar} [${worker.name}] đang xử lý nhiệm vụ (dùng model: ${modelToUse})...`,
      };

      let workerResult = '';
      try {
        const workerPrompt = `Yêu cầu từ Sếp Tổng:\n"${subtask.instruction}"\n\nYêu cầu gốc của dự án:\n"${cleanPrompt}"\n\nHãy tập trung làm tốt nhất vai trò của bạn (${worker.role}). Trình bày rõ ràng, có căn cứ.`;

        const res = await this.gateway.chat(
          {
            model: modelToUse,
            temperature: 0.7,
            stream: false,
            messages: [
              { role: 'system', content: worker.systemPrompt },
              { role: 'user', content: workerPrompt },
            ],
          },
          'api',
        );

        if (res.ok) {
          const resJson = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          workerResult = resJson.choices?.[0]?.message?.content?.trim() || 'Đã hoàn thành phân tích chuyên môn.';
        } else {
          workerResult = `(Phòng ban phản hồi lỗi HTTP ${res.status})`;
        }
      } catch (err) {
        workerResult = `(Phòng ban gặp sự cố: ${(err as Error).message})`;
      }

      workerOutputs.push({
        workerId: worker.id,
        workerName: worker.name,
        avatar: worker.avatar,
        instruction: subtask.instruction,
        result: workerResult,
      });

      yield {
        type: 'worker_done',
        workerId: worker.id,
        workerName: worker.name,
        result: workerResult,
        message: `✅ ${worker.avatar} [${worker.name}] đã nộp kết quả công việc lên Sếp.`,
      };
    }

    // =========================================================================
    // PHA 3: SẾP TỔNG HỢP BÁO CÁO TOÀN DIỆN (SYNTHESIS & REPORT)
    // =========================================================================
    yield {
      type: 'phase',
      phase: 'synthesizing',
      message: `👔 ${config.masterBot.name} đang xem xét, tổng duyệt và viết báo cáo hoàn chỉnh cho bạn...`,
    };

    const aggregatedContext = workerOutputs
      .map(
        (w, i) =>
          `### [Báo cáo ${i + 1}] Từ phòng ban: ${w.avatar} ${w.workerName}\n**Nhiệm vụ được giao:** ${w.instruction}\n**Kết quả thực thi:**\n${w.result}\n`,
      )
      .join('\n\n---\n\n');

    const synthesisSystem = `${config.masterBot.systemPrompt}
Bạn là Sếp Tổng của hệ thống AI Company. Bạn nhận được các báo cáo đóng góp từ các phòng ban công nhân AI bên dưới.
Nhiệm vụ của bạn là:
1. Tổng hợp, liên kết và chắt lọc các kết quả thành một bản báo cáo đầy đủ, hoàn chỉnh, chuyên nghiệp nhất gửi tới khách hàng.
2. Có phần mở đầu đại diện cho Sếp Tổng chào hỏi và tóm tắt kết quả điều phối.
3. Có phần thân bài trình bày giải pháp cụ thể (code, nội dung, kiến trúc, phương án kiểm thử...).
4. Có phần ghi nhận ngắn gọn sự đóng góp của các phòng ban.
5. Giữ phong thái Sếp Tổng tự tin, lịch thiệp, chu đáo.`;

    const synthesisUserPrompt = `Yêu cầu ban đầu của khách hàng:\n"${cleanPrompt}"\n\nBáo cáo chi tiết từ các phòng ban công ty:\n${aggregatedContext}\n\nHãy xuất bản báo cáo tổng hợp cuối cùng hoàn chỉnh nhất cho khách hàng.`;

    let finalReport = '';
    try {
      const synthRes = await this.gateway.chat(
        {
          model: config.masterBot.targetModel || 'auto',
          temperature: 0.6,
          stream: true,
          messages: [
            { role: 'system', content: synthesisSystem },
            { role: 'user', content: synthesisUserPrompt },
          ],
        },
        'api',
      );

      if (synthRes.ok && synthRes.body) {
        const reader = synthRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const data = line.replace(/^data:\s*/, '').trim();
            if (!data || data === '[DONE]' || !line.startsWith('data:')) continue;
            try {
              const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
              if (delta) {
                finalReport += delta;
                yield { type: 'boss_chunk', delta };
              }
            } catch {
              // Ignore non-json chunks
            }
          }
        }
      } else {
        finalReport = `### Báo cáo tổng hợp từ Sếp Tổng:\n\n${workerOutputs.map((w) => `#### ${w.avatar} ${w.workerName}\n${w.result}`).join('\n\n')}`;
      }
    } catch (err) {
      finalReport = `### Báo cáo tổng hợp từ Sếp Tổng:\n\n(Lỗi khi tổng hợp: ${(err as Error).message})\n\n${workerOutputs.map((w) => `#### ${w.avatar} ${w.workerName}\n${w.result}`).join('\n\n')}`;
    }

    yield {
      type: 'done',
      phase: 'completed',
      fullReport: finalReport,
      message: `🏆 ${config.masterBot.name} đã hoàn thành báo cáo tổng hợp và bàn giao cho bạn!`,
    };
  }
}
