# 共读交换契约 v1

## 用途

共读交换包是在 MCP 开门前验证真实共读读写语义的本地桥梁。用户从一本书的一个章节选择若干批注，连同有限正文上下文递给共读者；共读者可回复或只标记读过，再把规范 JSON 交回 Marginalia。

JSON 是可校验、可导入的规范格式。Markdown 由同一份数据生成，只用于阅读和转交，不承担回写定位。

## v1 边界

- 一份交换包只属于一本书的一个章节。
- 只邀请已有用户批注，不自动包含只有划线、没有批注的痕迹。
- 每条批注包含所在完整段落，以及前后各最多两段；章首和章末自然截断。
- 不导出整本 EPUB、阅读进度、折页或无关章节。
- 共读者可选择 `reply` 或 `seen`，不要求逐条回复。
- v1 只接受 `visibility: immediate`；未来文字等阅读到达显现的语义留到 MCP 阶段。

## 稳定身份与定位

- `schemaVersion`：当前为 `1.0`。
- `exchangeId`：一次递出动作的身份。
- `invitationId`：由原批注 ID 确定生成，供回复关联。
- `annotationId`：原用户批注的稳定 ID。
- 交换文件不暴露 `Locator`、元素路径或字符偏移。共读者只看到语义 ID、批注与有限正文；导入时 Marginalia 在本地用 `annotationId` 找回原批注保存的 Locator。
- `idempotencyKey`：共读者每条动作的幂等身份；同一回复文件重复导入不会重复写入页边文字。

## 导入结果

导入按条目处理并汇总：

- `written`：成功夹回书页的文字。
- `seen`：读过但没有回复的邀请；v1 只在本次导入报告中呈现，尚未形成来访记录。
- `duplicate`：幂等键已经存在，未重复写入。
- `rejected`：原批注不存在、邀请身份不匹配或字段不合法。

回复依附于原批注并由 Marginalia 内部复用其 Locator。单项无法辨认不会让已经成功的其他回复重复写入。

## 代码位置

- `src/features/reading-exchange/contract.ts`：交换包、回复格式、Markdown 与运行时校验。
- `src/features/reading-exchange/localExchange.ts`：IndexedDB 幂等导入。
- `src/features/reading-exchange/ReadingExchangeDialog.tsx`：书籍小房间的导出／导入界面。

## 后续演进

真实书籍往返验收后，这份契约将作为 MCP `open_annotation`、`read_around` 与 `leave_note` 的本地参照。MCP 返回给共读者的也是精简语义载荷；Locator、重锚定和数据库写入由 Marginalia 服务内部完成。自由翻阅、搜索、未来文字和真实 `seen` / visit event 不塞入 v1 文件交换，而由后续动态 MCP 工具承载。
