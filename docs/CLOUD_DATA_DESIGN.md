# Phase 2 云端数据与同步设计

> 状态：已确认的实现设计。
>
> 产品语义以 `SYNC_SEMANTICS.md` 为准。本文负责把它翻译成 Supabase 表、私有文件、浏览器本地待寄清单和增量同步边界。实现时仍需按当日官方文档复核具体 API 与 CLI 命令。
>
> 官方资料核对：2026-09-05。托管项目继续依赖 RLS 隔离本人数据；因新建表已不再默认暴露给 Data API，迁移同时显式授予所需表与 RPC 的 `authenticated` 权限，并保持 `anon` 无权访问业务数据。

## 1. 架构结论

```text
React 阅读界面
  ↕ 只读写本地接口
IndexedDB
  ├─ 书、章节、进度、折页、划线、批注、她的文字
  ├─ outbox（待寄出的清单）
  └─ syncState（上次收到云端第几号变化）
          ↕ 自动双向同步
Supabase
  ├─ Auth：确认是小狐狸本人
  ├─ Postgres：书房元数据、痕迹、位置与变化序号
  ├─ Private Storage：EPUB 与封面
  └─ Realtime：只提醒浏览器“云端有新变化”
          ↕ Phase 4
Marginalia MCP Server
```

阅读界面不得直接以 Supabase 查询结果作为状态，也不得等网络成功后才显示本地操作。

## 2. 身份与稳定 ID

- Supabase Auth 用户 ID 使用 `uuid`，只用于数据所有权。
- 书、章节、划线、批注和页边文字沿用浏览器创建的稳定字符串 ID，远端列使用 `text`，不强迫现有本地 ID 改成数据库 UUID。
- 每条记录都包含 `owner_id uuid`，外键指向 `auth.users(id)`。
- 每次待寄操作另有 `operation_id` / `idempotency_key`，重复发送不会重复创建记录。
- 所有业务时间保存 ISO 对应的 `timestamptz`；冲突比较实际动作时间，不比较网络抵达时间。

## 3. Phase 2 远端表

### `profiles`

每个账号一行，保存名帖。

| 字段 | 用途 |
|---|---|
| `owner_id uuid primary key` | 小狐狸账号 |
| `user_name text` | 小狐狸落款 |
| `companion_name text` | 共读者名字 |
| `companion_subject text` | 她／他／它等人称 |
| `updated_at timestamptz` | 最近修改时间 |

### `books`

| 字段 | 用途 |
|---|---|
| `id text primary key` | 浏览器创建的稳定书籍 ID |
| `owner_id uuid` | 数据所有者 |
| `title / english_title / author / language / description` | 书籍小房间信息 |
| `source text` | `marginalia`，未来可为 `weread` |
| `status text` | `wish / reading / finished` |
| `cover_tone text` | 内部封面颜色 |
| `epub_path text` | 私有 Storage 对象路径 |
| `cover_path text` | 可选私有封面对象路径 |
| `content_hash text` | EPUB 版本识别与重锚定依据 |
| `added_at / last_opened_at / pinned_at / updated_at` | 排序与冲突依据 |
| `deleted_at timestamptz null` | 删除墓碑；有值时视为已移出 |

不把 `data:` 封面字符串直接存入 Postgres；自定义或书内封面转成私有 Storage 文件。

### `book_sections`

按 EPUB spine 一章一行，供跨设备恢复和未来 MCP 阅读。

| 字段 | 用途 |
|---|---|
| `id text primary key` | 稳定章节 ID |
| `owner_id uuid / book_id text` | 所属账号与书籍 |
| `spine_index integer` | 章节顺序 |
| `title / href text` | 目录与 EPUB 内路径 |
| `content_html text` | 阅读器恢复所需的章节 XHTML |
| `content_text text` | 未来 MCP 附近阅读／搜索所需的纯文本 |
| `content_hash text` | 章节版本校验 |
| `updated_at / deleted_at` | 同步与删除 |

`unique (book_id, spine_index)`；`book_id`、`owner_id` 与顺序字段建立索引。全文搜索索引留到 Phase 4 真正实现 `search_book` 时再增加。

### `reading_positions`

每本书每个账号一行，只保存自动“最近停留”。

