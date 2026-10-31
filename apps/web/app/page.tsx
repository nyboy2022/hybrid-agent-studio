"use client";
import { useCallback, useEffect, useState } from "react";
import type { Bot, WorkspaceState, Task } from "@hybrid/core";

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
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BotDraft>(freshBot);
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
        <a className="brand" href="/">
          <span className="brand-icon">H</span>
          <span>
            HYBRID<span className="brand-sub">AGENT STUDIO</span>
          </span>
        </a>
        <div className="workspace-label">
          个人工作区 <span className="live-dot" />
        </div>
        <nav aria-label="主导航">
          <button
            className={view === "chat" ? "active" : ""}
            onClick={() => setView("chat")}
          >
            ◈ <span>团队群聊</span>
            <small>{state?.groups.length || 0}</small>
          </button>
          <button
            className={view === "bots" ? "active" : ""}
            onClick={() => setView("bots")}
          >
            ◉ <span>我的 Bots</span>
            <small>{state?.bots.length || 0}</small>
          </button>
          <button
            className={view === "approvals" ? "active" : ""}
            onClick={() => setView("approvals")}
          >
            ◇ <span>安全审批</span>
            <small>{approvals.length}</small>
          </button>
          <button
            className={view === "computer" ? "active" : ""}
            onClick={() => setView("computer")}
          >
            ▣ <span>共享电脑</span>
            <small>规划</small>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="pill">LOCAL FIRST</span>
          <p>你的模型，你的工作区。</p>
          <small>v0.1.0-alpha.1 · Apache-2.0</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">WORKSPACE / {view.toUpperCase()}</span>
            <h1>
              {
                {
                  chat: "团队群聊",
                  bots: "我的 Bots",
                  approvals: "安全审批",
                  computer: "共享电脑",
                }[view]
              }
            </h1>
          </div>
          <div className="status">
            <span className="live-dot" /> 本地运行{" "}
            <span className="muted">/ Phase 01</span>
          </div>
        </header>
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
                  <h2>为每一项工作，找到合适的搭档。</h2>
                  <p>
                    每个 Bot
                    有自己的角色、模型和操作会话；当前支持本地只读运行。
                  </p>
                </div>
                <div className="two-col">
                  <div className="bot-grid">
                    {state.bots.map((bot) => (
                      <article className="card" key={bot.id}>
                        <div className="card-top">
                          <div className="avatar">{bot.name.slice(0, 1)}</div>
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
                <aside className="group-panel">
                  <h2>
                    协作群 <span>{state.groups.length}</span>
                  </h2>
                  {state.groups.map((g) => (
                    <button
                      key={g.id}
                      className={`group-button ${g.id === groupId ? "selected" : ""}`}
                      onClick={() => setGroupId(g.id)}
                    >
                      <strong># {g.name}</strong>
                      <small>{g.botIds.length} 位 Bot 成员</small>
                    </button>
                  ))}
                  <form
                    className="group-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        const g = await api<{ id: string }>("groups", "POST", {
                          name: groupName,
                          botIds: members,
                        });
                        setGroupId(g.id);
                        setGroupName("");
                        setMembers([]);
                      });
                    }}
                  >
                    <h3>新建协作群</h3>
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
                      {state.bots.map((bot) => (
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
                </aside>
                <section className="conversation">
                  {group ? (
                    <>
                      <div className="conversation-head">
                        <h2># {group.name}</h2>
                        <p>{group.botIds.map(botName).join(" · ")}</p>
                      </div>
                      <div className="messages" aria-live="polite">
                        {state.messages
                          .filter((m) => m.groupId === groupId)
                          .map((m) => (
                            <article
                              className={`message ${m.senderId === "system" ? "system" : ""}`}
                              key={m.id}
                            >
                              <div className="avatar small">
                                {botName(m.senderId).slice(0, 1)}
                              </div>
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
                          placeholder="@程序员 帮我分析这个项目…"
                        />
                        <div className="composer-bottom">
                          <small>@ 指定成员 · Muse 调用需逐次审批</small>
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
                <aside className="task-panel">
                  <h2>任务与交接</h2>
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
                                  group?.botIds.find((b) => b !== task.botId) ||
                                  task.botId,
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
                          await api(`tasks/${handoff.taskId}/handoff`, "POST", {
                            botId: handoff.botId,
                            title: handoff.title,
                          });
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
    </div>
  );
}
