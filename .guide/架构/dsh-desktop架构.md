# DSH Desktop 架构

> 基于 Electron + Cordis 微内核的 AI Agent 桌面客户端

---

## 一、架构总览

```
dsh-desktop/
│
├── deepseek-harness/        ← Agent 框架核心（git submodule）
│   ├── packages/            ← 50+ 能力包（LLM/Shell/FS/Sandbox/Session...）
│   ├── apps/cli/            ← CLI 入口
│   ├── apps/web/            ← Web 前端
│   ├── vendor/              ← Cordis 微内核
│   └── docs/                ← 架构文档
│
├── dsh-plugin-desktop/      ← ⭐ Electron 主插件
│   ├── src/main/            ← Electron 主进程
│   │   ├── main.ts          ← Electron 入口
│   │   ├── runtime.ts       ← Cordis 运行时集成
│   │   ├── profile*.ts      ← Profile 管理（多用户配置）
│   │   ├── desktop-*.ts     ← 桌面功能（网络/日志/插件/终端...）
│   │   ├── window-*.ts      ← 窗口管理
│   │   ├── update-*.ts      ← 自动更新
│   │   └── lan-*.ts         ← 局域网访问
│   │
│   ├── src/client/          ← 渲染进程 UI
│   │   ├── index.ts         ← 入口
│   │   ├── contracts.ts     ← IPC 契约定义
│   │   ├── desktop-settings*.ts  ← 设置 UI
│   │   └── layout-*.ts      ← 布局服务
│   │
│   ├── src/native-ui/       ← 原生弹窗 UI
│   │   ├── desktop-dialog/  ← 确认对话框
│   │   ├── profile-create/  ← 创建 Profile
│   │   ├── profile-selector/← Profile 选择器
│   │   ├── setup-wizard/    ← 首次启动向导
│   │   ├── recovery/        ← 恢复窗口
│   │   └── components/ui/   ← shadcn 组件库
│   │
│   ├── cordis.patch.yml     ← Cordis 插件树配置
│   └── tests/               ← 100+ 测试文件
│
├── dsh-community-market/    ← 插件市场
│   ├── src/catalog/         ← 插件目录服务
│   ├── src/install/         ← 插件安装（GitHub/手动）
│   └── src/media/           ← 媒体资源管理
│
└── dsh-plugin-desktop-beta/ ← Beta 版本（实验特性）
```

---

## 二、Electron 进程架构

```
┌─────────────────────────────────────────────────┐
│                  Main Process                    │
│  (dsh-plugin-desktop/src/main/)                 │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Cordis      │  │ Electron    │               │
│  │ Runtime     │  │ App         │               │
│  │ (plugin)    │  │ (lifecycle) │               │
│  └──────┬──────┘  └──────┬──────┘               │
│         │                │                       │
│  ┌──────▼────────────────▼──────┐               │
│  │     Profile Manager          │               │
│  │  (多用户配置 / 插件树加载)    │               │
│  └──────────────┬───────────────┘               │
│                 │                                │
│  ┌──────────────▼───────────────┐               │
│  │  WebServer + API Proxy       │               │
│  │  (localhost HTTP 服务)        │               │
│  └──────────────┬───────────────┘               │
└─────────────────┼───────────────────────────────┘
                  │ IPC / HTTP
┌─────────────────▼───────────────────────────────┐
│              Renderer Process                    │
│  (dsh-plugin-desktop/src/client/)               │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ React App   │  │ Native UI   │               │
│  │ (Web 前端)  │  │ (弹窗窗口)  │               │
│  └─────────────┘  └─────────────┘               │
└─────────────────────────────────────────────────┘
```

---

## 三、核心模块

### 3.1 Profile 系统

Profile 是命名的插件组合，支持多用户/多环境配置：

```
~/.dsh/profiles/<name>/
├── package.json          ← 声明 bundles + 依赖
├── cordis.patch.yml      ← Profile 级覆盖
└── ...
```

