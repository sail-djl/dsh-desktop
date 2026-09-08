# Spec 打包指南

> 基于 `dsh-plugin-desktop` 全量复制的多规格化版本，通过 configspec.yaml 支持多品牌/多身份独立打包。

## 架构概览

```
dsh-plugin-desktop-spec/
├── .spec/
│   ├── code/configspec.yaml    # Code 版配置（开发岗）
│   └── work/configspec.yaml    # Work 版配置（产品岗）
├── scripts/
│   ├── spec-build.ts           # 构建脚本（tsdown 编译）
│   ├── spec-dist.ts            # 打包脚本（electron-builder）
│   ├── gen-spec-icons.py       # 托盘图标生成
│   └── noop-after-pack.ts      # 空 afterPack 钩子
└── tsdown.config.ts            # 构建配置（define 注入环境变量）
```

## 两个 Spec 变体

| 项目 | Code 版 | Work 版 |
|:--|:--|:--|
| **appId** | `ai.deepseek.dsh.code.desktop` | `ai.deepseek.dsh.work.desktop` |
| **productName** | `百洲DSH Code` | `百洲DSH Work` |
| **shortcutName** | `百洲 DSH Code` | `百洲 DSH Work` |
| **packageName** | `dsh-plugin-desktop-code` | `dsh-plugin-desktop-work` |
| **NSIS 产物** | `Baizhou-DSH-Code-${version}-x64-Setup.exe` | `Baizhou-DSH-Work-${version}-x64-Setup.exe` |
| **exe 文件名** | `百洲DSH Code.exe` | `百洲DSH Work.exe` |
| **AUMID** | `ai.deepseek.dsh.code.desktop` | `ai.deepseek.dsh.work.desktop` |
| **Electron userData** | `%APPDATA%\ai.deepseek.dsh.code.desktop\` | `%APPDATA%\ai.deepseek.dsh.work.desktop\` |
| **品牌色** | 薰衣草紫 `(230,215,255)` | 纯白 `(255,255,255)` |
| **移除预设** | minimal, cordis | minimal, cordis, bzcode, bzcode-haiyu, bzcode-shuili |

## configspec.yaml 字段说明

```yaml
identity:
  appId: "ai.deepseek.dsh.code.desktop"      # Electron appId（AUMID）
  productName: "百洲DSH Code"                 # 显示名称
  shortcutName: "百洲 DSH Code"               # 快捷方式名称
  packageName: "dsh-plugin-desktop-code"      # npm 包名
  artifactName: "Baizhou-DSH-Code-${version}-${arch}-Setup.${ext}"

brand:
  appIcon: "app-icon.png"                     # spec 目录下的图标文件
  trayIcons: "build"                          # 托盘图标目录（构建时复制到 build/）

agentPresets:
  removeShippedPresets:                       # 构建时移除的预设目录
    - minimal
    - cordis
```

## 构建流程

### 原理

`spec-build.ts` 和 `spec-dist.ts` 在构建前临时修改文件，构建后恢复：

1. 读取 `configspec.yaml` → 设置环境变量 `DSH_SPEC_*`
2. 临时修改 `package.json`（name、productName、appId）
3. 临时替换 `cordis.patch.yml` 中的包名引用
4. 复制品牌图标到 `build/`
5. 移除指定的 agent presets
6. 执行 tsdown / electron-builder
7. **恢复所有修改的文件**（try/finally 保护）

### AUMID 注入机制

`tsdown.config.ts` 中的 `define` 配置在构建时将 `process.env.DSH_SPEC_APPID` 替换为字面量：

```ts
// main.ts 源码
const specAppId = process.env.DSH_SPEC_APPID
if (specAppId && app.isPackaged) app.setAppUserModelId(specAppId)

// 构建后 → lib/main.js（Code 版）
const specAppId = "ai.deepseek.dsh.code.desktop";
```

> **注意**：`define` 必须同时配置在 `main` entry（node 平台）和 `client` entry（browser 平台），否则环境变量不会被内联。

## 打包步骤

### 前置条件

- Node.js `^22.19.0 || >=24.0.0`
- corepack 启用（`corepack enable`）
- 根目录已 `yarn install`

### 快捷打包（推荐）

```bash
cd E:\baizhoucode\companyagent\dsh-desktop\dsh-plugin-desktop-spec

# 打包 Code 版
node scripts/spec-build.ts code
node scripts/spec-dist.ts code

# 打包 Work 版
node scripts/spec-build.ts work
node scripts/spec-dist.ts work
```

### 完整打包流程

```bash
# 1. 在根目录 dsh-desktop/ 下
cd E:\baizhoucode\companyagent\dsh-desktop

# 2. 安装依赖
yarn install

# 3. 进入 spec 目录
cd dsh-plugin-desktop-spec

# 4. 构建 + 打包（以 Code 为例）
node scripts/spec-build.ts code    # tsdown 编译
node scripts/spec-dist.ts code     # electron-builder 打包
```

### 产物位置

```
dsh-plugin-desktop-spec/dist/
├── Baizhou-DSH-Code-2.0.5-x64-Setup.exe      # Code 版安装器
├── Baizhou-DSH-Work-2.0.5-x64-Setup.exe      # Work 版安装器
├── win-unpacked/                               # 免安装版
├── builder-effective-config.yaml
└── latest.yml
```

## 共存隔离机制

| 隔离维度 | 机制 | 效果 |
|:--|:--|:--|
| **appId / AUMID** | configspec.yaml → `setAppUserModelId()` | 任务栏独立显示，不合并 |
| **userData** | configspec.yaml → `app.setPath('userData', ...)` | 配置/缓存独立 |
| **安装目录** | electron-builder → productName | `Program Files\百洲DSH Code\` vs `百洲DSH Work\` |
| **包名** | cordis.patch.yml 自动替换 | Cordis 插件加载独立 |
| **agent presets** | removeShippedPresets | 预设列表独立 |

## spec 独有文件

以下文件仅存在于 spec，更新 DSH 时不需要同步：

| 文件 | 用途 |
|:--|:--|
| `.spec/code/configspec.yaml` | Code 版配置 |
| `.spec/work/configspec.yaml` | Work 版配置 |
| `scripts/spec-build.ts` | 构建脚本 |
| `scripts/spec-dist.ts` | 打包脚本 |
| `scripts/gen-spec-icons.py` | 托盘图标生成 |
| `scripts/noop-after-pack.ts` | 空 afterPack 钩子 |

## 后续定制入口

| 定制目标 | 改哪里 |
|:--|:--|
| 新增 Spec 变体 | 创建 `.spec/{name}/configspec.yaml` + 品牌图标 |
| 换品牌图标 | `.spec/{name}/app-icon.png`（1024x1024） |
| 换托盘图标 | 运行 `py scripts/gen-spec-icons.py` 从 app-icon 生成 |
| 调整移除预设 | configspec.yaml 的 `agentPresets.removeShippedPresets` |
| 内置插件 | `package.json` 的 `dependencies` |
| 版本号 | `package.json` 的 `version` 字段 |
| DSH 依赖版本 | 参考 `.guide/dsh更新/dsh更新.md` |
