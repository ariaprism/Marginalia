# Marginalia

Marginalia 是一个人与 AI 异步共读、共同留下页边痕迹的私人阅读系统。

项目目前处于 Phase 1B 收口：真实 EPUB、本地阅读位置、折页、划线与批注均已接入 IndexedDB。长期方向与阶段路线见
`MARGINALIA_CONSTRUCTION_MAP.md`，当前施工状态见 `AGENTS.md`，v0.2 边界与验收见 `docs/PHASE_1B.md`。

在线验收站：[ariaprism.github.io/Marginalia](https://ariaprism.github.io/Marginalia/)

注意：本地数据按浏览器 Origin 隔离。`localhost`、局域网 IP 与线上地址不会自动共享藏书；跨设备同步属于 Phase 2。

## 本地开发

```sh
npm install
npm run dev
```

## 验证

```sh
npm test
npm run lint
npm run build
```