关键文件：
- [profile.ts](../dsh-plugin-desktop/src/main/profile.ts) — Profile 定义
- [profiles.ts](../dsh-plugin-desktop/src/main/profiles.ts) — Profile 管理
- [profile-manager.ts](../dsh-plugin-desktop/src/main/profile-manager.ts) — Profile 生命周期
- [profile-service.ts](../dsh-plugin-desktop/src/main/profile-service.ts) — Profile 服务

### 3.2 窗口管理

| 窗口 | 说明 | 文件 |
|:--|:--|:--|
| 主窗口 | Agent 对话主界面 | main-window-state.ts |
| 设置窗口 | 桌面设置 | desktop-settings-route.ts |
| Profile 选择 | 多 Profile 切换 | profile-selection-window.ts |
| Profile 创建 | 新建 Profile | profile-create-window.ts |
| 向导窗口 | 首次启动引导 | setup-wizard-window.ts |
| 恢复窗口 | 异常恢复 | startup-recovery-window.ts |
| 目录选择 | 工作区目录 | directory-picker-route.ts |

### 3.3 IPC 通信

主进程与渲染进程通过 `contracts.ts` 定义的类型化 IPC 通信：

- `src/main/` — 主进程 handlers
- `src/client/contracts.ts` — 共享类型定义
- `src/client/index.ts` — 客户端 IPC 调用

### 3.4 插件市场

`dsh-community-market` 提供插件发现、安装、管理能力：
- GitHub API 集成（自动安装）
- 手动安装支持
- 插件目录查询
- 媒体资源管理

---

## 四、构建流程

```
                    ┌─────────────────┐
                    │ yarn install    │
                    │ (workspace)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼────────┐ ┌──▼──────────┐ ┌▼──────────────┐
    │ dsh-plugin-       │ │ dsh-community│ │ deepseek-     │
    │ desktop build     │ │ market build │ │ harness build │
    │ (tsdown+vite+tsc) │ │ (tsdown)    │ │ (pnpm build)  │
    └─────────┬────────┘ └──┬──────────┘ └┬──────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │ electron-builder│
                    │ (打包为桌面应用) │
                    └─────────────────┘
```

dsh-plugin-desktop 构建步骤：
1. `node scripts/generate-*.mjs` — 生成图标资源
2. `tsdown` — 编译主进程 TS → JS
3. `vite build --config vite.native-ui.config.ts` — 构建原生 UI
4. `tsc --emitDeclarationOnly` — 生成类型声明

---

## 五、Cordis 插件树

`cordis.patch.yml` 定义了桌面端的插件挂载配置，覆盖或扩展 deepseek-harness 的默认插件树。

关键插件层级：
1. **dsh-base** — 核心基础层（Agent/Session/Tools/LLM）
2. **dsh-web-app** — Web UI 层（Client/Connection/渲染）
3. **dsh-plugin-desktop** — 桌面特有层（Electron 集成/Profile/窗口/更新）

---

## 六、关键数据流

```
用户输入 → Renderer (React)
         → IPC → Main Process (Cordis Runtime)
         → Agent Loop (dsh-agent-loop)
         → LLM 调用 (dsh-llm-deepseek)
         → Tool 执行 (dsh-tools / dsh-shell / dsh-fs)
         → Session 日志 (dsh-session)
         → 响应 → Renderer (React UI)
```

---

## 七、文档索引

| 内容 | 路径 |
|:--|:--|
| 项目概述 | [1 开始.md](../1 开始.md) |
| 本地启动 | [本地启动.md](../本地启动.md) |
| DSH 核心架构 | [deepseek-harness/.guide/架构/1 整体架构.md](../../deepseek-harness/.guide/架构/1 整体架构.md) |
| 产品架构文档 | [docs/architecture.md](../../docs/architecture.md) |
| 插件开发 | [docs/plugin-development.md](../../docs/plugin-development.md) |
| 用户指南 | [docs/user-guide.md](../../docs/user-guide.md) |
