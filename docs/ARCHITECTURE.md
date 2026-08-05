# Marginalia 架构说明

## 当前边界

Phase 1B 是纯浏览器、本地优先的静态应用：React 负责界面，EPUB 在浏览器内解析，书籍和阅读痕迹保存在 IndexedDB。当前没有后端、账户、跨设备同步或模型调用。

```text
React feature
  ├─ domain/          纯领域对象与规则
  ├─ reader/          EPUB 解析、正文提取、定位与重锚定
  └─ data/local/      IndexedDB 适配器
```

## 目录职责

- `src/domain/`：Book、Locator、ReadingProgress、Highlight、Annotation、Marginalia；不依赖 React、DOM 或 Supabase。
- `src/reader/`：EPUB 解析、章节纯文本提取、句子切分、Locator 解析和动态分页输入。
- `src/data/local/`：IndexedDB 建库、事务、书籍与痕迹读写。
- `src/features/bookshelf/`：书架视图模型、封面、页头和书架数据加载。
- `src/features/import-book/`：EPUB 预解析、导入草稿、封面选择、确认入库和弹窗状态。
- `src/features/drawer/`：书房抽屉、功能页和名帖状态。
- `src/features/reader/`：阅读工具面板与排版偏好；分页、Locator、折页和痕迹的核心编排暂留 `App.tsx`，下一轮应作为完整控制器迁移，避免拆散相互依赖的 ref。
- `src/features/settings/`：不属于书籍数据的轻量本地界面设置。

## 关键数据流

### 导入

```text
File → JSZip 预解析 → 用户确认元数据/封面 → 单次 IndexedDB 入库
```

预解析不会写库；只有点击“藏入书架”后才保存 Book、原 EPUB 和章节。

### 阅读与定位

```text
章节 XHTML → 纯文本段落 → 句子切分 → CSS 分栏动态分页
Locator → resolveLocator → 句子范围 → 当前排版下的动态页
```

动态页码仅用于显示。字号、行距、字体、页边距或窗口变化都会重分页；持久层始终保存 Locator。详细规则见 [EPUB_ANCHORING.md](./EPUB_ANCHORING.md)。

### 痕迹

同一句范围使用 `passageKey` 合并为一条视图痕迹。划线和多条批注分别持久化，再由 `loadTraces` 聚合；句子编号不持久化。

## 部署语义

应用可以作为静态文件部署，但 IndexedDB 按 Origin（协议、域名/IP、端口）隔离。本地开发地址与 GitHub Pages 地址是两间独立书房；部署不会上传或迁移本地藏书。

Phase 2 才会引入 Supabase、登录、私有 Storage 和 outbox 同步。远端层不得反向侵入领域对象或让阅读交互等待网络。
