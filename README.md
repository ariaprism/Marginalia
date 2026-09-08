# Marginalia

Marginalia 是一个人与 AI 异步共读、共同留下页边痕迹的私人阅读系统。

项目已完成 Phase 2 Cloud Ink（`v0.3 Cloud Ink`）：真实 EPUB、本地阅读位置、折页、划线与批注均以 IndexedDB 为第一写入点，
并可通过独立 Supabase 云端自动同步及完整恢复。长期方向与阶段路线见
`MARGINALIA_CONSTRUCTION_MAP.md`，当前施工状态见 `AGENTS.md`。

在线验收站：[ariaprism.github.io/Marginalia](https://ariaprism.github.io/Marginalia/)

注意：本地数据按浏览器 Origin 隔离。正式站登录后可跨设备同步；`localhost` 与局域网开发地址默认不连接真实云端。

GitHub Pages 正式站已经支持 Supabase 邮箱门帖登录，并接通名帖、书目、章节、阅读位置、折页、痕迹、EPUB 与封面的自动双向同步。“立即收好”与受保护的“从云端恢复”均已通过正式站人工验收。

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
