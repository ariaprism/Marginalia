# Marginalia 本地书房

本地书房把不同浏览器 Origin 原本各自隔离的 IndexedDB，汇到电脑上的固定 SQLite 文件：

- 数据库：`.marginalia-local/library.sqlite`
- 本地网页接口：`npm run local-library`
- Codex MCP：`npm run mcp:local`
- 网页与本地书房一起启动：`npm run dev:shared`

数据库目录已加入 `.gitignore`，不会进入 Git，也不连接正式 Supabase。

运行 `npm run dev:shared` 后，终端会打印带书房钥匙的手机入口。首次搬迁某个浏览器地址下的旧书房时，在打印地址末尾加 `&import-local=1` 打开一次。这会把当前地址已有的书、批注和 EPUB 合并进固定书房；多个仍能打开的旧地址可以依次执行。平时不要加这个参数，直接使用命令打印的普通地址。

固定书房会保存书目、EPUB 原文件、解析后的正文、阅读位置、批注和共读者状态。
