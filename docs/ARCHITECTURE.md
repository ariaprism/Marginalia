# Marginalia 架构说明

## 当前边界

项目处于 Phase 2。React 负责界面，EPUB 仍在浏览器内解析，书籍和阅读痕迹仍以 IndexedDB 作为读取与第一写入点。Supabase 项目、登录、远端表、RLS、私有 Storage 和本地 outbox 地基已经建立；名帖与书目元数据已有第一段真实 push／pull，EPUB、章节和痕迹尚未接通。

```text
React feature
  ├─ domain/          纯领域对象与规则
  ├─ reader/          EPUB 解析、正文提取、定位与重锚定
  └─ data/
       ├─ local/      IndexedDB、outbox 与 syncState
       ├─ sync/       不依赖 Supabase 的同步状态机和 fake remote
       └─ remote/     可选 Supabase 客户端与生成类型；真实适配器待接
```

## 目录职责

- `src/domain/`：Book、Locator、ReadingProgress、Highlight、Annotation、Marginalia；不依赖 React、DOM 或 Supabase。
- `src/reader/`：EPUB 解析、章节纯文本提取、句子切分、Locator 解析和动态分页输入。
- `src/data/local/`：IndexedDB 建库、事务、书籍与痕迹读写。
- `src/data/sync/`：同步操作、同实体待寄替换、单次 push／pull 状态机、首次先拉后合并保护、IndexedDB 写回和确定性 fake remote。
- `src/data/remote/`：可选 Supabase 浏览器客户端、远端生成类型及名帖／书目适配器；不作为阅读界面的直接数据源。
- `src/features/cloud/`：正式站邮箱门帖、身份与待寄数量展示；阶段按钮只同步名帖与书目，完整同步和恢复仍保持禁用。
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

应用作为静态文件部署，IndexedDB 仍按 Origin（协议、域名/IP、端口）隔离。本地开发地址与 GitHub Pages 地址是两间独立书房；部署本身不会上传或迁移本地藏书。

GitHub Pages 正式站注入 Supabase URL 与 publishable key，并允许邮箱门帖登录。localhost 默认不开真实云端，避免测试数据碰到正式藏书。浏览器不包含 secret 或 service-role key。

真实同步完成后，远端层仍不得反向侵入领域对象或让阅读交互等待网络；Supabase 只负责长期保存、跨设备恢复和未来与共读者相遇。

## Phase 2 尚未接通

- 名帖／书目以外领域对象与远端行的双向转换。
- EPUB／封面上传下载，以及章节、进度、折页与痕迹的真实 push／pull。
- 应用启动、网络恢复、回到前台、写入防抖与 Realtime 提醒。
- 受保护的完整“从云端恢复”。
