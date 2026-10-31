# Hybrid Agent Studio

开源、本地优先的多 Bot 协作工作台。**Phase 1 / v0.1.0-alpha.1** · Apache-2.0

创建不同角色的 Bot，把它们加入同一个群，通过 @提及分工，再把任务及成果交给下一位 Bot。Web 与 Electron 使用相同的本地服务和运行时接口。

## 快速开始

需要 **Node.js 22.12+ 或 24 LTS**、pnpm 10.32.1。建议 Node.js 24。

```sh
git clone https://github.com/nyboy2022/hybrid-agent-studio.git
cd hybrid-agent-studio
npm install --global pnpm@10.32.1
pnpm install --frozen-lockfile
pnpm dev
```

打开 **http://127.0.0.1:3000**（请使用这个地址，localhost 是不同的 Origin）。开发启动器同时运行 Next.js 与 Fastify，自动生成仅保存在进程环境中的 API 令牌。直接启动某一个子应用不能替代根目录启动器。

首次使用：

1. 在「我的 Bots」创建「程序员」与「测试员」，使用明确标注的演示模型，无需密钥。
2. 在「团队群聊」新建群，选中两个成员。
3. 发送 `@程序员 请分析项目需求`。无 @ 时由群成员列表中的第一位 Bot 响应。
4. 在已完成任务上点击「交接任务」，选择测试员并填写审查要求。下一任务收到前一步的成果。
5. 将 Bot 切换到 Muse Code 时，先完成官方 CLI 安装及授权，每次任务到「安全审批」中允许或拒绝。

演示模型是确定性测试运行时，**没有真实推理和电脑操作能力**。它不会自动规划复杂项目。真实模型可返回结构化分工，调度器会校验成员并创建交接任务。

## 界面与头像

主界面采用简洁的深色聊天布局：左侧选择 Bot 或群聊，任务面板和成员列表按需打开，新建群聊使用弹窗。点击 Bot 可直接开始单独聊天，自动复用该 Bot 的已有单人会话。

在「管理 Bots」创建或编辑 Bot 时，展开「自定义头像」：支持文字、Emoji、PNG/JPG/WebP 图片和动态 GIF；可自选背景/文字颜色、连续圆角、图片适配方式、缩放及水平/垂直位置，并实时预览。可以恢复默认头像。头像在侧栏、消息、成员列表和管理卡片中统一显示，保存后本地持久化。

静态图最大 10MB，超过 512KB 时浏览器自动优化到最长边 512 像素；GIF 保留原动画，最大 512KB。上传内容存放在工作区 `avatars/`，通过受保护的本地 API 读取。原图不会交给模型，也不上传外部图床；已上传但取消使用的文件目前不会自动清理。

## 生产模式与 Mac 桌面开发版

```sh
pnpm build
pnpm start             # Web: http://127.0.0.1:3000

# 另一次启动可使用桌面入口：
pnpm setup:desktop     # 从 Electron 官方发布源下载运行程序
pnpm desktop           # 使用 3470/4470 端口启动独立本地服务
```

Electron 45 不再依靠包安装后的自动脚本下载运行程序，因此首次需要显式执行 `setup:desktop`。当前交付可从源码运行的桌面开发版，尚无签名的 DMG / EXE 安装包。Mac 已做实际启动测试，Windows 尚未验证。

Web 默认数据在仓库的 `.data/`。桌面默认使用 Electron userData 下的 `workspace/`，因此与 Web 默认数据分开；可通过 `HYBRID_DATA_DIR` 指向同一数据目录，但**同一目录只能由一个 API 进程打开**。不要同时启动两个实例访问同一目录。

## Muse 官方接入

采用 Meta 发布的 [`@muse-code/sdk`](https://github.com/meta-models/muse-code-sdk) **1.4.14**，通过官方 `muse serve` 协议驱动会话；建议配套同版本 CLI。按[官方安装文档](https://dev.meta.ai/docs/muse-code)安装 `muse`，在终端运行 `muse` 完成官方登录。可用 `MUSE_BIN` 指定二进制绝对路径。

- 默认模型名为官方文档中的 `muse-spark-1.2`，可在 Bot 配置中修改。
- 只请求 `:read-only` 权限配置，并使用 SDK 的 `requirePermissionProfile: true` 验证已应用；不支持该配置的宿主直接失败，绝不回退到宽松配置。
- 使用 `denyUnmatched`，对额外权限请求只选择宿主提供的拒绝项；界面中的「允许本次」仅批准数据发送和只读任务，不会开启写文件或任意 Shell 权限。
- 使用官方 CLI 自己管理的凭证，不抓取浏览器 Cookie。`META_API_KEY` 与浏览器授权的优先级、计费规则以[官方说明](https://dev.meta.ai/docs/muse-code/auth)为准；不承诺任意消费者订阅都可调用。
- 工作区诊断只检测安装与版本，不会把检测成功当作已登录。

当前开发环境未安装或授权 Muse CLI。适配器已通过 TypeScript 与模拟 SDK 契约测试，**真实模型会话尚未验收**。在你自己的已授权环境中可运行：

```sh
pnpm test:muse:live
```

这会发送一条真实只读请求，可能按你的官方账户规则计费；缺少 CLI 或授权时命令失败，不会跳过后报告成功。

## 当前能力与边界

已实现 Bot 创建/编辑/删除、多个群、@成员路由、消息增量刷新、本地历史持久化、任务状态、人工交接与模型结构化交接、逐次 Muse 审批和审计记录。每个任务拥有独立逻辑会话 ID，Muse 每次执行创建独立原生会话；不恢复进行中的原生会话。重启会明确标记中断任务失败并撤销待处理审批。

统一运行时区分模型类型与执行位置。当前只实现 Local 的演示与 Muse 两种运行时；Cloud 会明确拒绝执行。调度器串行运行任务，每条交接链最多 8 个任务、深度最多 3、每次模型输出最多 3 个交接对象，并阻止相同 Bot/标题的重复交接。完整消息历史保存在本地，模型上下文只取最近 20 条群消息及直接父任务成果。

**真实共享虚拟电脑尚未实施。** 目标是一工作区、一台持久化虚拟电脑、多个 Bot 独立桌面/浏览器操作会话和授权共享目录。当前 `.data/shared/` 只是本地 Muse 的只读工作目录，既不是 VM，也不是屏幕或浏览器隔离实现。

后续：真实本地共享 VM、每 Bot 独立屏幕、文件与浏览器资源锁、人工接管；再实现持久化云 VM、远程屏幕和混合迁移。OAuth、多提供商、记忆、定时任务、并行执行及安装包见 [路线图](docs/ROADMAP.md)。

## 开发与测试

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm setup:desktop
pnpm test:desktop
```

CI 在 Linux 与 macOS 上运行类型检查、单元/API 测试、生产构建和浏览器 E2E；macOS 额外验证 Electron。不会在 CI 中使用真实模型凭证。详情见 [架构](docs/ARCHITECTURE.md)、[第一阶段验收](docs/PHASE1.md)和 [安全边界](SECURITY.md)。

## 目录

```text
apps/web       Next.js + React 控制台与受限 API 代理
apps/desktop   Electron 源码运行入口
apps/api       Fastify 本地控制服务 / Phase 1 Local Runner
packages/core  数据、Bot、群聊、任务、审批和调度
packages/runtime 统一运行时、演示模型、Muse 官方 SDK 适配器
scripts        启动器和真实 Muse 验证入口
tests          核心/API、浏览器和桌面测试
```

Apache-2.0 适用于本项目；Muse CLI、模型和第三方依赖遵循各自许可。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
