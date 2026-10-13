/**
 * Spec 构建脚本 — 读取 .spec/{name}/configspec.yaml，设置环境变量，执行构建。
 *
 * 用法：node scripts/spec-build.ts <spec-name>
 * 示例：node scripts/spec-build.ts code
 *       node scripts/spec-build.ts work
 */

import { existsSync, cpSync, readFileSync, readdirSync, writeFileSync, copyFileSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseDocument } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = resolve(__dirname, '..')
const LOCAL_PLUGINS_BASE = resolve('E:\\baizhoucode\\companyagent\\dsplug')
const require = createRequire(import.meta.url)

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

/** 将 configspec 字段映射到环境变量 */
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
      console.log(`  ${key}=${value}`)
    }
  }
}

/** 复制 spec 专属品牌资源到共享 build/ 目录（如果配置了的话） */
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

/** 临时更新 package.json 的 name 和 build 配置，构建后恢复 */
function applyPackageJson(config: Record<string, unknown>): void {
  const identity = config.identity as Record<string, unknown> | undefined
  if (identity === undefined) return
  const packageName = getString(identity, 'packageName')
  const productName = getString(identity, 'productName')
  const shortcutName = getString(identity, 'shortcutName')
  const artifactName = getString(identity, 'artifactName')

  if (packageName === undefined || packageName === '') return

  const pkgPath = join(DESKTOP_ROOT, 'package.json')
  const backupPath = join(DESKTOP_ROOT, 'package.json.spec-backup')

  // 备份
  copyFileSync(pkgPath, backupPath)

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

/** 恢复 package.json 到原始状态 */
function restorePackageJson(): void {
  const pkgPath = join(DESKTOP_ROOT, 'package.json')
  const backupPath = join(DESKTOP_ROOT, 'package.json.spec-backup')
  if (existsSync(backupPath)) {
    renameSync(backupPath, pkgPath)
    console.log('  Restored package.json')
  }
}

/** 原始 cordis.patch.yml 内容（引用 dsh-plugin-desktop），每次构建从这里恢复 */
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

/** 恢复 cordis.patch.yml 到原始状态（dsh-plugin-desktop 引用） */
function restoreOriginalCordisPatch(): void {
  const patchPath = join(DESKTOP_ROOT, 'cordis.patch.yml')
  writeFileSync(patchPath, ORIGINAL_CORDIS_PATCH, 'utf8')
}

/** 备份并恢复 cordis.patch.yml（构建结束后恢复到原始状态） */
let cordisPatchModified = false

function backupAndApplyCordisPatch(config: Record<string, unknown>): void {
  const identity = config.identity as Record<string, unknown> | undefined
  if (identity === undefined) return
  const packageName = getString(identity, 'packageName')
  if (packageName === undefined || packageName === '') return

  const patchPath = join(DESKTOP_ROOT, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return

  // 先恢复原始内容，再替换为目标包名
  restoreOriginalCordisPatch()
  const content = readFileSync(patchPath, 'utf8')
  const replaced = content.replaceAll('dsh-plugin-desktop', packageName)

  if (replaced !== content) {
    writeFileSync(patchPath, replaced, 'utf8')
    cordisPatchModified = true
    console.log(`  Replaced "dsh-plugin-desktop" → "${packageName}" in cordis.patch.yml`)
  }
}

function restoreCordisPatch(): void {
  if (cordisPatchModified) {
    restoreOriginalCordisPatch()
    cordisPatchModified = false
    console.log('  Restored cordis.patch.yml')
  }
}

/** 源码级环境变量替换（tsdown define 不作用于 code-split chunks） */
const sourceBackup = new Map<string, string>()

const SOURCE_REPLACEMENTS: Array<{ file: string; search: string; envKey: string; fallback: string }> = [
  {
    file: 'src/profile.ts',
    search: "process.env.DSH_SPEC_PACKAGE_NAME || 'dsh-plugin-desktop'",
    envKey: 'DSH_SPEC_PACKAGE_NAME',
    fallback: 'dsh-plugin-desktop',
  },
  {
    file: 'src/desktop-plugins.ts',
    search: "process.env.DSH_SPEC_PACKAGE_NAME || 'dsh-plugin-desktop-spec'",
    envKey: 'DSH_SPEC_PACKAGE_NAME',
    fallback: 'dsh-plugin-desktop-spec',
  },
  {
    file: 'src/main.ts',
    search: "process.env.DSH_SPEC_APPID || 'com.baizhou.dsh.desktop'",
    envKey: 'DSH_SPEC_APPID',
    fallback: 'com.baizhou.dsh.desktop',
  },
  {
    file: 'src/main.ts',
    search: "process.env.DSH_SPEC_PACKAGE_NAME",
    envKey: 'DSH_SPEC_PACKAGE_NAME',
    fallback: '',
  },
]

function applySourceReplacements(): void {
  for (const { file, search, envKey, fallback } of SOURCE_REPLACEMENTS) {
    const filePath = join(DESKTOP_ROOT, file)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf8')
    if (!content.includes(search)) continue

    sourceBackup.set(file, content)
    const value = process.env[envKey] || fallback
    const patched = content.replaceAll(search, JSON.stringify(value))
    writeFileSync(filePath, patched, 'utf8')
    console.log(`  Replaced env in ${file}: ${envKey} → "${value}"`)
  }
}

function restoreSourceReplacements(): void {
  for (const [file, original] of sourceBackup) {
    writeFileSync(join(DESKTOP_ROOT, file), original, 'utf8')
  }
  if (sourceBackup.size > 0) {
    console.log(`  Restored ${sourceBackup.size} source file(s)`)
    sourceBackup.clear()
  }
}

/** 将 spec 自定义 agent presets 复制到 shipped presets 目录，运行时自动发现 */
const customPresetsAdded = new Set<string>() // 已复制的 preset 目录名
const customPresetsBackup = new Map<string, string>() // presetName → backupPath

function applyAgentPresets(specDir: string, config: Record<string, unknown>): void {
  const agentPresets = config.agentPresets as Record<string, unknown> | undefined
  if (agentPresets === undefined) return

  const sourceDir = getString(agentPresets, 'sourceDir')
  if (sourceDir === undefined || sourceDir === '') return

  const sourcePath = resolve(specDir, sourceDir)
  if (!existsSync(sourcePath)) {
    console.warn(`  Warning: agentPresets.sourceDir not found: ${sourcePath}`)
    return
  }

  const presetsDir = findShippedPresetsDir()
  if (presetsDir === undefined) {
    console.warn('  Warning: shipped presets directory not found, skipping custom presets')
    return
  }

  // 扫描 sourceDir 下的子目录，每个子目录即一个 preset
  const entries = readdirSync(sourcePath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const presetName = entry.name
    const presetSource = join(sourcePath, presetName)
    const targetPath = join(presetsDir, presetName)

    // 如果目标目录已存在（如 shipped 同名 preset），先备份
    if (existsSync(targetPath)) {
      const backupPath = join(presetsDir, `._spec_backup_custom_${presetName}`)
      renameSync(targetPath, backupPath)
      customPresetsBackup.set(presetName, backupPath)
    }

    cpSync(presetSource, targetPath, { recursive: true })
    customPresetsAdded.add(presetName)
    console.log(`  Installed custom preset: ${presetName}`)
  }

  if (customPresetsAdded.size === 0) {
    console.log('  No custom presets found in sourceDir')
  }
}

/** 恢复自定义 presets（清理构建时复制的文件，恢复被覆盖的 shipped presets） */
function restoreCustomPresets(): void {
  if (customPresetsAdded.size === 0) return
  const presetsDir = findShippedPresetsDir()
  if (presetsDir === undefined) return

  for (const name of customPresetsAdded) {
    const targetPath = join(presetsDir, name)
    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true })
    }
    // 恢复被覆盖的 shipped preset
    const backupPath = customPresetsBackup.get(name)
    if (backupPath !== undefined && existsSync(backupPath)) {
      renameSync(backupPath, targetPath)
    }
  }
  customPresetsAdded.clear()
  customPresetsBackup.clear()
  console.log('  Restored custom presets')
}

