import { z } from "zod";
export const avatarInput = z
  .object({
    kind: z.enum(["text", "emoji", "image"]),
    value: z.string().max(200),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    foreground: z.string().regex(/^#[0-9a-f]{6}$/i),
    radius: z.number().min(0).max(50),
    fit: z.enum(["cover", "contain"]),
    scale: z.number().min(1).max(3),
    x: z.number().min(-50).max(50),
    y: z.number().min(-50).max(50),
  })
  .superRefine((avatar, ctx) => {
    if (
      avatar.kind === "image" &&
      !/^\/api\/avatars\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(avatar.value)
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "请先上传头像图片",
      });
    if (avatar.kind !== "image" && avatar.value.length > 16)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "文字或 Emoji 头像最多 16 个字符",
      });
  });
export type Avatar = z.infer<typeof avatarInput>;
export const botInput = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_-]{1,32}$/u, "名称只能包含字母、数字、下划线和短横线"),
  role: z.string().trim().min(1).max(2000),
  runtime: z.enum(["demo", "muse"]),
  model: z.string().trim().min(1).max(120),
  target: z.enum(["local", "cloud"]),
  avatar: avatarInput.optional(),
});
export type Bot = z.infer<typeof botInput> & { id: string };
export interface Group {
  kind?: "group" | "direct";
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
