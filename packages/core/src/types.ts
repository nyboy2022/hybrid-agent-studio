import { z } from "zod";
export const botInput = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_-]{1,32}$/u, "名称只能包含字母、数字、下划线和短横线"),
  role: z.string().trim().min(1).max(2000),
  runtime: z.enum(["demo", "muse"]),
  model: z.string().trim().min(1).max(120),
  target: z.enum(["local", "cloud"]),
});
export type Bot = z.infer<typeof botInput> & { id: string };
export interface Group {
  id: string;
  name: string;
  botIds: string[];
}
export interface Message {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  createdAt: string;
  taskId?: string;
}
export interface Task {
  id: string;
  groupId: string;
  botId: string;
  title: string;
  parentId?: string;
  status:
    | "pending"
    | "awaiting_approval"
    | "running"
    | "completed"
    | "failed"
    | "denied";
  sessionId: string;
  result?: string;
  error?: string;
}
export interface Approval {
  id: string;
  taskId: string;
  summary: string;
  status: "pending" | "approved" | "denied";
}
export interface Audit {
  id: string;
  at: string;
  action: string;
  subjectId: string;
}
export interface WorkspaceState {
  version: 1;
  workspace: {
    id: string;
    name: string;
    computer: {
      status: "not_implemented";
      topology: "shared-computer-isolated-sessions";
    };
  };
  bots: Bot[];
  groups: Group[];
  messages: Message[];
  tasks: Task[];
  approvals: Approval[];
  audit: Audit[];
}
