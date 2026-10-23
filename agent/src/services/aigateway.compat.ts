// ZenPanel - Lớp chuyển đổi cho AI Gateway: API Anthropic Messages (/v1/messages - Claude Code, SDK Anthropic)
// và API Ollama (/api/chat, /api/generate, /api/tags) sang chuẩn OpenAI chat completions bên trong gateway.
import { randomBytes } from 'node:crypto';
import { HttpError } from '../core/validate.js';

type Json = Record<string, unknown>;
type OpenAiMessage = { role: string; content?: unknown; tool_calls?: unknown[]; tool_call_id?: string; name?: string };

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;

// ------------------------------------------------------------------------ Anthropic -> OpenAI

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b: Json) => (b?.type === 'text' ? String(b.text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

export function anthropicToOpenAi(body: Json): Json {
  const messages: OpenAiMessage[] = [];
  const system = blockText(body.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const msg of (Array.isArray(body.messages) ? body.messages : []) as Json[]) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (typeof msg.content === 'string') {
      messages.push({ role, content: msg.content });
      continue;
    }
    const blocks = (Array.isArray(msg.content) ? msg.content : []) as Json[];
    if (role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('');
      const toolCalls = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: String(b.id), type: 'function', function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    // user: tool_result -> message role "tool"; text/image -> nội dung đa phần
    const parts: Json[] = [];
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        messages.push({ role: 'tool', tool_call_id: String(b.tool_use_id), content: blockText(b.content) || (typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '')) });
      } else if (b.type === 'text') parts.push({ type: 'text', text: String(b.text ?? '') });
      else if (b.type === 'image') {
        const src = (b.source ?? {}) as Json;
        const url = src.type === 'base64' ? `data:${src.media_type};base64,${src.data}` : String(src.url ?? '');
        parts.push({ type: 'image_url', image_url: { url } });
      }
    }
    if (parts.length) messages.push({ role: 'user', content: parts.every((p) => p.type === 'text') ? parts.map((p) => p.text).join('\n') : parts });
  }

  const out: Json = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens,
    stream: Boolean(body.stream),
  };
  if (body.temperature !== undefined) out.temperature = body.temperature;
  if (body.top_p !== undefined) out.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) out.stop = body.stop_sequences;
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = (body.tools as Json[])
      .filter((t) => t.name && (t.input_schema || !t.type))
      .map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.input_schema ?? { type: 'object', properties: {} } } }));
    const choice = body.tool_choice as Json | undefined;
    if (choice?.type === 'any') out.tool_choice = 'required';
    else if (choice?.type === 'tool') out.tool_choice = { type: 'function', function: { name: choice.name } };
    else if (choice?.type === 'none') out.tool_choice = 'none';
  }
  if (out.stream) out.stream_options = { include_usage: true };
  return out;
}

const STOP: Record<string, string> = { stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', function_call: 'tool_use', content_filter: 'end_turn' };

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return { raw: text };
  }
}

export function openAiToAnthropic(json: Json, model: string): Json {
  const choice = ((json.choices as Json[] | undefined) ?? [])[0] ?? {};
  const message = (choice.message ?? {}) as Json;
  const content: Json[] = [];
  if (typeof message.content === 'string' && message.content) content.push({ type: 'text', text: message.content });
  for (const call of (message.tool_calls as Json[] | undefined) ?? []) {
    const fn = (call.function ?? {}) as Json;
    content.push({ type: 'tool_use', id: String(call.id ?? id('toolu')), name: String(fn.name ?? ''), input: safeJson(String(fn.arguments ?? '{}')) });
  }
  const usage = (json.usage ?? {}) as Json;
  return {
    id: id('msg'),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: STOP[String(choice.finish_reason)] ?? 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: Number(usage.prompt_tokens ?? 0), output_tokens: Number(usage.completion_tokens ?? 0) },
  };
}

/** Đọc SSE của OpenAI, trả từng object JSON trong "data:" */
async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Json> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data) as Json;
      } catch {
        // bỏ qua dòng hỏng
      }
    }
  }
}

