/**
 * Spec 打包脚本 — 读取 configspec.yaml，调用 electron-builder 打包。
 *
 * 用法：node scripts/spec-dist.ts <spec-name>
 * 示例：node scripts/spec-dist.ts code
 *       node scripts/spec-dist.ts work
 *
 * 前置条件：先运行 spec-build.ts <spec-name> 完成 tsdown 构建。
 */

import { existsSync, readFileSync, renameSync, copyFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseDocument } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = resolve(__dirname, '..')
const require = createRequire(import.meta.url)

/** 原始 cordis.patch.yml 内容（引用 dsh-plugin-desktop），每次打包从这里恢复 */
const ORIGINAL_CORDIS_PATCH = `# Desktop Host operations compose around the existing Web bundle. Compatibility
# mode keeps upstream ownership of the browser carrier and rendered UI.
- insert:
    - id: desktop-shell
      name: dsh-plugin-desktop
      config:
        mode: compatibility
    - id: desktop-terminal
      name: dsh-plugin-desktop/terminal
      disabled: !!js process.platform === 'linux'
    - id: desktop-diagnostics
      name: dsh-plugin-desktop/diagnostics
    - id: desktop-notifications
      name: dsh-plugin-desktop/notifications
    - id: desktop-pnpm
      name: dsh-plugin-desktop/pnpm
    - id: desktop-profiles
      name: dsh-plugin-desktop/profiles
    - id: desktop-updates
      name: dsh-plugin-desktop/updates

# A desktop launch has no terminal operator waiting for the Web readiness line.
- id: web-runtime
  config:
    openBrowser: false
    printUrl: false
    surfaceContext: true
    trustedHosts: []
`

/** 从 configspec.yaml 读取配置 */
function loadConfigspec(specName: string): Record<string, unknown> {
  const specPath = join(DESKTOP_ROOT, '.spec', specName, 'configspec.yaml')
  if (!existsSync(specPath)) {
    throw new Error(`configspec.yaml not found: ${specPath}`)
  }
  const content = readFileSync(specPath, 'utf8')
  const doc = parseDocument(content, { prettyErrors: true })
  if (doc.errors.length > 0) {
    throw new Error(`Invalid configspec.yaml: ${doc.errors.map(e => e.message).join('; ')}`)
  }
  return (doc.toJS() ?? {}) as Record<string, unknown>
}

/** 从嵌套对象安全获取字符串值 */
function getString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : undefined
}

/** 将 configspec 字段设置到环境变量 */
function applySpecEnvironment(specName: string, config: Record<string, unknown>): void {
  const identity = config.identity as Record<string, unknown> | undefined
  if (identity === undefined) {
    throw new Error('configspec.yaml missing "identity" section')
  }

  const envMap: Record<string, string | undefined> = {
    DSH_SPEC_NAME: specName,
    DSH_SPEC_APPID: getString(identity, 'appId'),
    DSH_SPEC_PRODUCT_NAME: getString(identity, 'productName'),
    DSH_SPEC_SHORTCUT_NAME: getString(identity, 'shortcutName'),
    DSH_SPEC_PACKAGE_NAME: getString(identity, 'packageName'),
  }

  for (const [key, value] of Object.entries(envMap)) {
    if (value !== undefined && value !== '') {
      process.env[key] = value
    }
  }

  // artifactName 也设置到环境变量（供验证脚本使用）
  const artifactName = getString(identity, 'artifactName')
  if (artifactName !== undefined && artifactName !== '') {
    process.env.DSH_SPEC_ARTIFACT_NAME = artifactName
  }
}

/** 复制 spec 专属品牌资源到共享 build/ 目录（确保 electron-builder 打包时使用正确的 icon） */
function applyBrandAssets(specDir: string, config: Record<string, unknown>): void {
  const brand = config.brand as Record<string, unknown> | undefined
  if (brand === undefined) return

  const sharedBuild = join(DESKTOP_ROOT, 'build')

  const appIcon = getString(brand, 'appIcon')
  if (appIcon && existsSync(join(specDir, appIcon))) {
    console.log(`  Copying spec app icon: ${appIcon}`)
    cpSync(join(specDir, appIcon), join(sharedBuild, 'app-icon.png'))
  }

  const trayIcons = getString(brand, 'trayIcons')
  if (trayIcons && existsSync(join(specDir, trayIcons))) {
    console.log(`  Copying spec tray icons: ${trayIcons}`)
    cpSync(join(specDir, trayIcons), sharedBuild, { recursive: true })
  }
}