/** 从 node_modules 中移除不需要的 shipped 预设，打包后恢复 */
const removedPresetsBackup = new Map<string, string>() // name → backupPath

function removeShippedPresets(config: Record<string, unknown>): void {
  const agentPresets = config.agentPresets as Record<string, unknown> | undefined
  const removeList = agentPresets?.removeShippedPresets as string[] | undefined
  if (!Array.isArray(removeList) || removeList.length === 0) return

  // 找到 shipped presets 目录
  const presetsDir = findShippedPresetsDir()
  if (presetsDir === undefined) {
    console.warn('  Warning: shipped presets directory not found, skipping preset removal')
    return
  }

  for (const presetName of removeList) {
    const presetPath = join(presetsDir, presetName)
    if (!existsSync(presetPath)) continue

    // 备份到临时目录
    const backupPath = join(presetsDir, `._spec_backup_${presetName}`)
    renameSync(presetPath, backupPath)
    removedPresetsBackup.set(presetName, backupPath)
    console.log(`  Removed shipped preset: ${presetName}`)
  }
}

function restoreShippedPresets(): void {
  if (removedPresetsBackup.size === 0) return
  const presetsDir = findShippedPresetsDir()
  if (presetsDir === undefined) return

  for (const [name, backupPath] of removedPresetsBackup) {
    if (existsSync(backupPath)) {
      renameSync(backupPath, join(presetsDir, name))
    }
  }
  removedPresetsBackup.clear()
  console.log('  Restored shipped presets')
}

