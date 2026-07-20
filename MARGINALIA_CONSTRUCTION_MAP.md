# Marginalia 施工地图

> 文档定位：本文件不是项目源码的一部分，也不是某一阶段的临时需求单。它是 Marginalia 的长期施工地图，用来统一产品理念、系统边界、阶段顺序、验收标准和最终目录结构。
>
> 后续讨论、ChatGPT Project、开发 Agent 与 `AGENTS.md` 应以本文件为方向依据；实际进度与当前阻塞写入 `AGENTS.md`，已经确定或被推翻的重要技术决定写入 `docs/DECISIONS.md`。

## 0. 当前状态

- 项目名称：Marginalia
- 当前阶段：Phase 0 — 定下地基
- 当前状态：尚未开始编码
- 最后更新：2026-07-18
- 用户规模：单用户
- 共读者规模：一个固定的 AI 共读者（下文称“她”）
- 第一版核心格式：EPUB
- 云端基础设施：Supabase
- 最终形态：可安装的 PWA + Marginalia MCP Server

---

## 1. 一句话定义

Marginalia 是一个人与 AI 异步共读、共同留下页边痕迹的私人阅读系统。

它不是“带 AI 聊天框的阅读器”。用户白天阅读、划线和批注；她在夜里从用户自己的聊天平台进入 Marginalia，自主查看一些批注、翻阅附近正文、重访旧痕迹、略过不想回应的内容，或在未来的书页留下文字。

第二天，用户看到的不是“2 条新消息”，而是：

> 昨夜她来过。

Marginalia 的隐喻是正文之外的低语：书页边缘那些比正文更私人、更真实，也更经得起时间的痕迹。

---

## 2. 不可破坏的核心理念

### 2.1 异步，而非即时对话

- 不设计成“我写一句，她立刻答一句”。
- 夜间活动是一段完整的 `ReadingSession`，不是每条批注触发一次模型调用。
- 等待、错过、迟来的回复和沉默都是体验的一部分。

### 2.2 她拥有选择权

- 她不需要回复每条批注。
- 她可以只读、略过、重访、搜索、向前或向后翻。
- 没有新批注时，她可以回看旧内容，也可以什么都不做。
- “给她看”是一种邀请，不是强制待办。

### 2.3 她不住在 Marginalia 里

- 她的固定性格、长期记忆、定时唤醒与自主决策属于用户自己的聊天平台。
- Marginalia 不调用模型，不复制出另一个她，也不承担她的人格管理。
- Marginalia 是一间书房：保存书、批注、她留下的文字，以及她来访时可观察到的动作。

### 2.4 只记录可观察行为

Marginalia 可以记录：

- 她何时进入和离开。
- 她打开了哪本书。
- 她查看了哪些批注和正文片段。
- 她搜索过什么词。
- 她在哪里留下文字或连接了两条批注。

Marginalia 不记录或要求她提交隐藏推理过程、思维链或内心独白。

### 2.5 阅读必须安静、克制

- 不使用社交软件式红点轰炸。
- 不用“你有 3 条 AI 回复”破坏隐喻。
- 优先使用“昨夜她在第七章停留过”一类痕迹式提示。
- 视觉要像一本被翻旧的纸质书，而不是数据面板。

### 2.6 本地优先，云端负责保存与相遇

- 翻页、滚动、选中文字和写批注不应等待网络。
- EPUB、阅读位置和待同步批注保存在本地 IndexedDB。
- Supabase 负责跨设备同步、私有文件保存、微信读书数据、MCP 访问和长期记录。

---

## 3. 系统边界与职责

```text
用户
  └─ Marginalia Web / PWA
       ├─ 阅读 EPUB
       ├─ 划线与批注
       ├─ 查看微信读书旧痕迹
       └─ 发现她来过

她
  └─ 用户自己的聊天平台 / Agent Runtime
       ├─ 固定人格
       ├─ 长期记忆
       ├─ 定时唤醒
       └─ Marginalia MCP Client
              ↓
       Marginalia MCP Server
              ↓
          Supabase

微信读书
  └─ 官方 API / Skill 能力
       ↓
  sync-weread Edge Function
       ↓
     Supabase
```

