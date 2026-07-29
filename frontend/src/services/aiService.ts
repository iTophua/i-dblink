import { EventsOn } from '../api';
import { api, type AITaskRequest, type AIChatMessage } from '../api';

/**
 * 流式执行 AI 任务。
 *
 * 通过 Wails 事件机制消费后端推送的 token：
 * 1. 生成 requestID（唯一标识本次流式请求，避免事件串流）
 * 2. 注册 EventsOn("ai-stream-<requestID>") 监听
 * 3. 调用后端 ExecuteAITaskStream（后端起 goroutine 推事件，立即返回）
 * 4. 逐 chunk 回调 onChunk
 * 5. 收到 done 事件后取消监听并 resolve 全文
 *
 * 注意：不能在 executeAITaskStream 返回后就 cleanup——后端 goroutine 此时还在推送。
 * 必须等 done 事件到达才取消监听。
 *
 * @returns 完整的文本结果
 */
export async function streamAITask(
  req: Omit<AITaskRequest, 'requestId'>,
  onChunk: (text: string) => void,
  onError?: (err: string) => void
): Promise<string> {
  const requestID = crypto.randomUUID();
  let full = '';

  return new Promise<string>((resolve, reject) => {
    // 注册事件监听（后端推送的 token）
    const cleanup = EventsOn(
      `ai-stream-${requestID}`,
      (payload: { content?: string; done?: boolean; error?: string }) => {
        if (payload.error) {
          cleanup();
          if (onError) onError(payload.error);
          reject(new Error(payload.error));
          return;
        }
        if (payload.done) {
          cleanup(); // 收到 done 才取消监听
          resolve(full);
          return;
        }
        if (payload.content) {
          full += payload.content;
          onChunk(payload.content);
        }
      }
    );

    // 发起后端调用（后端 goroutine 推事件，立即返回）
    // 注意：绑定返回不代表流结束，流结束由 done 事件标记
    api
      .executeAITaskStream({ ...req, requestId: requestID })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}

/**
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
  onError?: (err: string) => void
): Promise<string> {
  return streamAITask({ taskId: 'chat', messages }, onChunk, onError);
}