function findShippedPresetsDir(): string | undefined {
  try {
    const presetsPackageDir = dirname(require.resolve('@deepseek-ai/dsh-agent-presets/package.json'))
    const presetsDir = join(presetsPackageDir, 'presets')
    return existsSync(presetsDir) ? presetsDir : undefined
  } catch {
    return undefined
  }
}

/** 向 cordis.patch.yml 追加 addBuiltin 插件的 insert 声明 */
function addPluginInserts(config: Record<string, unknown>): void {
  const plugins = config.plugins as Record<string, unknown> | undefined
  const addBuiltin = plugins?.addBuiltin as string[] | undefined
  if (!Array.isArray(addBuiltin) || addBuiltin.length === 0) return

  const patchPath = join(DESKTOP_ROOT, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return

  const lines: string[] = []
  for (const pkgName of addBuiltin) {
    // 格式：短横线后取包名后缀作为 id（如 dsh-better-sidebar → better-sidebar）
    const id = pkgName.replace(/^.*?-/, '') || pkgName
    lines.push(`- insert:`)
    lines.push(`    - id: ${id}`)
    lines.push(`      name: '${pkgName}'`)
    lines.push('')
  }

  const content = readFileSync(patchPath, 'utf8')
  writeFileSync(patchPath, content + lines.join('\n'), 'utf8')
  console.log(`  Added plugin insert entries for: ${addBuiltin.join(', ')}`)
}

/** 将 configspec.plugins.addBuiltin 中声明的插件从本地路径复制到 node_modules */
const builtinPluginsInstalled = new Set<string>()

function applyPlugins(config: Record<string, unknown>): void {
  const plugins = config.plugins as Record<string, unknown> | undefined
  const addBuiltin = plugins?.addBuiltin as string[] | undefined
  if (!Array.isArray(addBuiltin) || addBuiltin.length === 0) return

  console.log('\nApplying builtin plugins:')
  for (const pkgName of addBuiltin) {
    const sourcePath = join(LOCAL_PLUGINS_BASE, pkgName)
    if (!existsSync(sourcePath)) {
      console.warn(`  Warning: builtin plugin source not found: ${sourcePath}, skipping ${pkgName}`)
      continue
    }
    const targetPath = join(DESKTOP_ROOT, 'node_modules', pkgName)
    cpSync(sourcePath, targetPath, { recursive: true })
    builtinPluginsInstalled.add(pkgName)
    console.log(`  Installed builtin plugin: ${pkgName} (from ${sourcePath})`)
  }
}

/** 恢复：删除构建时复制到 node_modules 的内置插件 */
function restorePlugins(): void {
  if (builtinPluginsInstalled.size === 0) return
  for (const pkgName of builtinPluginsInstalled) {
    const targetPath = join(DESKTOP_ROOT, 'node_modules', pkgName)
    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true })
    }
  }
  builtinPluginsInstalled.clear()
  console.log('  Restored builtin plugins')
}