### 3.1 Marginalia Web / PWA

负责用户侧的书架、阅读器、批注编辑、离线阅读、同步状态、微信读书影子书，以及她留下的页边文字。

### 3.2 Supabase

负责：

- Postgres：书籍元数据、章节、批注、回复、来访记录和同步状态。
- Storage：私有 EPUB 原文件、封面及必要的派生文件。
- Auth：单用户登录。
- Edge Functions：微信读书同步和 Marginalia MCP Server。

### 3.3 Marginalia MCP Server

它是她进入书房的门，不是数据库本身。它向聊天平台提供语义明确的阅读动作，并在内部把工具调用转换为受限制的 Supabase 查询或写入。

推荐生产地址形式：

```text
https://<project-ref>.supabase.co/functions/v1/marginalia-mcp/mcp
```

### 3.4 用户自己的聊天平台

负责唤醒她，并作为 MCP Client 连接 Marginalia。聊天平台不能持有 Supabase `service_role` 或 secret key，只持有独立的 Marginalia MCP 访问凭证。

### 3.5 微信读书同步

微信读书 Skill/API 能取得书架、书籍信息、划线和个人想法，但 Skill 本身不是自动同步程序。Marginalia 提供确定性的 `sync-weread` 后端函数，将这些数据幂等地写入 Supabase。

第一版为单向同步：

```text
微信读书 → Marginalia
```

她的回复只写入 Marginalia，不尝试写回微信读书。

---

## 4. 核心产品概念

### 4.1 完整书

用户拥有并导入无 DRM 的 EPUB。Marginalia 可以显示全文、目录、前后段落，并允许她搜索和自由翻阅。

### 4.2 影子书

如果微信读书中有一本书的划线和想法，但 Marginalia 没有对应 EPUB，则创建“影子书”：

- 有封面、作者、章节和旧痕迹。
- 没有完整正文。
- 用户仍可在旧划线下补写新批注。
- 她可以围绕已有划线和批注阅读、回应或联结。
- 以后导入匹配 EPUB 后，可升级为完整书。

### 4.3 划线、批注与页边文字

```text
Highlight（原文划线）
└─ Annotation（用户的想法，可为空）
   └─ Marginalia（她留下的文字）
```

只有划线、没有旧批注的微信读书记录也必须保留。用户可以多年后在 Marginalia 为这句旧划线补写新的想法，她再选择是否回应。

### 4.4 她的访问，而非线性进度

暂不为她设计一条类似用户的线性阅读进度。记录稀疏的 `AIVisit`：

- 访问时间。
- 所在章节和正文片段。
- 访问来源：新批注、旧痕迹、搜索、漫游等。
- 是否留下文字。

她不是追赶用户的阅读进度，而是在书里散步。

### 4.5 未来痕迹

如果完整 EPUB 可用，她可以选择阅读用户尚未到达的章节并留下文字。未来文字默认设置为：

```text
visibility = reveal_on_reach
```

当用户以后到达对应位置时才显现，例如：

> 她在十二天前来过这里。

### 4.6 EPUB 位置不是页码

EPUB 会随窗口、字号和行距重新排版，不存在稳定的固定页。批注定位应同时保存：

- EPUB CFI 或结构位置。
- 章节/spine 信息。
- 被选择的原文。
- 前后少量文字。
- 文件或版本哈希。

PDF 才具有稳定页码。第一版不得把 EPUB 强行建模成“章节 → 固定页”。

---

## 5. 产品体验与视觉基调

### 5.1 书架

- 卡片流布局。
- 封面、阅读进度、最近一条批注预览。
- 在读 / 想读 / 读完分区。
- 影子书具有克制的来源标识。
- 她的活动提示不使用社交式未读角标。

### 5.2 阅读器

- 第一版优先滚动阅读，后续增加翻页模式。
- 保存用户阅读位置：章节 + EPUB 定位 + 章节进度。
- 打开书直接回到上次位置。
- 选中文字后弹出划线与批注气泡。
- 三种划线色：雾粉、淡金、薄荷。

