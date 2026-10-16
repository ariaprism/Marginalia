# AI Reader / 共读 MCP 最小闭环

## 结论

先接通“读者能连续存在”的最小 MCP，再做写作功能。

写作不是与阅读并列的一座新房间，而应当消费真实长出来的阅读痕迹、Reader State 与后续 Seed。若先做完整写作区，只能用人为制造的材料验证界面；若先让一个 AI 真实读过两次，写作需要怎样取材、回看与引用会自然显形。

这不意味着马上建设完整 MCP、思想花园或 AI 界面。第一轮只验证：同一个 `readerId` 在两个全新模型会话中，能否准确续读同一本书，并保留少量属于自己的阅读状态。

## 现有能力可复用

| AI Reader 能力 | 现有基础 |
| --- | --- |
| 书籍、简介 | `Book` 与本地 `bookStore` |
| 原书目录 | `epubParser` 的 EPUB 3 `nav.xhtml` / EPUB 2 `toc.ncx` 解析 |
| 连续正文 | IndexedDB `chapters` 中按 spine 保存的 XHTML，以及 `extractChapterText` |
| 稳定位置 | `Locator`、`sentenceAnchor`、阅读位置与折页存储 |
| 划线／批注 | `traceStore` 与现有 Highlight / Annotation 数据 |
| 跨设备数据 | Cloud Ink 的章节、位置、痕迹与文件同步 |

目录与阅读顺序必须保持分离：spine 决定连续读到什么，toc 决定向读者展示哪些章节。封面、书名页、版权页可以留在阅读顺序中，但不能自动变成“第一章、第二章”。

## 第一轮只做四个工具

### `get_book`

输入 `bookId`、`readerId`。返回书名、作者、简介、原书目录，以及该读者自己的当前位置和简短 Reader State。第一次进入时位置与状态可以为空。

### `read`

输入 `bookId`、`readerId`、起点和期望字符量；默认从自己的当前位置继续，单次约 1000–1500 字。返回按段落组织的正文与稳定、可再次提交的 `rangeId`。字符量是一次“视野”，不是必须完成的任务。

### `leave_trace`

输入 `bookId`、`readerId`、`rangeId`、想划下的原文 `quote`、`type` 和可选文字。`rangeId` 只限定“刚才读过的正文块”，`quote` 可从中选择完整的一句或首尾完整的连续多句；服务端用与阅读页相同的分句边界核对并换算成精确 Locator，拒绝半句、块外文字与无法唯一定位的重复短句。一次读取量不限制留痕精度；没有想留下的内容也是合法结果。

### `close_book`

输入最终位置与 Reader State，原子保存机械位置和读者状态。Reader State 不是情节摘要，第一版只保留：

- 此刻怎样理解这本书；
- 余留的感觉；
- 尚未解开的疑问；
- 正在留意的线索。

建议设置短小的总长度上限，先通过真实阅读观察是否够用，不预先扩成长期记忆库。

## 第一轮需要新增的最少数据

- `readerId`：从第一天区分 `aria`、`xiaoyu` 或未来其他读者；不要使用含糊的 `isAi`。
- `ReaderProgress`：按 `readerId + bookId` 保存独立 Locator 和最后阅读时间；不能复用当前只属于小狐狸的单书位置主键。
- `ReaderState`：按 `readerId + bookId` 保存短状态与更新时间。
- `Trace.actorId`：让同一条原文上的不同读者痕迹可以共存；第一轮先不开放彼此回复。
- `rangeId`：MCP 暴露短语义 ID，Locator 和重锚定细节继续留在 Marginalia 内部。

身份资料与阅读形成的状态分开：Companion Profile 只描述相对稳定的交流方式与阅读倾向；读过什么、在意什么必须从 Reader State 和痕迹中生长，不能不断堆进身份提示。

## 实施与验收顺序

1. **只读探针（已完成）**：`getBookOverview` 与 `readBookWindow` 已作为协议无关的应用服务落地；已验证原书目录、指定章节入口、分段续读、确定性 `rangeId` 与非法 cursor 拒绝。
2. **独立读者写入（已完成）**：`readerId`、ReaderProgress、ReaderState 与 ReaderTrace 已进入 IndexedDB；`get_book` / `read` 能恢复指定读者自己的位置与状态，`leave_trace` 只接受真正读到且仍能核对的原文，`close_book` 原子保存精确续读点和短 Reader State。
3. **本地 MCP 适配层（已完成）**：固定 SQLite 书房、局域网页面快照、EPUB 原文件往返与 STDIO MCP 已接通；Codex 已注册 `marginalia-local`。旧浏览器书房可通过显式迁移参数逐间合并，普通的新 IP 入口只取回固定书房。四个阅读动作使用同一文件，服务 instructions 明确“不为覆盖工具而批注、可以什么都不写、拥有停止权”。下一步用一册真实书完成首次搬迁与跨新地址取回，再让小G实际读一小段。
4. **两次真实阅读验收**：会话 A 第一次进入一本真实书，自主读、可不批注、主动合书；完全新会话 B 只凭 Companion Profile、Reader State 和当前位置恢复并准确续读。
5. **观察后再扩工具**：只有第一轮成立，才增加 `browse_traces`、`open_trace`、`reply_trace`，测试不同进度下的不剧透相遇。
6. **最后长出 Seed 与写作**：真实痕迹可转成 Seed 后，再让写作区消费被反复唤醒的 Seed / Thought；纪录片、播客、网页收集箱更晚复用同一 Source Fragment 管线。