/** 执行构建命令 */
function runBuild(command: string, args: string[]): void {
  console.log(`\nRunning: ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: DESKTOP_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

/** 清理上一次 spec 构建残留的环境变量 */
function cleanupPreviousSpec(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('DSH_SPEC_')) {
      delete process.env[key]
    }
  }
}

/** 列出可用的 spec */
function listAvailableSpecs(): void {
  const specDir = join(DESKTOP_ROOT, '.spec')
  if (!existsSync(specDir)) return
  for (const entry of readdirSync(specDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const configPath = join(specDir, entry.name, 'configspec.yaml')
      if (existsSync(configPath)) {
        console.error(`  - ${entry.name}`)
      }
    }
  }
}

async function main(): Promise<void> {
  const specName = process.argv[2]
  if (specName === undefined || specName === '') {
    console.error('Usage: node scripts/spec-build.ts <spec-name>')
    console.error('Available specs:')
    listAvailableSpecs()
    process.exitCode = 1
    return
  }

  const specDir = join(DESKTOP_ROOT, '.spec', specName)
  if (!existsSync(specDir)) {
    console.error(`Spec directory not found: ${specDir}`)
    process.exitCode = 1
    return
  }

  const packageName = getString(loadConfigspec(specName).identity as Record<string, unknown>, 'packageName')
    ?? 'dsh-plugin-desktop-spec'

  console.log(`\n=== Building spec: ${specName} (${packageName}) ===`)
  cleanupPreviousSpec()

  // 1. 加载配置
  const config = loadConfigspec(specName)
  console.log('\nApplying spec environment:')
  applySpecEnvironment(specName, config)

  // 2. 更新 package.json
  applyPackageJson(config)

  // 3. 恢复原始 cordis.patch.yml 并替换为目标包名
  backupAndApplyCordisPatch(config)

  // 3.5 向 cordis.patch.yml 追加 addBuiltin 插件的 insert 声明
  addPluginInserts(config)

  // 5. 应用品牌资源
  console.log('\nApplying brand assets:')
  applyBrandAssets(specDir, config)

  // 6. 安装自定义 agent presets（在移除 shipped 之前，避免冲突）
  console.log('\nApplying agent presets:')
  applyAgentPresets(specDir, config)

  // 6.5 移除不需要的 shipped 预设
  removeShippedPresets(config)

  // 6.6 安装内置插件到 node_modules（addBuiltin）
  applyPlugins(config)

  // 6.7 源码级环境变量替换（tsdown define 不作用于 code-split chunks）
  applySourceReplacements()

  // 7. 执行构建（直接调用 tsdown 二进制，避免 corepack ENOENT）
  try {
    const tsdownBin = join(dirname(require.resolve('tsdown/package.json')), 'dist', 'run.mjs')
    runBuild(process.execPath, [tsdownBin])
  } finally {
    // 恢复原始文件
    restoreSourceReplacements()
    restoreCustomPresets() // 先清理自定义 presets
    restoreShippedPresets() // 再恢复 shipped presets
    restorePlugins() // 清理内置插件
    restorePackageJson()
    restoreCordisPatch()
  }

  console.log(`\n=== Spec ${specName} build complete ===`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