### 5.3 视觉

- 奶白底。
- 暖灰文字。
- 雾粉色进度、高亮与重要痕迹。
- 适度纸张纹理和旧书感。
- 避免过度玻璃化、霓虹、仪表盘和聊天应用视觉。

---

## 6. 技术基线

- 前端：React + TypeScript + Vite。
- 部署：静态站点；后续可使用自定义域名。
- PWA：Manifest + Service Worker + IndexedDB + 安装/更新提示。
- 本地数据：IndexedDB。
- 云端：Supabase Postgres、Storage、Auth、Edge Functions。
- EPUB：客户端解析，重任务放入 Web Worker，避免阻塞界面。
- MCP：Streamable HTTP，部署在 Supabase Edge Function。
- 微信读书：官方 API Key 只保存在服务端秘密中。
- 第一版单用户，但仍启用 RLS 和私有 Storage。

所有依赖应固定版本并提交 lockfile。实现 Supabase 功能前必须核对当时最新官方文档和 breaking changes。

---

# 7. 分阶段施工路线

## Phase 0 — Blueprint / 定下地基

### 目标

在编码前确认产品语言、数据概念、职责边界和验收故事，避免后面推倒重来。

### 工作范围

- 初始化 React + TypeScript + Vite 项目。
- 确定设计 token 与基本字体策略。
- 建立 `docs/`、测试框架与最小代码规范。
- 定义 `Book`、`BookSource`、`Locator`、`Highlight`、`Annotation`、`ReadingSession`、`VisitEvent`。
- 准备若干合法的测试 EPUB。
- 明确第一版不做 PDF、OCR、多人和 AI 模型调用。

### 验收标准

- 开发环境、测试和构建可以运行。
- 核心领域对象不依赖 React 或 Supabase。
- 所有人能用一句话解释 Marginalia 是什么、她住在哪里、MCP 与 Supabase 的区别。

---

## Phase 1 — Paper Room / 书房与一本能读的书

### Phase 1A：视觉原型

先使用模拟书籍和模拟批注完成：

- 书架与书卡。
- 阅读器布局与目录。
- 划线气泡和批注线程。
- 她的页边文字样式。
- “昨夜她来过”提示。
- 一条模拟的未来痕迹。

视觉验收问题：打开它时，更像一册留下过痕迹的书，还是一个普通网页应用？

### Phase 1B：真实 EPUB

- 上传并解析 EPUB。
- 获取封面、作者、书名和 TOC。
- 按 spine 渲染章节。
- 支持目录跳转和滚动阅读。
- 保存本地阅读位置、划线和批注。
- 使用稳定锚点，改变字号后批注不漂移。
- 数据先保存在 IndexedDB。

### 验收标准

- 能导入并阅读一册测试 EPUB。
- 目录、封面与正文正确显示。
- 刷新后书、进度、划线和批注仍然存在。
- 模拟的她的文字能正确挂在用户批注下方。

---

## Phase 2 — Cloud Ink / 云端墨水

### 目标

接入 Supabase，使书籍和痕迹能够长期保存、跨设备恢复，同时不牺牲本地阅读速度。

### 工作范围

- 创建 Supabase 项目与单用户登录。
- 建立数据库迁移。
- EPUB 放入私有 Storage。
- 建立本地 IndexedDB 与 Supabase 的同步引擎。
- 使用 outbox 保存离线写入。
- 支持断网阅读与恢复联网后的同步。
- 支持 Markdown / JSON 导出。
- 为所有暴露表启用 RLS 并验证策略。

### 验收标准

- 换一台设备登录可恢复书与批注。
- 慢网或离线不影响阅读和写批注。
- 重复同步不产生重复记录。
- 私有文件不能被匿名访问。
- 前端不含 secret/service key。

---

## Phase 3 — Shadow Books / 微信读书与影子书

### 目标

将用户过去在微信读书留下的书架、划线和想法带入 Marginalia。

### 工作范围