| 字段 | 用途 |
|---|---|
| `book_id text primary key` | 一本书唯一自动位置 |
| `owner_id uuid` | 所有者 |
| `locator jsonb` | Marginalia 内部稳定定位 |
| `chapter_progress / total_progress integer` | 展示进度 |
| `read_at timestamptz` | 最近一次真实阅读动作 |
| `updated_at timestamptz` | 记录写入时间 |

冲突比较 `read_at`。目录、痕迹和临时章节跳转不产生新的 `read_at`。

### `bookmarks`

折页独立于自动阅读位置，每本书最多一行。

| 字段 | 用途 |
|---|---|
| `book_id text primary key` | 一本书唯一折页 |
| `owner_id uuid` | 所有者 |
| `locator jsonb` | 折页位置 |
| `moved_at timestamptz` | 实际移动时间 |
| `deleted_at timestamptz null` | 取消折页也需要传播 |

冲突比较 `moved_at`。

### `highlights`

| 字段 | 用途 |
|---|---|
| `id text primary key` | 现有稳定划线 ID |
| `owner_id / book_id` | 所有者与书籍 |
| `locator jsonb` | 稳定原文位置 |
| `color text` | `rose / gold / mint` |
| `created_at / updated_at / deleted_at` | 同步与删除 |

### `annotations`

| 字段 | 用途 |
|---|---|
| `id text primary key` | 一条小狐狸批注 |
| `owner_id / book_id` | 所有者与书籍 |
| `highlight_id text null` | 可选关联划线 |
| `locator jsonb` | 稳定原文位置 |
| `text text` | 批注正文 |
| `actor text` | Phase 2 固定为 `user` |
| `created_at / updated_at / deleted_at` | 修订、排序与删除 |

### `marginalia`

允许同一批注在不同来访中拥有多条小鱼文字。

| 字段 | 用途 |
|---|---|
| `id text primary key` | 一条页边文字 |
| `owner_id / book_id` | 所有者与书籍 |
| `annotation_id text null` | 回应某条用户批注 |
| `highlight_id text null` | 未来可直接依附划线 |
| `locator jsonb` | 文字所在位置 |
| `text text` | 小鱼留下的内容 |
| `actor text` | 固定为 `companion` |
| `visibility text` | `immediate / reveal_on_reach` |
| `session_id text null` | Phase 4 来访会话 |
| `idempotency_key text` | MCP 或文件导入防重复 |
| `created_at / updated_at / deleted_at` | 时间与删除 |

`unique (owner_id, idempotency_key)`；允许 `session_id` 暂时为空，使 Phase 2 文件导入和 Phase 4 MCP 共用同一数据形状。

### `sync_changes`

只负责告诉设备“云端第几号变化涉及什么”，不是另一份业务数据库。

| 字段 | 用途 |
|---|---|
| `change_id bigint identity primary key` | 单调递增游标 |
| `owner_id uuid` | 只让本人看到自己的变化 |
| `entity_type text` | `book / section / annotation` 等 |
| `entity_id text` | 变化记录 ID |
| `operation text` | `upsert / delete` |
| `changed_at timestamptz` | 服务端记录变化的时间 |

业务表 INSERT／UPDATE 后由数据库触发器追加一行。浏览器保存最后处理的 `change_id`，下次拉取所有更大的变化，再按实体类型取得最新行。删除实体仍保留 `deleted_at`，所以即使错过 Realtime 也能补齐。

Phase 2 单用户数据量很小，先使用这一条统一变化流；不为每张表设计不同同步协议。

## 4. 本地 IndexedDB 增量

现有业务 store 保留，数据库升级时新增：

### `outbox`

| 字段 | 用途 |
|---|---|
| `operationId` | 本地唯一待寄操作 ID |
| `entityType / entityId` | 哪类数据、哪一条 |
| `operation` | `upsert / delete / upload_file` |
| `payload` | 发送所需的领域数据快照或文件引用 |
| `occurredAt` | 实际本地动作时间 |
| `attempts / lastError` | 重试状态 |
| `createdAt` | 进入待寄清单时间 |

业务记录与 outbox 必须在同一 IndexedDB transaction 写入。远端明确确认成功后才删除 outbox 项。

