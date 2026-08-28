# Marginalia 本地数据说明

## IndexedDB

- 数据库名：`marginalia`
- 当前版本：`3`
- 建库入口：`src/data/local/db.ts`
- 同一浏览器中，不同 Origin 拥有彼此隔离的数据库。

| Object store | 主键 | 内容 |
|---|---|---|
| `books` | `id` | 书名、作者、封面、状态、进度、置顶与最近打开时间 |
| `epubFiles` | `bookId` | 用户导入的 EPUB 原始文件 |
| `chapters` | `id` | spine 顺序、目录标题、href 与章节 XHTML；按 `bookId` 建索引 |
| `readingProgress` | `bookId` | 自动继续位置与展示进度 |
| `bookmarks` | `bookId` | 每书唯一手动折页；与自动继续位置分开同步 |
| `highlights` | `id` | 划线颜色与 Locator；按 `bookId` 建索引 |
| `annotations` | `id` | 用户批注、可选 highlightId 与 Locator；按 `bookId` 建索引 |
| `marginalia` | `id` | 共读者文字、visibility 与 Locator；按 `bookId` 建索引 |
| `outbox` | `operationId` | 尚未得到云端确认的本地变化；按实体和创建时间建索引 |
| `syncState` | `remoteUserId` | 每个云端账号最后收到的变化编号与最近成功同步时间 |
| `profiles` | `id` | 名帖；当前使用本地稳定 ID `self`，上云时映射为登录账号 |

版本 2 加入 outbox 和 syncState。版本 3 将手动折页从 `ReadingProgress` 搬入独立 bookmarks store，并将名帖迁入 profiles；升级会保留既有折页。第一次连接云端时，`prepareInitialOutbox` 会幂等扫描旧书房，只补当前没有待寄项的记录。

## 稳定位置

`Locator` 至少保存：

- `bookId`
- spine 中的 `chapterIndex`
- `elementPath` 与 `textOffset`
- `selectedText`
- 前后文上下文
- 可选 EPUB CFI

阅读器每次加载都用统一的 `segmentChapter` 重建句子范围。原文无法重锚定时，痕迹保留并标记漂移，不静默删除。

## 阅读位置和折页

`ReadingProgress.locator` 是自动“上次读到”；`bookmark.locator` 是用户主动留下的唯一折页。目录、痕迹和章节跳转属于临时翻看，不应立即覆盖自动继续位置。

## 书籍状态

- 新导入：`wish`
- 首次真正打开正文：`reading`
- 用户在末页或书籍菜单确认：`finished`
- 从头重温：回到 `reading`，重置自动位置，保留折页和全部痕迹

## 删除

“移出书房”会二次确认，并级联删除 Book、EPUB 原文件、章节、阅读位置、划线、批注和页边文字。Phase 1B 没有回收站或云端恢复。

## 不在 IndexedDB 的设置

书架视图、最近界面、阅读排版和部分轻量排序辅助值保存在 `localStorage`。这些属于当前设备上的阅读习惯，写入失败不应阻断阅读。

双方称呼现在以 IndexedDB profiles 为正式本地记录并原子地产生 outbox；旧 `localStorage` 名帖第一次打开时会迁入，之后只作为界面快速读取和 IndexedDB 暂时不可用时的退路。

自动阅读位置与手动折页已经分库存放。现有界面仍通过组合后的 `ReadingProgress` 读取它们，但正常翻页只更新阅读位置；只有实际移动或取消折页才产生 bookmark 待寄动作。

## Phase 2 同步原则

IndexedDB 仍是交互时的第一写入点。云端同步通过 outbox 增量进行，不能把动态页码作为远端主定位，也不能把 Supabase 类型渗入 `src/domain/`。

当前业务写入已经会为书、EPUB、章节、阅读位置、划线、批注和页边文字产生 outbox；真实远端适配器与云端变化落回本地的路径尚未实现。登录 Supabase Auth 不等于这些数据已经同步。
