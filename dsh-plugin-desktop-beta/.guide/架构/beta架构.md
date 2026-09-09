# DSH Desktop Beta 架构

> Electron + Cordis 微内核的 AI Agent 桌面客户端（Beta 版）

---

## 一、Electron 进程架构

```
┌─────────────────────────────────────────────────────┐
│                  Main Process                        │
│  (src/main/)                                        │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                 │
│  │ bin.ts      │  │ main.ts      │                 │
│  │ (CLI 入口)  │→ │ (Electron    │                 │
│  │             │  │  App 入口)   │                 │
│  └─────────────┘  └──────┬───────┘                 │
│                          │                          │
│  ┌───────────────────────▼────────────────────┐    │
│  │           Cordis Runtime (runtime.ts)       │    │
│  │  ┌──────────────────────────────────┐      │    │
│  │  │ Profile Manager                  │      │    │
│  │  │ (profile-manager.ts)             │      │    │
│  │  │ → 加载 cordis.patch.yml          │      │    │
│  │  │ → 挂载 dsh-base + dsh-web-app   │      │    │
│  │  │ → 插入 desktop layer             │      │    │
│  │  └──────────────────────────────────┘      │    │
│  └───────────────────────┬────────────────────┘    │
│                          │                          │
│  ┌───────────────────────▼────────────────────┐    │
│  │  Host Services                             │    │
│  │  ├─ webserver (HTTP + WebSocket)           │    │
│  │  ├─ apiproxy (API Gateway)                 │    │
│  │  ├─ desktop-shell (窗口/生命周期)           │    │
│  │  ├─ desktop-profiles (Profile 管理)         │    │
│  │  ├─ desktop-terminal (原生终端)             │    │
│  │  ├─ desktop-pnpm (包管理器能力)             │    │
│  │  ├─ desktop-updates (自动更新)              │    │
│  │  └─ desktop-diagnostics (诊断)             │    │
│  └───────────────────────┬────────────────────┘    │
└──────────────────────────┼─────────────────────────┘
                           │ IPC / HTTP
┌──────────────────────────▼─────────────────────────┐
│              Renderer Process                        │
│  (src/client/ + src/native-ui/)                     │
│                                                     │
│  ┌─────────────────┐  ┌──────────────────┐         │
│  │ Client Module   │  │ Native UI Windows│         │
│  │ (React SPA)     │  │ (弹窗/向导)      │         │
│  │ ├─ layout       │  │ ├─ setup-wizard  │         │
│  │ ├─ sidebar      │  │ ├─ profile-*     │         │
│  │ ├─ conversation │  │ ├─ recovery      │         │
│  │ └─ settings     │  │ └─ desktop-dialog│         │
│  └─────────────────┘  └──────────────────┘         │
└────────────────────────────────────────────────────┘
```

---

## 二、Cordis 插件树

`cordis.patch.yml` 定义了 Beta 版的插件挂载配置：

```yaml
# 插入 desktop 层到 dsh-base + dsh-web-app 之后
- insert:
    - id: desktop-shell        # 核心桌面 shell（窗口/导航/生命周期）
    - id: desktop-terminal     # 原生终端（Linux 禁用）
    - id: desktop-diagnostics  # 诊断导出
    - id: desktop-notifications # 系统通知
    - id: desktop-pnpm         # 包管理器能力
    - id: desktop-profiles     # Profile 管理
    - id: desktop-updates      # 自动更新

# 覆盖 web-runtime 配置
- id: web-runtime
  config:
    openBrowser: false    # Electron 不打开外部浏览器
    printUrl: false       # 不打印 URL
    surfaceContext: true  # 启用 surface context
    trustedHosts: []      # 无受信主机（loopback only）
```

---

## 三、三种显示模式