同一实体连续变化可以在发送前合并，例如连续翻页只保留最新阅读位置；批注新增后又修订则只寄最新内容。已经发出的 operation ID 永远不复用。

### `syncState`

每个云端账号保存：

- `lastPulledChangeId`：最后成功处理的云端变化序号。
- `lastSuccessfulSyncAt`：云端书房状态文案。
- `remoteUserId`：防止一个浏览器账号切换后串数据。
- `initialSyncCompletedAt`：区分首次合并与普通增量同步。

本地排版设置继续留在现有 `localStorage`，不进入 outbox。

## 5. 推送与拉取算法

### 推送

1. 从 outbox 取一小批最早待寄操作。
2. 携带稳定实体 ID、实际动作时间和幂等键写入远端。
3. 远端按所有权与时间规则 upsert；旧操作不得覆盖更新记录。
4. 得到明确成功确认后，从 outbox 删除对应项。
5. 失败保留并采用有限退避重试；新本地写入仍然正常。

EPUB／封面上传走独立 `upload_file` 操作。元数据和批注不等待大文件上传完成；`books.epub_path` 只在上传成功后填写。

### 拉取

1. 读取本地 `lastPulledChangeId`。
2. 查询 `sync_changes where change_id > cursor order by change_id limit N`。
3. 按类型批量获取对应业务行。
4. 将远端行与本地未寄内容合并；不能覆盖更新的本地动作。
5. 在同一本地 transaction 中写业务数据并推进游标。
6. 重复直到没有更多变化。

Realtime 仅在网页打开时触发一次上述拉取。断线、休眠或错过事件不会丢数据。

## 6. 首次连接、日常同步与恢复

### 现有本地书房第一次连接空云端

- 识别云端没有该账号数据。
- 为现有本地书、文件和痕迹生成初始 outbox。
- 逐步上传；本地始终可读。
- 全部确认后显示“墨迹已收好”。

### 云端和本地都有内容

- 先拉取云端变化，再按稳定 ID 合并。
- 不同 ID 的书和痕迹全部保留。
- 同 ID 使用正式冲突规则。
- 有待寄内容时禁止执行覆盖式恢复。

### 新设备

- 登录后完整拉取元数据与痕迹。
- 按需或在用户打开书时下载私有 EPUB；为了满足 Phase 2 “换设备可恢复”，云端书房也提供明确的整本下载状态。
- EPUB 下载后由客户端重新解析并核对 `content_hash`。

### 从云端恢复

这是明确确认的灾难恢复动作。先检查并处理本地 outbox，再重建 IndexedDB；不与日常增量拉取共用按钮。

## 7. 冲突规则

| 数据 | 第一版规则 |
|---|---|
| 不同 ID 的新增书／批注／文字 | 全部保留 |
| 同一批注修订 | `updated_at` 更晚者 |
| 同一折页移动／取消 | `moved_at` 更晚者 |
| 最近停留 | `read_at` 更晚者 |
| 书籍元数据、置顶、最近打开 | 对应实际动作时间更晚者 |
| 删除与删除前旧修改 | 删除优先，旧设备不得复活 |
| 删除发生后真正新建 | 必须使用新 ID，不复用已删除 ID |

服务器时间只用于变化游标和审计，不替代客户端实际动作时间。对明显异常的未来时间需拒绝或钳制，具体容差在同步实现测试中固定。

## 8. RLS 与访问边界

所有 Data API 可访问表都：

- 显式启用 RLS。
- 不授予 `anon` 业务表权限。
- 只向 `authenticated` 授予必要的 SELECT／INSERT／UPDATE；真实需要删除时仍优先写 `deleted_at`。
- SELECT：`(select auth.uid()) = owner_id`。
- INSERT：`with check ((select auth.uid()) = owner_id)`。
- UPDATE：同时使用同一所有权条件的 `using` 与 `with check`，防止改写 `owner_id`。
- `owner_id` 建索引，保持 RLS 查询便宜。

不使用用户可修改的 `user_metadata` 做授权。前端只持有 Supabase URL 与 publishable key，不包含 secret／service-role key。