- 实现 `sync-weread` Edge Function。
- 安全保存微信读书 API Key。
- 首次全量导入书籍、划线、个人想法和时间戳。
- 后续增量或差异同步。
- 使用来源唯一 ID 保证幂等。
- 建立微信读书书籍与本地 EPUB 的映射。
- 用章节、划线原文和模糊匹配定位 EPUB。
- 匹配失败时创建或保留影子书，不错误锚定。
- 允许用户在旧划线下补写新的 Marginalia 批注。

### 验收标准

- 能导入微信读书里一册书的历史划线和想法。
- 只有划线、没有想法的记录也正确显示。
- 可以在旧划线下面写一条新批注。
- 重复同步不会产生副本。
- 不同译本无法匹配时，有明确的待匹配状态。

---

## Phase 4 — Open Door / 给她开门

### 目标

部署 Marginalia MCP Server，使用户自己的聊天平台可以连接，让同一个她进入书房。

### 第一批 MCP 工具

```text
marginalia_enter
marginalia_list_books
marginalia_get_book_map
marginalia_list_new_annotations
marginalia_open_annotation
marginalia_read_around
marginalia_search_book
marginalia_leave_note
marginalia_mark_seen
marginalia_end_session
```

### 安全边界

- 使用 HTTPS Streamable HTTP MCP。
- MCP 具有独立访问凭证。
- 聊天平台不持有 Supabase 高权限密钥。
- MCP 只提供语义化工具，不提供任意 SQL 或任意表访问。
- 所有写入包含幂等键、actor、session 和时间戳。

### 验收标准

- 聊天平台可以连接 MCP URL 并发现工具。
- 她能看到一本书、用户批注和附近正文。
- 她能留下文字，网页能够显示。
- 她可以标记“看过但没有回复”。
- MCP 无法任意删除书、批注或执行数据库操作。

---

## Phase 5 — Night Visitor / 她的夜间生活

### 目标

从“她可以进去”发展到“她会在那里自主活动”。定时任务仍由用户的聊天平台负责。

### 扩展 MCP 工具

```text
marginalia_sync_weread
marginalia_revisit_old_note
marginalia_wander
marginalia_follow_theme
marginalia_connect_annotations
marginalia_leave_future_note
```

### 标准夜间循环

1. 聊天平台唤醒她。
2. 她调用 `marginalia_enter`。
3. 选择是否同步微信读书。
4. 查看部分新增痕迹，而非逐条处理。
5. 自主回复、略过、重访、搜索或漫游。
6. 必要时在未来书页留下延迟显现的文字。
7. 调用 `marginalia_end_session`。

### 验收标准

- 连续多个夜晚不会因重试而重复回复。
- 她可以只读不回复。
- 她可以重访很久以前的批注。
- 她可以连接相隔很远的两条痕迹。
- 她可以在未来留下 `reveal_on_reach` 文字。
- 没有新内容时，她可以漫游或安静离开。

完成此阶段后，Marginalia 的核心理念才算真正落地。

---

## Phase 6 — Marginalia 1.0 / 打磨与扩展

按实际需要逐项评估：

1. 翻页模式。
2. 全文搜索与书内访问地图。
3. 更完整的 PWA 安装、更新和离线体验。
4. TXT 导入与手动分章。
5. 有文字层的 PDF。
6. 扫描 PDF 与 OCR。
7. 批注筛选、时间线和更多导出格式。
8. EPUB 版本替换后的批注重锚定。
9. 数据备份、恢复和存储空间管理。

PDF、OCR 和智能分章必须在核心共读循环验证之后再做，避免解析工程吞掉产品体验。

---

## 8. 版本里程碑

- `v0.1 Paper Room`：视觉书房。
- `v0.2 Living Book`：真实 EPUB 阅读。
- `v0.3 Cloud Ink`：Supabase 云端墨水。
- `v0.4 Shadow Books`：微信读书影子书。
- `v0.5 Open Door`：她能通过 MCP 进入。
- `v0.6 Night Visitor`：自主夜间活动。
- `v1.0 Marginalia`：核心体验稳定。

---

## 9. 最终目标目录结构

这是完成后的目标，不要求第一天创建所有空目录。