/** Stream OpenAI -> chuỗi sự kiện Anthropic (message_start, content_block_*, message_delta, message_stop) */
export function openAiStreamToAnthropic(upstream: Response, model: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: Json) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('message_start', { type: 'message_start', message: { id: id('msg'), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
      let blockIndex = -1;
      let openBlock: 'text' | 'tool' | null = null;
      const toolIndex = new Map<number, number>();
      let stopReason = 'end_turn';
      const usage = { input_tokens: 0, output_tokens: 0 };
      const close = () => {
        if (openBlock) send('content_block_stop', { type: 'content_block_stop', index: blockIndex });
        openBlock = null;
      };
      try {
        for await (const chunk of sseChunks(upstream.body!)) {
          const u = chunk.usage as Json | undefined;
          if (u) {
            usage.input_tokens = Number(u.prompt_tokens ?? usage.input_tokens);
            usage.output_tokens = Number(u.completion_tokens ?? usage.output_tokens);
          }
          const choice = ((chunk.choices as Json[] | undefined) ?? [])[0];
          if (!choice) continue;
          const delta = (choice.delta ?? {}) as Json;
          if (typeof delta.content === 'string' && delta.content) {
            if (openBlock !== 'text') {
              close();
              blockIndex++;
              openBlock = 'text';
              send('content_block_start', { type: 'content_block_start', index: blockIndex, content_block: { type: 'text', text: '' } });
            }
            send('content_block_delta', { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text: delta.content } });
          }
          for (const call of (delta.tool_calls as Json[] | undefined) ?? []) {
            const i = Number(call.index ?? 0);
            const fn = (call.function ?? {}) as Json;
            if (!toolIndex.has(i)) {
              close();
              blockIndex++;
              openBlock = 'tool';
              toolIndex.set(i, blockIndex);
              send('content_block_start', { type: 'content_block_start', index: blockIndex, content_block: { type: 'tool_use', id: String(call.id ?? id('toolu')), name: String(fn.name ?? ''), input: {} } });
            }
            if (fn.arguments) send('content_block_delta', { type: 'content_block_delta', index: toolIndex.get(i), delta: { type: 'input_json_delta', partial_json: String(fn.arguments) } });
          }
          if (choice.finish_reason) stopReason = STOP[String(choice.finish_reason)] ?? 'end_turn';
        }
      } catch (err) {
        send('error', { type: 'error', error: { type: 'api_error', message: (err as Error).message } });
      }
      close();
      send('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
      send('message_stop', { type: 'message_stop' });
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

/** Lỗi theo định dạng Anthropic */
export function anthropicError(err: unknown): { status: number; body: Json } {
  const status = err instanceof HttpError ? err.statusCode : 500;
  const type = status === 401 ? 'authentication_error' : status === 403 ? 'permission_error' : status === 429 ? 'rate_limit_error' : status === 400 ? 'invalid_request_error' : 'api_error';
  return { status, body: { type: 'error', error: { type, message: (err as Error).message } } };
}

// ------------------------------------------------------------------------ Ollama <-> OpenAI

export function ollamaChatToOpenAi(body: Json, generate = false): Json {
  const opts = (body.options ?? {}) as Json;
  const messages = generate
    ? [...(body.system ? [{ role: 'system', content: String(body.system) }] : []), { role: 'user', content: String(body.prompt ?? '') }]
    : ((Array.isArray(body.messages) ? body.messages : []) as Json[]).map((m) => ({
        role: String(m.role ?? 'user'),
        content: Array.isArray(m.images) && m.images.length
          ? [{ type: 'text', text: String(m.content ?? '') }, ...(m.images as string[]).map((img) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } }))]
          : String(m.content ?? ''),
      }));
  const out: Json = { model: body.model, messages, stream: body.stream !== false };
  if (opts.temperature !== undefined) out.temperature = opts.temperature;
  if (opts.top_p !== undefined) out.top_p = opts.top_p;
  if (opts.num_predict !== undefined) out.max_tokens = opts.num_predict;
  if (opts.stop !== undefined) out.stop = opts.stop;
  if (Array.isArray(body.tools)) out.tools = body.tools;
  if (out.stream) out.stream_options = { include_usage: true };
  return out;
}

export function openAiToOllama(json: Json, model: string, generate = false): Json {
  const choice = ((json.choices as Json[] | undefined) ?? [])[0] ?? {};
  const message = (choice.message ?? {}) as Json;
  const usage = (json.usage ?? {}) as Json;
  const base = {
    model,
    created_at: new Date().toISOString(),
    done: true,
    done_reason: choice.finish_reason === 'length' ? 'length' : 'stop',
    prompt_eval_count: Number(usage.prompt_tokens ?? 0),
    eval_count: Number(usage.completion_tokens ?? 0),
    total_duration: 0,
  };
  if (generate) return { ...base, response: String(message.content ?? '') };
  return { ...base, message: { role: 'assistant', content: String(message.content ?? ''), ...(message.tool_calls ? { tool_calls: (message.tool_calls as Json[]).map((c) => ({ function: { name: (c.function as Json)?.name, arguments: safeJson(String((c.function as Json)?.arguments ?? '{}')) } })) } : {}) } };
}

/** Stream OpenAI -> NDJSON kiểu Ollama */
export function openAiStreamToOllama(upstream: Response, model: string, generate = false): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (data: Json) => controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      let promptTokens = 0;
      let outputTokens = 0;
      let reason = 'stop';
      try {
        for await (const chunk of sseChunks(upstream.body!)) {
          const u = chunk.usage as Json | undefined;
          if (u) {
            promptTokens = Number(u.prompt_tokens ?? promptTokens);
            outputTokens = Number(u.completion_tokens ?? outputTokens);
          }
          const choice = ((chunk.choices as Json[] | undefined) ?? [])[0];
          if (!choice) continue;
          const text = String(((choice.delta ?? {}) as Json).content ?? '');
          if (choice.finish_reason === 'length') reason = 'length';
          if (!text) continue;
          const created_at = new Date().toISOString();
          line(generate ? { model, created_at, response: text, done: false } : { model, created_at, message: { role: 'assistant', content: text }, done: false });
        }
      } catch (err) {
        line({ error: (err as Error).message });
      }
      const created_at = new Date().toISOString();
      const done = { model, created_at, done: true, done_reason: reason, prompt_eval_count: promptTokens, eval_count: outputTokens, total_duration: 0 };
      line(generate ? { ...done, response: '' } : { ...done, message: { role: 'assistant', content: '' } });
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}
