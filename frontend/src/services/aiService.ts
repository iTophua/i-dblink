import { JSONStream } from '@wailsio/runtime';
import { api, type AITaskRequest, type AIChatMessage } from '../api';

/**
 * 流式执行 AI 任务。
 *
 * 走 Wails v3 流通道（JSONStream "ai-chat"）：每轮请求建立一条流连接，
 * 发送 AITaskRequest 后按帧接收 {content} 增量、{done:true} 结束、
 * {done:true,error} 失败。连接关闭（组件卸载/页面刷新）即触发后端取消
 * Provider 请求，无需 requestID 防串流。
 *
 * @returns 完整的文本结果
 */
export async function streamAITask(
  req: Omit<AITaskRequest, 'requestId'>,
  onChunk: (text: string) => void,
  onError?: (err: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let full = '';

  return new Promise<string>((resolve, reject) => {
    const socket = JSONStream('ai-chat');
    let settled = false;

    // 停止生成：关闭流连接（后端随即终止 Provider 请求），保留已生成部分
    const onAbort = () => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(full);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const fail = (err: string) => {
      if (settled) return;
      settled = true;
      if (onError) onError(err);
      reject(new Error(err));
    };

    socket.onopen = () => {
      socket.send(req);
    };
    socket.onmessage = (ev: MessageEvent<{ content?: string; done?: boolean; error?: string }>) => {
      const payload = ev.data;
      if (!payload || settled) return;
      if (payload.error) {
        settled = true;
        if (onError) onError(payload.error);
        reject(new Error(payload.error));
        return;
      }
      if (payload.done) {
        settled = true;
        resolve(full);
        return;
      }
      if (payload.content) {
        full += payload.content;
        onChunk(payload.content);
      }
    };
    // 后端发送 done 后关闭连接属正常路径；未结算即关闭视为异常中断
    socket.onclose = () => {
      if (!settled) fail('连接已中断');
    };
    socket.onerror = () => {
      if (!settled) fail('流连接失败');
    };
  });
}/**
 * 同步执行 AI 任务（等待完整结果）。
 */
export async function executeAITask(req: AITaskRequest): Promise<string> {
  const result = await api.executeAITask(req);
  return result.result;
}

/**
 * 流式 AI 聊天（多轮对话，前端透传 messages 数组）。
 * 与 streamAITask 共享同一套事件机制（ai-stream-<requestID>）。
 */
export async function streamChat(
  messages: AIChatMessage[],
  onChunk: (text: string) => void,
  onError?: (err: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return streamAITask({ taskId: 'chat', messages }, onChunk, onError, signal);
}