```
┌──────────────────────────────────────────────┐
│ dsh-desktop.mode 设置                        │
│                                              │
│  compatibility (默认)    extended             │
│  ┌────────────────┐    ┌────────────────┐   │
│  │ Desktop Frame  │    │ 独立窗口        │   │
│  │ ┌────────────┐ │    │ 自定义 layout   │   │
│  │ │ 官方 Web   │ │    │ sidebar surface │   │
│  │ │ UI 保持不变│ │    │ 官方组件复用    │   │
│  │ └────────────┘ │    └────────────────┘   │
│  └────────────────┘                          │
│                                              │
│  advanced                                     │
│  ┌────────────────┐                          │
│  │ 独立 root      │                          │
│  │ 紧凑 caption   │                          │
│  │ 增强内部布局    │                          │
│  └────────────────┘                          │
│                                              │
│  Linux: 仅支持 compatibility                  │
└──────────────────────────────────────────────┘
```

模式配置存储在 `~/.dsh/settings.yaml`：

```yaml
dsh-desktop:
  mode: compatibility  # compatibility | extended | advanced
  macosMaterial: transparent  # off | transparent
  windowsMaterial: acrylic    # off | acrylic | mica
```

---

## 四、Profile 系统

Profile 是命名的插件组合，支持多用户/多环境：

```
~/.dsh/profiles/<name>/
├── package.json          ← 声明 bundles + 依赖
├── cordis.patch.yml      ← Profile 级覆盖
└── ...
```

### 启动流程

```
bin.ts → main.ts → Profile Manager
  → 发现 profiles/
  → 选择激活 profile
  → 加载 dsh-base bundle
  → 加载 dsh-web-app bundle
  → 插入 desktop layer (仅当前 generation)
  → Cordis boot
  → 创建 BrowserWindow
```

### 检查点与恢复

- 三次健康启动写入轮转 checkpoint
- 检查点包含：profile 声明、patch 文件、settings.yaml
- 恢复时打开恢复窗口，用户选择槽位
- 凭据、sessions、storage **不会** 写入 checkpoint

---

## 五、构建流程

```
                    ┌─────────────────┐
                    │ yarn install    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼───────┐ ┌───▼───────┐ ┌───▼──────────┐
    │ generate icons  │ │ clean     │ │ prepare:     │
    │ (mac/tray)      │ │           │ │ electron-    │
    │                 │ │           │ │ native       │
    └─────────┬───────┘ └───┬───────┘ └───┬──────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │    tsdown       │
                    │ (主进程编译)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼───────┐ ┌───▼───────┐ ┌───▼──────────┐
    │ vite build      │ │ tsc       │ │ tsc          │
    │ (native-ui)     │ │ (主进程   │ │ (client      │
    │                 │ │  声明)    │ │  声明)       │
    └─────────────────┘ └───────────┘ └──────────────┘
```

---

## 六、关键模块

| 模块 | 文件 | 说明 |
|:--|:--|:--|
| Electron 入口 | main.ts | 应用启动、窗口创建 |
| CLI 入口 | bin.ts | 命令行参数解析 |
| 运行时 | runtime.ts | Cordis runtime 集成 |
| Profile 管理 | profile-manager.ts | Profile 生命周期 |
| 窗口管理 | window-options.ts, main-window-state.ts | BrowserWindow 配置 |
| 自动更新 | update-checker.ts, update-download.ts | Beta 通道更新 |
| 局域网 | lan-addresses.ts, lan-https-*.ts | LAN 访问 |
| 原生终端 | desktop-terminal.ts, terminal.ts | 终端集成 |
| 包管理 | pnpm.ts | 内置 pnpm 能力 |
| 诊断 | diagnostics.ts, diagnostic-export.ts | 诊断导出 |

---

## 七、文档索引

| 内容 | 路径 |
|:--|:--|
| 项目概述 | [1 开始.md](../1 开始.md) |
| 本地启动 | [本地启动.md](../本地启动.md) |
| 插件服务架构 | [docs/plugin-services.zh.md](../docs/plugin-services.zh.md) |
| 稳定版架构 | [dsh-plugin-desktop 架构](../../dsh-plugin-desktop/.guide/架构/dsh-desktop架构.md) |
| DSH 核心架构 | [deepseek-harness 架构](../../deepseek-harness/.guide/架构/1 整体架构.md) |
| 根 monorepo | [dsh-desktop 架构](../../dsh-desktop/.guide/架构/dsh-desktop架构.md) |
