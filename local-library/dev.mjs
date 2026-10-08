import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import { libraryDir } from './db.mjs'

const tokenPath = resolve(libraryDir, 'access-token')
if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(24).toString('base64url'), 'utf8')
const token = readFileSync(tokenPath, 'utf8').trim()
const children = [
  spawn(process.execPath, ['local-library/server.mjs'], { stdio: 'inherit' }),
  // Windows + Node 24 直接 spawn npm.cmd 可能抛 EINVAL；直接运行 Vite 的 Node 入口更稳定。
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' }),
]

const addresses = Object.values(networkInterfaces()).flat()
  .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
  .map((entry) => entry.address)

process.stdout.write('\n固定本地书房入口：\n')
process.stdout.write('  http://localhost:5173/?local-key=' + token + '\n')
for (const address of addresses) {
  process.stdout.write('  http://' + address + ':5173/?local-key=' + token + '\n')
}
process.stdout.write('\n把当前浏览器旧书房并入固定书房时，在地址末尾再加：&import-local=1\n')
process.stdout.write('手机热点变化后，从新地址重新打开即可；书仍在同一个 SQLite 文件里。\n\n')

function stop() {
  for (const child of children) child.kill()
}
function stopAndExit() {
  stop()
  process.exit(0)
}
process.on('SIGINT', stopAndExit)
process.on('SIGTERM', stopAndExit)
for (const child of children) child.on('exit', (code) => {
  if (code && code !== 0) {
    stop()
    process.exitCode = code
  }
})
for (const child of children) child.on('error', (error) => {
  process.stderr.write('启动 Marginalia 失败：' + error.message + '\n')
  stop()
  process.exitCode = 1
})