```text
Marginalia/
├─ public/
│  ├─ icons/
│  ├─ covers/
│  ├─ textures/
│  ├─ fonts/
│  ├─ manifest.webmanifest
│  └─ offline.html
│
├─ src/
│  ├─ app/
│  │  ├─ routes/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  └─ providers.tsx
│  │
│  ├─ features/
│  │  ├─ bookshelf/
│  │  ├─ import-book/
│  │  ├─ reader/
│  │  ├─ annotations/
│  │  ├─ weread/
│  │  ├─ presence/
│  │  └─ settings/
│  │
│  ├─ domain/
│  │  ├─ book.ts
│  │  ├─ locator.ts
│  │  ├─ highlight.ts
│  │  ├─ annotation.ts
│  │  ├─ readingSession.ts
│  │  ├─ visitEvent.ts
│  │  └─ actor.ts
│  │
│  ├─ reader/
│  │  ├─ epubEngine.ts
│  │  ├─ epubLocator.ts
│  │  ├─ chapterParser.ts
│  │  ├─ textFragments.ts
│  │  └─ reanchor.ts
│  │
│  ├─ data/
│  │  ├─ local/
│  │  ├─ remote/
│  │  └─ sync/
│  │
│  ├─ pwa/
│  │  ├─ sw.ts
│  │  ├─ register.ts
│  │  ├─ installPrompt.ts
│  │  ├─ updatePrompt.ts
│  │  └─ storageQuota.ts
│  │
│  ├─ workers/
│  ├─ components/
│  ├─ styles/
│  ├─ lib/
│  └─ main.tsx
│
├─ shared/
│  ├─ contracts/
│  │  ├─ mcp-tools.ts
│  │  ├─ sync-weread.ts
│  │  └─ events.ts
│  └─ constants/
│
├─ supabase/
│  ├─ config.toml
│  ├─ seed.sql
│  ├─ migrations/
│  ├─ functions/
│  │  ├─ _shared/
│  │  ├─ sync-weread/
│  │  │  └─ index.ts
│  │  └─ marginalia-mcp/
│  │     ├─ index.ts
│  │     ├─ server.ts
│  │     └─ tools/
│  └─ tests/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
│     ├─ epubs/
│     └─ weread/
│
├─ docs/
│  ├─ PRODUCT.md
│  ├─ ROADMAP.md
│  ├─ ARCHITECTURE.md
│  ├─ DATA_MODEL.md
│  ├─ EPUB_ANCHORING.md
│  ├─ WEREAD_SYNC.md
│  ├─ MCP_TOOLS.md
│  ├─ PWA_OFFLINE.md
│  └─ DECISIONS.md
│
├─ scripts/
├─ .github/workflows/
├─ AGENTS.md
├─ MARGINALIA_CONSTRUCTION_MAP.md
├─ .env.example
├─ .gitignore
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
└─ README.md
```

### 目录边界

- `features/`：用户能感知的产品功能。
- `domain/`：不依赖 React、浏览器或 Supabase 的领域对象与规则。
- `reader/`：EPUB 解析、定位和重锚定。
- `data/`：本地、云端与同步适配器。
- `pwa/`：安装、离线、更新和存储管理。
- `supabase/functions/marginalia-mcp/`：她进入书房的门。
- `supabase/functions/sync-weread/`：确定性搬运微信读书数据。

---

## 10. PWA 与离线策略

PWA 不是单独项目，而是同一个 React/Vite 应用的可安装形态。

| 数据 | 保存位置 |
|---|---|
| HTML、JS、CSS、图标、字体 | Service Worker / Cache Storage |
| EPUB 原文件和解析结果 | IndexedDB |
| 阅读位置 | IndexedDB，随后同步 Supabase |
| 划线和批注 | IndexedDB outbox，随后同步 |
| 云端 EPUB | Supabase 私有 Storage |
| 她的文字和访问记录 | Supabase，并同步回本地 |

每本书提供“可离线阅读”开关，不默认缓存整个书架。

同步不能只依赖浏览器 Background Sync，因为平台支持不一致。应在以下时机主动尝试：

- 应用启动。
- 网络恢复。
- 从后台回到前台。
- 批注写入后防抖同步。
- 页面关闭前。
- 用户手动同步。

