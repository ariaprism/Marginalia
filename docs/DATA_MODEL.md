# Phase 1B 本地数据说明

## IndexedDB

- 数据库名：`marginalia`
- 当前版本：`1`
- 建库入口：`src/data/local/db.ts`
- 同一浏览器中，不同 Origin 拥有彼此隔离的数据库。

| Object store | 主键 | 内容 |
|---|---|---|
| `books` | `id` | 书名、作者、封面、状态、进度、置顶与最近打开时间 |
| `epubFiles` | `bookId` | 用户导入的 EPUB 原始文件 |
| `chapters` | `id` | spine 顺序、目录标题、href 与章节 XHTML；按 `bookId` 建索引 |
| `readingProgress` | `bookId` | 自动继续位置、每书唯一折页与展示进度 |
| `highlights` | `id` | 划线颜色与 Locator；按 `bookId` 建索引 |
| `annotations` | `id` | 用户批注、可选 highlightId 与 Locator；按 `bookId` 建索引 |
| `marginalia` | `id` | 共读者文字、visibility 与 Locator；按 `bookId` 建索引 |

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

书架视图、双方称呼、最近界面和部分轻量排序辅助值保存在 `localStorage`。这些不是书籍内容；写入失败不应阻断阅读。

## Phase 2 迁移原则

IndexedDB 仍是交互时的第一写入点。云端同步通过 outbox 增量进行，不能把动态页码作为远端主定位，也不能把 Supabase 类型渗入 `src/domain/`。