/** 执行命令 */
function run(command: string, args: string[], cwd: string): void {
  console.log(`Running: ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

/** 临时更新 package.json 的 name 和 build 配置 */
function applyPackageJson(config: Record<string, unknown>): void {
  const identity = config.identity as Record<string, unknown> | undefined
  if (identity === undefined) return

  const packageName = getString(identity, 'packageName')
  const productName = getString(identity, 'productName')
  const shortcutName = getString(identity, 'shortcutName')
  const artifactName = getString(identity, 'artifactName')

  if (packageName === undefined || packageName === '') return

  const pkgPath = join(DESKTOP_ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.name = packageName
  const appId = getString(identity, 'appId')
  if (appId) pkg.build.appId = appId
  if (productName) pkg.build.productName = productName
  if (shortcutName) {
    const resolvedArtifactName = artifactName || `Baizhou-DSH-${shortcutName}-${pkg.version}-\${arch}-Setup.\${ext}`
    pkg.build.nsis.shortcutName = shortcutName
    pkg.build.win.artifactName = resolvedArtifactName
    pkg.build.nsis.artifactName = resolvedArtifactName
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log(`  Updated package.json: name=${packageName}, productName=${productName}`)
}

/** 从 node_modules 中移除不需要的 shipped 预设 */
function removeShippedPresets(config: Record<string, unknown>): Map<string, string> {
  const removed = new Map<string, string>()
  const agentPresets = config.agentPresets as Record<string, unknown> | undefined
  const removeList = agentPresets?.removeShippedPresets as string[] | undefined
  if (!Array.isArray(removeList) || removeList.length === 0) return removed

  let presetsDir: string | undefined
  try {
    const presetsPackageDir = dirname(require.resolve('@deepseek-ai/dsh-agent-presets/package.json'))
    presetsDir = join(presetsPackageDir, 'presets')
  } catch {
    console.warn('  Warning: shipped presets directory not found')
    return removed
  }

  for (const presetName of removeList) {
    const presetPath = join(presetsDir, presetName)
    if (!existsSync(presetPath)) continue
    const backupPath = join(presetsDir, `._spec_backup_${presetName}`)
    renameSync(presetPath, backupPath)
    removed.set(presetName, backupPath)
    console.log(`  Removed shipped preset: ${presetName}`)
  }
  return removed
}

/** 恢复 shipped 预设（包括之前未恢复的备份） */
function restoreShippedPresets(removed: Map<string, string>): void {
  let presetsDir: string | undefined
  try {
    const presetsPackageDir = dirname(require.resolve('@deepseek-ai/dsh-agent-presets/package.json'))
    presetsDir = join(presetsPackageDir, 'presets')
  } catch { return }

  // 恢复本次移除的预设
  for (const [name, backupPath] of removed) {
    if (existsSync(backupPath)) {
      renameSync(backupPath, join(presetsDir!, name))
    }
  }

  // 恢复之前残留的备份（如 Code 版打包后未恢复的情况）
  for (const entry of readdirSync(presetsDir!, { withFileTypes: true })) {
    if (entry.name.startsWith('._spec_backup_') && entry.isDirectory()) {
      const originalName = entry.name.replace('._spec_backup_', '')
      const backupPath = join(presetsDir!, entry.name)
      const targetPath = join(presetsDir!, originalName)
      if (!existsSync(targetPath)) {
        renameSync(backupPath, targetPath)
        console.log(`  Restored leftover preset: ${originalName}`)
      }
    }
  }

  if (removed.size > 0 || true) console.log('  Restored shipped presets')
}

async function main(): Promise<void> {
  const specName = process.argv[2]
  if (specName === undefined || specName === '') {
    console.error('Usage: node scripts/spec-dist.ts <spec-name>')
    process.exitCode = 1
    return
  }

  const specDir = join(DESKTOP_ROOT, '.spec', specName)
  if (!existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`)
    process.exitCode = 1
    return
  }

  console.log(`\n=== Packaging spec: ${specName} ===`)

  // 1. 加载配置并设置环境变量
  const config = loadConfigspec(specName)
  applySpecEnvironment(specName, config)

  const productName = getString(config.identity as Record<string, unknown>, 'productName') ?? 'DSH Desktop'
  const artifactName = getString(config.identity as Record<string, unknown>, 'artifactName')

  console.log(`  Product: ${productName}`)
  console.log(`  AppId: ${process.env.DSH_SPEC_APPID ?? '(default)'}`)
  if (artifactName) console.log(`  ArtifactName: ${artifactName}`)

  // 2. 跳过 preflight 检查
  process.env.DSH_PACKAGE_CHECK_ALREADY_RAN = '1'

  // 2.5 备份并修改 package.json（electron-builder 需要读取）
  const pkgBackupPath = join(DESKTOP_ROOT, 'package.json.spec-backup')
  copyFileSync(join(DESKTOP_ROOT, 'package.json'), pkgBackupPath)
  applyPackageJson(config)

  // 2.6 恢复原始 cordis.patch.yml 并替换为目标包名
  const cordisPath = join(DESKTOP_ROOT, 'cordis.patch.yml')
  if (existsSync(cordisPath)) {
    writeFileSync(cordisPath, ORIGINAL_CORDIS_PATCH, 'utf-8')
    const pkgName = getString(config.identity as Record<string, unknown>, 'packageName')
      || `dsh-plugin-desktop-${specName}`
    const content = readFileSync(cordisPath, 'utf-8')
    const patchedCordis = content.replaceAll('dsh-plugin-desktop', pkgName)
    writeFileSync(cordisPath, patchedCordis, 'utf-8')
    console.log(`  Replaced "dsh-plugin-desktop" → "${pkgName}" in cordis.patch.yml`)
  }

  // 2.7 移除不需要的 shipped 预设（打包进 asar 前）
  const removedPresets = removeShippedPresets(config)
  // 传递移除的预设列表给验证脚本
  const removeList = (config.agentPresets as Record<string, unknown> | undefined)?.removeShippedPresets as string[] | undefined
  if (Array.isArray(removeList) && removeList.length > 0) {
    process.env.DSH_SPEC_REMOVE_PRESETS = removeList.join(',')
  }

  // 2.8 应用品牌资源（确保 build/app-icon.png 是 spec 版本的 icon）
  applyBrandAssets(specDir, config)

  // 3. 构建 electron-builder 命令
  const builderCli = require.resolve('electron-builder/cli.js')
  const builderArgs = [
    builderCli,
    '--win', 'nsis',
    '--x64',
    '--publish', 'never',
    '--config.win.signExecutable=false',
    '--config.npmRebuild=false',
  ]

  if (artifactName !== undefined && artifactName !== '') {
    builderArgs.push(`--config.win.artifactName=${artifactName}`)
  }

  // 跳过 afterPack 钩子（dsh-community-market 缺少 src/adapters/dsh-marketplace.ts）
  builderArgs.push('--config.afterPack=./scripts/noop-after-pack.ts')

  run(process.execPath, builderArgs, DESKTOP_ROOT)

  // 4. 运行验证脚本（Node 22.19+ 原生支持 .ts）
  const verifier = join(DESKTOP_ROOT, 'scripts', 'verify-win-installer.ts')
  if (existsSync(verifier)) {
    run(process.execPath, ['--experimental-strip-types', verifier], DESKTOP_ROOT)
  }

  // 5. 恢复 shipped 预设、package.json、cordis.patch.yml
  restoreShippedPresets(removedPresets)
  if (existsSync(pkgBackupPath)) {
    renameSync(pkgBackupPath, join(DESKTOP_ROOT, 'package.json'))
  }
  writeFileSync(join(DESKTOP_ROOT, 'cordis.patch.yml'), ORIGINAL_CORDIS_PATCH, 'utf-8')
  console.log('  Restored cordis.patch.yml')

  console.log(`\n=== Spec ${specName} package complete ===`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