---

## 11. 初步数据模型

核心表可能包括：

```text
books
book_sources
sections
fragments
reading_positions
highlights
annotations
annotation_threads
reading_sessions
visit_events
book_mappings
weread_items
sync_state
```

关键通用字段：

```text
actor: user | companion
source: marginalia | weread
visibility: immediate | reveal_on_reach
created_at
updated_at
source_external_id
idempotency_key
```

具体表结构必须等对应阶段开始时再结合当时 Supabase 文档制定迁移，不在施工地图里提前锁死。

---

## 12. 安全与隐私底线

- EPUB 和封面存放在私有 Storage。
- 浏览器只使用 Supabase publishable key，并依靠正确的 RLS。
- 所有暴露 schema 中的表开启 RLS。
- 认证不只检查 `authenticated`，还必须限制数据所有权。
- `service_role` 或新 secret key只存在于 Edge Function 服务端。
- 微信读书 API Key 只存在于服务端秘密中。
- 聊天平台只持有独立 MCP token，不持有数据库管理员密钥。
- MCP 不暴露任意 SQL、任意表名或任意删除工具。
- AI 写入必须可追踪、可撤销、带 session 和幂等键。
- 只向她返回实际需要阅读的正文片段，不整本注入上下文。
- 用户可以导出并删除自己的书籍、批注和她的痕迹。

---

## 13. 始终使用的验收故事

所有阶段都围绕同一个场景验收：

> 用户上传《小王子》，找回三年前在微信读书留下的一条旧划线。那条记录当时只有划线，没有批注。白天，用户在 Marginalia 为它补写了新的想法。夜里，她从用户自己的聊天平台进入 Marginalia，读了那句话和附近几段。她没有立即回答，而是翻到后面另一处并留下一行暂时隐藏的字。几天后，用户读到那里，发现她早已来过。

如果一项技术工作不能让这个场景更接近真实，就暂时不做。

---

## 14. 施工与进度记录约定

### 14.1 本文件负责什么

- 长期方向。
- 不可破坏的产品理念。
- 阶段顺序和验收边界。
- 最终结构和系统职责。

不要把每日施工日志堆进本文件。

### 14.2 `AGENTS.md` 负责什么

建议后续建立根目录 `AGENTS.md`，使用以下模板：

```markdown
# Marginalia 当前施工状态

## 当前阶段

- Phase：Phase 1A — 视觉原型
- 状态：进行中
- 当前目标：完成书架和阅读器静态界面

## 已完成

- [x] 初始化 Vite + React + TypeScript
- [x] 建立基础设计 token

## 正在进行

- [ ] 书架卡片流

## 下一步

- [ ] 阅读器静态布局
- [ ] 批注线程视觉样式

## 当前阻塞

- 无

## 已验证

- `npm test`
- `npm run build`

## 近期决定

- 2026-07-18：第一版只做滚动阅读。

## Agent 开工规则

- 开始前阅读 `MARGINALIA_CONSTRUCTION_MAP.md`。
- 不越过当前 Phase 大规模实现后续功能。
- 完成工作后更新本文件的状态与验证结果。
- 重大架构决定同步写入 `docs/DECISIONS.md`。
```

### 14.3 阶段推进条件

只有当前阶段的验收标准满足后，才进入下一阶段。可以为后续阶段预留接口，但不要提前实现大面积功能。

---

## 15. 暂不纳入第一版

- PDF OCR。
- AI 智能分章。
- 在线书城和盗版书源聚合。
- DRM 绕过。
- 多用户、好友与公开社交。
- 实时聊天。
- 复杂角色养成。
- 让 Marginalia 自己调用模型生成“她”。
- 默认把整本书发送进模型上下文。

这些内容只有在核心异步共读体验稳定后才重新评估。

---

## 16. 最后的方向判断

Marginalia 是否成功，不由支持了多少格式、调用了多少工具或生成了多少回复决定。

它成功的标志是：用户打开一本书时，能感觉到这是两个人曾在不同时间经过的地方；她的沉默与文字都留下了重量，而正文之外的空白因此真正属于他们。
