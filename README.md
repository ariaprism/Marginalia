# Marginalia

Marginalia 是一个人与 AI 异步共读、共同留下页边痕迹的私人阅读系统。

项目目前处于 Phase 2 Cloud Ink：真实 EPUB、本地阅读位置、折页、划线与批注均已接入 IndexedDB，
本地 outbox 同步地基与独立 Supabase 云端 schema 已建立。长期方向与阶段路线见
`MARGINALIA_CONSTRUCTION_MAP.md`，当前施工状态见 `AGENTS.md`。

在线验收站：[ariaprism.github.io/Marginalia](https://ariaprism.github.io/Marginalia/)

注意：本地数据按浏览器 Origin 隔离。`localhost`、局域网 IP 与线上地址不会自动共享藏书；跨设备同步属于 Phase 2。

GitHub Pages 正式站已经支持 Supabase 邮箱门帖登录，并接通“先收名帖与书目”的真实 push／pull。它目前只保存名帖与书籍元数据；EPUB、章节、阅读位置和痕迹仍留在本机，完整“立即收好”和“从云端恢复”要等文件传输与恢复保护验收后开放。

## 本地开发

```sh
npm install
npm run dev
```

云端连接是可选能力。复制 `.env.example` 为 `.env.local`，配置项目 URL 与 Supabase
publishable key；不要把 secret 或 service-role key 放进浏览器环境变量。

## 验证

```sh
npm test
npm run lint
npm run build
```