Phase 4 MCP Edge Function 可以在服务端持有高权限密钥，但每个工具必须先把独立 MCP token 映射到唯一 `owner_id`，查询和写入都显式带该所有者条件；不能因为 service role 绕过 RLS 就省略应用层所有权检查。

## 9. 私有 Storage

创建一个私有 bucket，例如 `library`，限制允许的文件类型和合理大小。

```text
<owner_id>/books/<book_id>/book.epub
<owner_id>/books/<book_id>/cover.<ext>
```

Storage RLS 同时检查：

- bucket 是 `library`。
- 路径第一段等于当前 `auth.uid()`。
- 对象所有权属于当前账号。

若使用 upsert，策略必须同时允许 INSERT、SELECT 与 UPDATE；删除也需要独立策略。文件增删只通过 Storage API，不直接修改 `storage` schema 表。

## 10. Realtime 选择

Phase 2 单用户、低频变化，先订阅 `sync_changes` 的 Postgres Changes 足够简单。收到事件后不直接相信事件 payload 更新界面，只调用增量拉取。

未来若并发规模或安全需求变化，可切换到官方更推荐的 private Broadcast；同步游标不变，所以正确性不依赖 Realtime 实现。

## 11. 云端书房状态

同步引擎向界面只暴露少量状态：

```text
local_only
syncing
synced
offline_with_pending
error_with_local_safe
restoring
```

产品文案沿用：

- 书房只留在这台设备
- 正在收好书页…
- 墨迹已收好 · 刚刚
- 还有 N 道墨迹未干
- 暂时收不到云端，本地文字仍在
- 昨夜带回 N 道文字

## 12. 实施顺序

### A. 不连接云端的本地同步地基

1. 升级 IndexedDB，加入 outbox 与 syncState。
2. 定义与 Supabase 无关的 sync operation 类型、合并规则和状态机。
3. 让书籍、批注、折页、位置等本地写入原子地产生 outbox。
4. 用纯内存 fake remote 验证离线、重试、重复发送、两设备合并和删除不复活。

### B. 连接 Supabase 项目

1. 创建／连接真实项目并确认区域。
2. 安装并固定官方客户端版本。
3. 使用 Supabase CLI 正式创建本地项目结构；迁移文件通过 CLI 生成。
4. 建表、约束、索引、触发器、RLS、GRANT 与私有 bucket 策略。
5. 用测试账号验证所有权隔离、匿名拒绝和文件不可公开读取。

### C. 接远端适配器

1. 实现 push、pull、文件上传／下载与首次合并。
2. 接应用启动、网络恢复、回到前台和写入防抖。
3. 接 Realtime 变化提示。
4. 在云端书房显示状态与手动“立即收好”。

### D. Phase 2 验收

1. 在线快速双向同步。
2. 离线写入后恢复网络自动补寄。
3. 同一操作重复发送不重复。
4. 两台设备分别新增内容后互相出现。
5. 同一批注冲突、折页冲突、最近停留冲突符合规则。
6. 删除内容不会被旧设备复活。
7. 新设备恢复书、痕迹与文件。
8. 匿名与另一账号无法读取数据或私有 EPUB。

## 13. 当前不做

- 不在 Phase 2 实现 MCP 工具、来访会话或微信读书同步。
- 不把完整 Supabase row 类型渗入 `src/domain/`。
- 不依赖浏览器 Background Sync 才能保证正确性。
- 不制作复杂冲突解决界面或完整修订历史。
- 不默认把整本正文交给模型。
- 不把 Realtime 当作唯一变化来源。

## 14. 官方依据

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：暴露 schema 中的表必须启用 RLS；UPDATE 同时需要 `using` 与 `with check`；授权使用 `auth.uid()` 所有权条件。
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)：私有对象依靠 `storage.objects` RLS；upsert 需要 INSERT、SELECT 与 UPDATE 权限。
- [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)：私有 bucket 的下载也受 RLS 控制。
- [Storage Schema](https://supabase.com/docs/guides/storage/schema/design)：文件操作只走 Storage API，不直接修改 `storage` schema。
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)：Realtime 可监听数据库变化，但 DELETE 事件有限制，因此本设计使用软删除和独立增量游标保证补齐。
- [Realtime database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)：Broadcast 更适合未来扩展；Phase 2 单用户先选择简单的 Postgres Changes。
