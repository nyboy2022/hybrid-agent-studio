"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Avatar, Bot, WorkspaceState, Task } from "@hybrid/core";

import { BotAvatar } from "./components/BotAvatar";

const defaultAvatar: Avatar = {
  kind: "text",
  value: "",
  background: "#335b86",
  foreground: "#e0eeff",
  radius: 30,
  fit: "cover",
  scale: 1,
  x: 0,
  y: 0,
};

type BotDraft = Omit<Bot, "id">;
const freshBot: BotDraft = {
  name: "",
  role: "",
  runtime: "demo",
  model: "demo",
  target: "local",
};
const labels: Record<Task["status"], string> = {
  pending: "排队中",
  awaiting_approval: "等待审批",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  denied: "已拒绝",
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data as T;
}
export default function StudioPage() {
  const [state, setState] = useState<WorkspaceState>();
  const [view, setView] = useState<"chat" | "bots" | "approvals" | "computer">(
    "chat",
  );
  const [groupId, setGroupId] = useState("");
  const [showTasks, setShowTasks] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const groupDialog = useRef<HTMLDialogElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BotDraft>(freshBot);
  const avatar = draft.avatar ?? defaultAvatar;
  function patchAvatar(change: Partial<Avatar>) {
    setDraft((current) => ({
      ...current,
      avatar: { ...(current.avatar ?? defaultAvatar), ...change },
    }));
  }
  async function uploadAvatar(file: File) {
    await act(async () => {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      )
        throw new Error("请选择 PNG、JPG、WebP 或 GIF 图片");
      if (file.size > 10 * 1024 * 1024) throw new Error("图片最大 10MB");
      let blob: Blob = file;
      if (file.size > 512 * 1024) {
        if (file.type === "image/gif")
          throw new Error("动态 GIF 需小于 512KB，以保留动画");
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
        canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("图片转换失败")),
            "image/webp",
            0.9,
          ),
        );
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(blob);
      });
      const { src } = await api<{ src: string }>("avatars", "POST", {
        dataUrl,
      });
      patchAvatar({ kind: "image", value: src, scale: 1, x: 0, y: 0 });
    });
  }
  const [editing, setEditing] = useState<string>();
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [handoff, setHandoff] = useState<{
    taskId: string;
    botId: string;
    title: string;
  }>();
  const [muse, setMuse] = useState<{
    installed: boolean;
    version: string | null;
    authenticated: string;
  }>();
  const refresh = useCallback(async () => {
    const next = await api<WorkspaceState>("state");
    setState(next);
    setGroupId((current) => current || next.groups[0]?.id || "");
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 750);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (showGroupForm) groupDialog.current?.showModal();
    else groupDialog.current?.close();
  }, [showGroupForm]);
  const conversationMessages =
    state?.messages.filter((m) => m.groupId === groupId) ?? [];
  const lastMessage = conversationMessages.at(-1);
  useEffect(() => {
    if (followMessages.current && messageList.current) {
      messageList.current.scrollTop = messageList.current.scrollHeight;
    }
  }, [groupId, lastMessage?.id, lastMessage?.text]);
  function selectGroup(id: string) {
    setGroupId(id);
    setView("chat");
    setShowTasks(false);
    setShowMembers(false);
    setHandoff(undefined);
    followMessages.current = true;
  }
  async function openBot(bot: Bot) {
    const existing = state?.groups.find(
      (g) => g.kind === "direct" && g.botIds[0] === bot.id,
    );
    if (existing) {
      selectGroup(existing.id);
      return;
    }
    await act(async () => {
      const created = await api<{ id: string }>("groups", "POST", {
        name: bot.name,
        kind: "direct",
        botIds: [bot.id],
      });
      selectGroup(created.id);
    });
  }
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const group = state?.groups.find((g) => g.id === groupId);
  const approvals =
    state?.approvals.filter((a) => a.status === "pending") ?? [];
  const botName = (id: string) =>
    state?.bots.find((b) => b.id === id)?.name ||
    (id === "user" ? "你" : id === "system" ? "系统" : "已删除 Bot");
  const tasks = state?.tasks.filter((t) => t.groupId === groupId) ?? [];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-heading">
          <a className="brand" href="/" aria-label="Hybrid Agent Studio">
            <span className="brand-icon">h</span>
            <span className="brand-name">Hybrid</span>
          </a>
          <button
            className="icon-button new-chat"
            title="新建群聊"
            aria-label="新建群聊"
            onClick={() => setShowGroupForm(true)}
          >
            ＋
          </button>
        </div>
        <div className="sidebar-conversations">
          <div className="list-label">BOTS</div>
          {state?.bots.map((bot) => {
            const direct = state.groups.find(
              (g) => g.kind === "direct" && g.botIds[0] === bot.id,
            );
            const last = state.messages
              .filter((m) => m.groupId === direct?.id)
              .at(-1);
            return (
              <button
                key={bot.id}
                aria-label={`与 ${bot.name} 聊天`}
                title={bot.name}
                disabled={busy}
                className={`conversation-link ${view === "chat" && groupId === direct?.id ? "selected" : ""}`}
                onClick={() => void openBot(bot)}
              >
                <BotAvatar bot={bot} />
                <span className="conversation-label">
                  <strong>{bot.name}</strong>
                  <small>{last?.text || bot.role}</small>
                </span>
              </button>
            );
          })}
          {!state?.bots.length && (
            <button className="sidebar-empty" onClick={() => setView("bots")}>
              ＋ 创建第一个 Bot
            </button>
          )}
          <div className="list-label group-label">群聊</div>
          {state?.groups
            .filter((g) => g.kind !== "direct")
            .map((g) => {
              const last = state.messages
                .filter((m) => m.groupId === g.id)
                .at(-1);
              return (
                <button
                  key={g.id}
                  aria-label={`# ${g.name}`}
                  title={g.name}
                  className={`conversation-link ${view === "chat" && g.id === groupId ? "selected" : ""}`}
                  onClick={() => selectGroup(g.id)}
                >
                  <span className="avatar group-avatar">#</span>
                  <span className="conversation-label">
                    <strong>{g.name}</strong>
                    <small>
                      {last?.text || `${g.botIds.length} 位 Bot 成员`}
                    </small>
                  </span>
                </button>
              );
            })}
          <button
            className="sidebar-empty"
            aria-label="新建协作群"
            onClick={() => setShowGroupForm(true)}
          >
            ＋ <span>新建协作群</span>
          </button>
        </div>
        <nav className="sidebar-tools" aria-label="工作区管理">
          <button
            aria-label="团队群聊"
            title="团队群聊"
            className={view === "chat" ? "active" : ""}
            onClick={() => setView("chat")}
          >
            <span aria-hidden="true">◌</span>
            <span className="tool-label">团队群聊</span>
          </button>
          <button
            aria-label="我的 Bots"
            title="管理 Bots"
            className={view === "bots" ? "active" : ""}
            onClick={() => setView("bots")}
          >
            <span aria-hidden="true">◉</span>
            <span className="tool-label">管理 Bots</span>
          </button>
          <button
            aria-label={`安全审批${approvals.length ? `，${approvals.length} 项待处理` : ""}`}
            title="安全审批"
            className={view === "approvals" ? "active" : ""}
            onClick={() => setView("approvals")}
          >
            <span aria-hidden="true">◇</span>
            <span className="tool-label">安全审批</span>
            {approvals.length > 0 && (
              <span className="count-badge">{approvals.length}</span>
            )}
          </button>
          <button
            aria-label="共享电脑"
            title="共享电脑"
            className={view === "computer" ? "active" : ""}
            onClick={() => setView("computer")}
          >
            <span aria-hidden="true">▣</span>
            <span className="tool-label">共享电脑</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" />
          <span>本地工作区</span>
          <small>开源 Alpha</small>
        </div>
      </aside>
      <main>
        <header>
          <div className="header-title">
            <h1>
              {view === "chat"
                ? (group?.kind === "direct"
                    ? botName(group.botIds[0])
                    : group?.name) || "团队群聊"
                : {
                    bots: "管理 Bots",
                    approvals: "安全审批",
                    computer: "共享电脑",
                  }[view]}
            </h1>
            {view === "chat" && group && (
              <small>
                {group.botIds.length === 1
                  ? botName(group.botIds[0])
                  : `${group.botIds.length} 位 Bot 成员`}
              </small>
            )}
          </div>
          {view === "chat" && group && (
            <div className="header-actions">
              <button
                aria-expanded={showMembers}
                onClick={() => setShowMembers(!showMembers)}
              >
                成员
              </button>
              <button
                aria-label="任务"
                aria-expanded={showTasks}
                onClick={() => setShowTasks(!showTasks)}
              >
                任务
                {tasks.length > 0 && (
                  <span className="button-count">{tasks.length}</span>
                )}
              </button>
            </div>
          )}
        </header>
        {view === "chat" && showMembers && group && (
          <section className="members-panel" aria-label="群成员">
            <div>
              <strong>群成员</strong>
              <button
                className="icon-button"
                aria-label="关闭成员列表"
                onClick={() => setShowMembers(false)}
              >
                ×
              </button>
            </div>
            {group.botIds.map((id) => (
              <p key={id}>
                <BotAvatar
                  bot={state?.bots.find((b) => b.id === id)}
                  name={botName(id)}
                  className="small"
                />
                {botName(id)}
              </p>
            ))}
          </section>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {!state ? (
          <div className="empty">正在连接本地工作区…</div>
        ) : (
          <>
            {view === "bots" && (
              <section className="content">
                <div className="section-intro">
                  <h2>你的 Bots</h2>
                  <p>设置角色与模型，点击左侧 Bot 开始聊天。</p>
                </div>
                <div className="two-col">
                  <div className="bot-grid">
                    {state?.bots.map((bot) => (
                      <article className="card" key={bot.id}>
                        <div className="card-top">
                          <BotAvatar bot={bot} />
                          <span className="pill">
                            {bot.runtime === "demo" ? "演示模型" : "MUSE CODE"}
                          </span>
                        </div>
                        <h3>{bot.name}</h3>
                        <p>{bot.role}</p>
                        <div className="muted">
                          {bot.model} · {bot.target}
                        </div>
                        <div className="actions">
                          <button
                            onClick={() => {
                              setEditing(bot.id);
                              setDraft(bot);
                            }}
                          >
                            编辑
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `删除 ${bot.name}？历史消息仍保留。`,
                                )
                              )
                                void act(() => api(`bots/${bot.id}`, "DELETE"));
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </article>
                    ))}
                    {!state.bots.length && (
                      <div className="empty">
                        先创建两个 Bot，再组建你的团队。
                      </div>
                    )}
                  </div>
                  <form
                    className="card form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        await api(
                          editing ? `bots/${editing}` : "bots",
                          editing ? "PUT" : "POST",
                          draft,
                        );
                        setDraft(freshBot);
                        setEditing(undefined);
                      });
                    }}
                  >
                    <h3>{editing ? "编辑 Bot" : "创建 Bot"}</h3>
                    <label>
                      Bot 名称
                      <input
                        required
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        placeholder="例如：程序员"
                      />
                    </label>
                    <details className="avatar-editor">
                      <summary>
                        <span>自定义头像</span>
                        <BotAvatar bot={draft} />
                      </summary>
                      <div className="avatar-preview">
                        <BotAvatar bot={draft} />
                        <small>预览</small>
                      </div>
                      <div
                        className="segmented"
                        role="group"
                        aria-label="头像类型"
                      >
                        {(
                          [
                            ["text", "文字"],
                            ["emoji", "Emoji"],
                            ["image", "图片"],
                          ] as const
                        ).map(([kind, label]) => (
                          <button
                            type="button"
                            key={kind}
                            aria-pressed={avatar.kind === kind}
                            onClick={() =>
                              patchAvatar({
                                kind,
                                value: kind === "emoji" ? "🤖" : "",
                                scale: 1,
                                x: 0,
                                y: 0,
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {avatar.kind === "image" ? (
                        <>
                          <label>
                            上传头像
                            <input
                              aria-label="上传头像"
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              disabled={busy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadAvatar(file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <small>
                            PNG / JPG / WebP / GIF。静态图片最大
                            10MB，自动优化；动态 GIF 最大 512KB。
                          </small>
                          {avatar.value && (
                            <>
                              <label>
                                图片适配
                                <select
                                  aria-label="图片适配"
                                  value={avatar.fit}
                                  onChange={(e) =>
                                    patchAvatar({
                                      fit: e.target.value as Avatar["fit"],
                                    })
                                  }
                                >
                                  <option value="cover">填满头像</option>
                                  <option value="contain">完整显示</option>
                                </select>
                              </label>
                              <label>
                                缩放
                                <input
                                  aria-label="头像缩放"
                                  type="range"
                                  min="1"
                                  max="3"
                                  step="0.05"
                                  value={avatar.scale}
                                  onChange={(e) =>
                                    patchAvatar({
                                      scale: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                水平位置
                                <input
                                  aria-label="头像水平位置"
                                  type="range"
                                  min="-50"
                                  max="50"
                                  value={avatar.x}
                                  onChange={(e) =>
                                    patchAvatar({ x: Number(e.target.value) })
                                  }
                                />
                              </label>
                              <label>
                                垂直位置
                                <input
                                  aria-label="头像垂直位置"
                                  type="range"
                                  min="-50"
                                  max="50"
                                  value={avatar.y}
                                  onChange={(e) =>
                                    patchAvatar({ y: Number(e.target.value) })
                                  }
                                />
                              </label>
                            </>
                          )}
                        </>
                      ) : (
                        <label>
                          {avatar.kind === "emoji" ? "Emoji 头像" : "头像文字"}
                          <input
                            maxLength={16}
                            value={avatar.value}
                            placeholder={
                              avatar.kind === "emoji"
                                ? "🦊"
                                : "默认使用 Bot 名称"
                            }
                            onChange={(e) =>
                              patchAvatar({ value: e.target.value })
                            }
                          />
                        </label>
                      )}
                      <div className="avatar-colors">
                        <label>
                          背景颜色
                          <input
                            type="color"
                            value={avatar.background}
                            onChange={(e) =>
                              patchAvatar({ background: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          文字颜色
                          <input
                            type="color"
                            value={avatar.foreground}
                            onChange={(e) =>
                              patchAvatar({ foreground: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        圆角
                        <input
                          aria-label="头像圆角"
                          type="range"
                          min="0"
                          max="50"
                          value={avatar.radius}
                          onChange={(e) =>
                            patchAvatar({ radius: Number(e.target.value) })
                          }
                        />
                      </label>
                      <div className="segmented">
                        {(
                          [
                            [50, "圆形"],
                            [25, "圆角"],
                            [0, "方形"],
                          ] as const
                        ).map(([radius, label]) => (
                          <button
                            type="button"
                            key={radius}
                            aria-pressed={avatar.radius === radius}
                            onClick={() => patchAvatar({ radius })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            avatar: undefined,
                          }))
                        }
                      >
                        恢复默认头像
                      </button>
                    </details>

                    <label>
                      角色与职责
                      <textarea
                        required
                        value={draft.role}
                        onChange={(e) =>
                          setDraft({ ...draft, role: e.target.value })
                        }
                        placeholder="负责什么工作，如何与团队协作…"
                      />
                    </label>
                    <label>
                      运行时
                      <select
                        aria-label="运行时"
                        value={draft.runtime}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            runtime: e.target.value as Bot["runtime"],
                            model:
                              e.target.value === "muse"
                                ? "muse-spark-1.2"
                                : "demo",
                          })
                        }
                      >
                        <option value="demo">演示模型（无需密钥）</option>
                        <option value="muse">Muse Code 官方 SDK</option>
                      </select>
                    </label>
                    <label>
                      模型
                      <input
                        required
                        value={draft.model}
                        onChange={(e) =>
                          setDraft({ ...draft, model: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      执行位置
                      <select
                        aria-label="执行位置"
                        value={draft.target}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            target: e.target.value as Bot["target"],
                          })
                        }
                      >
                        <option value="local">本地</option>
                        <option value="cloud" disabled>
                          云端 · 后续阶段
                        </option>
                      </select>
                    </label>
                    <button className="primary" disabled={busy}>
                      {editing ? "保存修改" : "创建 Bot"}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(undefined);
                          setDraft(freshBot);
                        }}
                      >
                        取消编辑
                      </button>
                    )}
                  </form>
                </div>
              </section>
            )}
            {view === "chat" && (
              <div className="chat-layout">
                <section className="conversation">
                  {group ? (
                    <>
                      <div
                        className="messages"
                        ref={messageList}
                        aria-live="polite"
                        onScroll={(e) => {
                          const el = e.currentTarget;
                          followMessages.current =
                            el.scrollHeight - el.scrollTop - el.clientHeight <
                            80;
                        }}
                      >
                        {state.messages
                          .filter((m) => m.groupId === groupId)
                          .map((m) => (
                            <article
                              className={`message ${m.senderId === "user" ? "user-message" : m.senderId === "system" ? "system" : ""}`}
                              key={m.id}
                            >
                              <BotAvatar
                                bot={state.bots.find(
                                  (b) => b.id === m.senderId,
                                )}
                                name={botName(m.senderId)}
                                className="small"
                              />
                              <div>
                                <div className="message-meta">
                                  <strong>{botName(m.senderId)}</strong>
                                  <time>
                                    {new Date(m.createdAt).toLocaleTimeString(
                                      "zh-CN",
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
                                  </time>
                                </div>
                                <p>{m.text || "正在思考…"}</p>
                              </div>
                            </article>
                          ))}
                        {!state.messages.some((m) => m.groupId === groupId) && (
                          <div className="empty">
                            <span className="empty-symbol">◈</span>
                            <h3>把工作交给你的团队</h3>
                            <p>
                              使用 @Bot名称 指派工作。未指定时，由首位成员响应。
                            </p>
                          </div>
                        )}
                      </div>
                      <form
                        className="composer"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            await api(`groups/${groupId}/messages`, "POST", {
                              text,
                            });
                            setText("");
                            followMessages.current = true;
                          });
                        }}
                      >
                        <label className="sr-only" htmlFor="message">
                          消息
                        </label>
                        <textarea
                          id="message"
                          required
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder={
                            group.botIds.length === 1
                              ? `给 ${botName(group.botIds[0])} 发消息…`
                              : `给 ${group.name} 发消息，@ 指定 Bot…`
                          }
                        />
                        <div className="composer-bottom">
                          <small>
                            {approvals.some((a) =>
                              tasks.some((t) => t.id === a.taskId),
                            ) ? (
                              <button
                                type="button"
                                className="approval-notice"
                                onClick={() => setView("approvals")}
                              >
                                有任务等待审批 →
                              </button>
                            ) : (
                              "Enter 换行"
                            )}
                          </small>
                          <button
                            className="primary"
                            disabled={busy || !text.trim()}
                          >
                            发送 ↑
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="empty">
                      <span className="empty-symbol">◈</span>
                      <h2>从一个小团队开始</h2>
                      <p>创建 Bots，然后把它们加入同一个协作群。</p>
                      <button
                        className="primary"
                        onClick={() => setView("bots")}
                      >
                        创建第一个 Bot
                      </button>
                    </div>
                  )}
                </section>
                {showTasks && (
                  <aside className="task-panel" aria-label="任务与交接">
                    <div className="dialog-heading">
                      <h2>任务与交接</h2>
                      <button
                        className="icon-button"
                        aria-label="关闭任务面板"
                        onClick={() => setShowTasks(false)}
                      >
                        ×
                      </button>
                    </div>
                    <p className="muted">
                      每条任务链最多 8 次执行，交接深度最多 3 层。
                    </p>
                    {tasks
                      .slice()
                      .reverse()
                      .map((task) => (
                        <article className="task" key={task.id}>
                          <span className={`task-status ${task.status}`}>
                            {labels[task.status]}
                          </span>
                          <strong>{botName(task.botId)}</strong>
                          <p>{task.title}</p>
                          <small>
                            会话 {task.sessionId.slice(0, 8)}
                            {task.parentId ? " · 交接任务" : ""}
                          </small>
                          {task.error && (
                            <p className="error-text">{task.error}</p>
                          )}
                          {task.status === "completed" && (
                            <button
                              onClick={() =>
                                setHandoff({
                                  taskId: task.id,
                                  botId:
                                    group?.botIds.find(
                                      (b) => b !== task.botId,
                                    ) || task.botId,
                                  title: "",
                                })
                              }
                            >
                              交接任务 →
                            </button>
                          )}
                        </article>
                      ))}
                    {handoff && (
                      <form
                        className="card form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            await api(
                              `tasks/${handoff.taskId}/handoff`,
                              "POST",
                              {
                                botId: handoff.botId,
                                title: handoff.title,
                              },
                            );
                            setHandoff(undefined);
                          });
                        }}
                      >
                        <h3>任务交接</h3>
                        <label>
                          交接给
                          <select
                            aria-label="交接给"
                            value={handoff.botId}
                            onChange={(e) =>
                              setHandoff({ ...handoff, botId: e.target.value })
                            }
                          >
                            {group?.botIds.map((id) => (
                              <option key={id} value={id}>
                                {botName(id)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          交接说明
                          <textarea
                            required
                            value={handoff.title}
                            onChange={(e) =>
                              setHandoff({ ...handoff, title: e.target.value })
                            }
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          确认交接
                        </button>
                        <button
                          type="button"
                          onClick={() => setHandoff(undefined)}
                        >
                          取消
                        </button>
                      </form>
                    )}
                  </aside>
                )}
              </div>
            )}
            {view === "approvals" && (
              <section className="content">
                <div className="section-intro">
                  <h2>授权由你决定。</h2>
                  <p>
                    每次 Muse 执行前审批数据发送与只读任务。任何 Bot
                    的交接都不能代替你的授权。
                  </p>
                </div>
                {!approvals.length && (
                  <div className="card empty">没有等待审批的任务</div>
                )}
                {approvals.map((a) => (
                  <article className="card approval" key={a.id}>
                    <span className="pill">等待授权</span>
                    <h3>Muse 只读任务</h3>
                    <p>{a.summary}</p>
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            api(`approvals/${a.id}`, "POST", {
                              approved: true,
                            }),
                          )
                        }
                      >
                        允许本次
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            api(`approvals/${a.id}`, "POST", {
                              approved: false,
                            }),
                          )
                        }
                      >
                        拒绝
                      </button>
                    </div>
                  </article>
                ))}
                <h3>审计记录</h3>
                <div className="audit">
                  {state.audit
                    .slice(-30)
                    .reverse()
                    .map((a) => (
                      <div key={a.id}>
                        <time>{new Date(a.at).toLocaleString("zh-CN")}</time>
                        <code>{a.action}</code>
                        <small>{a.subjectId.slice(0, 8)}</small>
                      </div>
                    ))}
                </div>
              </section>
            )}
            {view === "computer" && (
              <section className="content">
                <div className="section-intro">
                  <span className="pill">后续阶段 · 尚未实现</span>
                  <h2>一台共享电脑，多个独立会话。</h2>
                  <p>
                    当前 MVP
                    保存工作区、群聊和任务。它尚未创建虚拟机，也没有可远程操作的桌面。
                  </p>
                </div>
                <div className="two-col">
                  <article className="card">
                    <h3>目标架构</h3>
                    <p>
                      一个工作区拥有一台持久化 VM；所有 Bot
                      通过各自独立的浏览器或桌面会话访问授权共享目录。
                    </p>
                    <p>
                      下一阶段实现屏幕、文件锁、会话调度与人工接管，再连接云端
                      VM。
                    </p>
                    <div className="computer-diagram">
                      <span>Bot A / 会话 A</span>
                      <span>Bot B / 会话 B</span>
                      <b>共享持久化虚拟电脑（规划）</b>
                    </div>
                  </article>
                  <article className="card">
                    <h3>Muse Code 环境</h3>
                    <p>
                      使用官方 CLI 的现有授权。不会读取浏览器
                      Cookie，也不会将聊天订阅当作普通 API Key。
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => setMuse(await api("runtime/muse")))
                      }
                    >
                      检测 Muse CLI
                    </button>
                    {muse && (
                      <p role="status">
                        {muse.installed
                          ? `已安装：${muse.version}；登录状态需在官方 CLI 中确认。`
                          : "未检测到 Muse CLI，请按官方文档安装并登录。"}
                      </p>
                    )}
                    <a
                      href="https://dev.meta.ai/docs/muse-code"
                      target="_blank"
                      rel="noreferrer"
                    >
                      官方安装与授权文档 ↗
                    </a>
                  </article>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <dialog
        ref={groupDialog}
        aria-labelledby="group-dialog-title"
        onClose={() => setShowGroupForm(false)}
        onCancel={() => setShowGroupForm(false)}
      >
        <form
          className="group-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const g = await api<{ id: string }>("groups", "POST", {
                name: groupName,
                botIds: members,
              });
              selectGroup(g.id);
              setShowGroupForm(false);
              setGroupName("");
              setMembers([]);
            });
          }}
        >
          <div className="dialog-heading">
            <h2 id="group-dialog-title">新建协作群</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭新建群聊"
              onClick={() => setShowGroupForm(false)}
            >
              ×
            </button>
          </div>
          <label>
            群名称
            <input
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="软件开发团队"
            />
          </label>
          <fieldset>
            <legend>选择 Bot 成员</legend>
            {state?.bots.map((bot) => (
              <label className="check" key={bot.id}>
                <input
                  type="checkbox"
                  checked={members.includes(bot.id)}
                  onChange={(e) =>
                    setMembers(
                      e.target.checked
                        ? [...members, bot.id]
                        : members.filter((id) => id !== bot.id),
                    )
                  }
                />
                {bot.name}
              </label>
            ))}
          </fieldset>
          <button disabled={busy || !members.length}>创建群聊</button>
        </form>
      </dialog>
    </div>
  );
}
