import { api } from "./client";

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
  callId: string;
}

export interface AgentChatResult {
  reply: string | null;
  conversationId: string;
  pendingAction?: PendingAction;
}

export function sendMessage(message: string, conversationId?: string): Promise<AgentChatResult> {
  return api.post<AgentChatResult>("/agent/chat", { message, conversationId });
}

export function confirmAction(conversationId: string, pendingAction: PendingAction): Promise<AgentChatResult> {
  return api.post<AgentChatResult>("/agent/confirm-action", {
    conversationId,
    tool: pendingAction.tool,
    args: pendingAction.args,
  });
}