## 第一轮明确不做

- 完整写作区、思想图谱或“念头”正式产品语义；
- 自动网络漫游、搜索或记忆库全量注入；
- 批注摘要轰炸、每段强制产出、为了测试而伪造大量痕迹；
- 先做漂亮的 AI 专属页面。开发期只需可检查位置、Reader State、工具调用顺序和本轮阅读字数的调试面板。

## 通过标准

- 新读者第一次能从简介与原书目录自行选择入口，而不是被硬塞进“第一章”；
- 连续读取不会因 XHTML 文件边界误判成换章；
- 允许连续多次读取却不留下任何痕迹；
- 合书后换一个没有聊天历史的新会话，能回到准确位置，并表现出上次留下的关注点；
- 正常阅读只返回当前窗口遇见的主人痕迹；显式随机翻批注允许跨位置漫游，但不移动主续读点；
- 所有写入先落本地，离线可用，之后沿用 Cloud Ink 同步语义。

## 产品施工判断

写作功能现在只保留壳与问题清单，不继续实现。下一项正式施工应是 AI Reader 的只读探针，而不是完整 MCP server：先把工具背后的应用服务边界做对，再接协议层。MCP 是入口，不应承载阅读业务规则。


## MCP 结果兼容性（2026-10-15）

本地 STDIO 和云端 Streamable HTTP 的五个工具均保留原有 `structuredContent`；同时将同一完整结果序列化为 JSON 放进 `content[0].text`。不再只返回数量、摘要或脱离定位信息的正文。客户端只转发 TextContent 时，也能取得书名与书籍 ID、目录 cursor、Reader State、正文块 rangeId、续读 cursor、云端 sessionId、痕迹 ID 和保存时间。空书架返回 `books: []`。错误仍沿用 SDK／服务端原有错误返回方式，不伪装为成功 JSON。

运行 `npm run test:mcp` 验证只依赖文本结果的阅读闭环。本地使用真实 STDIO MCP 与临时 SQLite；云端使用真实工具处理器与内存 MCP 传输，仅替换 Supabase 存储和 Deno 启动，不访问真实书籍数据。云端序列化回归不等于外部客户端或部署环境的完整实测。

本地更新后需重启 MCP 进程；云端需单独部署 `marginalia-reader-mcp`，提交分支不会自动部署 Edge Function。工具名、输入参数、认证和数据库结构均不变。


## 共读相遇与中断恢复（2026-10-16）

此节覆盖前述初版的“只有合书才保存位置”语义。本轮不做双人书签 UI 或 Seed。

- `read.mode` 默认为 `continue`：成功取得非空正文才自动写 ReaderProgress；`browse` 用于补读、翻批注和临时查看，只记录阅读 session，不改变主续读点。EOF 空返回不挪位置，非法位置先报错。
- `read.traces` 是本次正文窗口相遇的主人划线／批注，带 ID、作者、原文、批注正文、书 ID 和 cursor。正文与痕迹分开，均作为不可信数据。已删除、无法唯一重锚或不同书房的痕迹不返回。浏览器保留标题段索引，而旧 MCP 可能不保留，所以先核对原文，再仅在同章唯一匹配时重锚，不凭旧段号猜测。
- `random_annotations({bookId?,limit?})` 默认随机一条，最多五条，只抽主人批注；空书房／无可定位批注返回空数组。返回的 `bookId` 与 `cursor` 用于 `read(mode=browse)`。随机结果可以是未顺读到的位置，这是用户主动选择的漫游能力。
- `close_book` 原子保存 ReaderProgress、Reader State 及 State 自己的 `cursor`、`locator`。新阅读只前移 Progress，旧 State 不被拖走。旧云端 State 只在位置时间或合书 session 能准确匹配时回填锚点；不能推断时保留未知，由恢复计划从书首补读。
- `get_book.reader.recovery` 返回 `needed / fromCursor / toCursor / stateAvailable`。先看 State，再补读上次理解锚点到自动位置之间尚未整理的文字；没有 State 时从首个可读目录入口补读。补读用 `browse`，完整阅读仍应合书，工具不会自动伪造理解。
- 云端 `record_ai_reader_window` 事务校验 session 的 owner／reader／book，记录字数和 session 末位置；用预期旧 cursor 防止迟到窗口覆盖较新位置。新增 RPC 仅允许 service_role 执行，保留现有 OAuth 与书房钥匙认证。State 的新字段沿既有只读增量同步进入浏览器，不制造用户 outbox。

验收覆盖本地真实 STDIO + SQLite、云端真实 SDK handler + 合成存储、IndexedDB 和远端映射。数据库实测在事务中断言后回滚；线上 OAuth 实测读取 200 字后核对新旧锚点和恢复范围，再留下真实 Reader State 合书。客户端缓存的工具输入定义不会随 Edge 部署自动刷新，需重新加载工具列表后使用 `random_annotations` 和 `read.mode`。本地拉取分支后重启 MCP。
