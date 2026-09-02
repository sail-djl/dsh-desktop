# DeepSeek Harness Web 架构

## 一、Host-Client 双聚合

### 1.1 Host 端（服务端）

| 包 | ctx key | 职责 |
|:--|:--|:--|
| `host/apiproxy` | `ctx.apiProxy` | 传输无关的 API 网关 |
| `host/webserver` | `ctx.webServer` | HTTP 路由载体 |
| `host/frontend-static` | — | SPA dist 服务器 |
| `host/directory-picker` | `ctx.directoryPicker` | 工作区目录选择 |

### 1.2 Client 端（浏览器）

| 包 | 职责 |
|:--|:--|
| `client/web` | 浏览器 shell 启动 |
| `client/connection` | browser-host RPC 通信和事件投递 |
| `client/modules` | 加载浏览器端 client 模块 |
| `client/runtime` | 共享 client 服务 |
| `client/hmr` | 热模块替换 |
| 40+ `ui-*` 插件包 | 通过 Slot 系统组合的 UI 组件 |

### 1.3 通信机制

```
Browser (Client)                    Server (Host)
┌─────────────┐                    ┌─────────────┐
│  Connection  │ ◄── WebSocket ──► │  API Proxy  │
│  Controller  │    JSON-RPC       │  (Gateway)  │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
  ┌────▼────┐                        ┌────▼────┐
  │ Session │                        │ Session │
  │ Manager │                        │  Store  │
  └─────────┘                        └─────────┘
```

---

## 二、Slot 系统

### 2.1 核心 API

```typescript
ctx.slots.register({ name, children?, store?, inject? }, Component)
```

- `name` — Slot 名称（唯一标识）
- `children` — 声明 + 授权
- `store` — 共享状态
- `inject` — 注入的服务

### 2.2 Props 四种 share

| Share | 说明 |
|:--|:--|
| `PropsRuntime` | 运行时共享属性 |
| `PropsRenderSlots` | 渲染 Slot 共享 |
| `PropsStore` | Store 共享 |
| `inject face` | 注入服务的接口 |

---

## 三、三层架构

### 3.1 Data Object Layer（runtime, React-free）

```
ConnectionController -> SessionManager -> Session
```

- 纯 TypeScript，不依赖 React
- 管理 WebSocket 连接、会话状态、事件路由

### 3.2 Render Machinery（ui-renderer）

- ctx-to-React 集成层
- 将 Cordis context 事件转换为 React 组件更新
- 管理 Slot 树的渲染

### 3.3 Presentation Components（plugin packages）

- 纯 props 消费者
- 每个 `ui-*` 插件包提供特定 UI 功能
- 通过 Slot 系统注册到 UI 树

---

## 四、关键 UI 插件

| 插件 | 职责 |
|:--|:--|
| `ui-conversation` | 对话界面 |
| `ui-trajectory` | Trajectory 视图（可追溯性） |
| `ui-renderer` | 渲染引擎 |
| `ui-workspace` | 工作区管理 |
| `ui-settings` | 设置面板 |
| `ui-theme` | 主题系统 |
| `ui-primitives` | 基础 UI 组件（Button, Modal, Tooltip 等） |
| `ui-tool` | 工具调用展示 |
| `ui-attachment` | 附件管理 |
| `ui-user-questions` | 用户问题交互 |
| `ui-input-trigger` | 输入触发器 |
| `ui-settings-models` | 模型设置 |
| `ui-settings-plugins` | 插件设置 |
| `ui-directory-picker` | 目录选择器 |

---

## 五、Web 构建

### 5.1 构建命令

```bash
pnpm run build:web    # 仅构建 Web 前端
pnpm run build        # 完整构建（含 Host + Client + Web）
```

### 5.2 Vite 配置

- `apps/web/vite.config.ts` — Web UI 构建配置
- 使用 Vite 6.4.3+
- 输出到 `apps/web/dist/`

### 5.3 静态资源

- `apps/web/public/` — favicon 等静态资源
- `packages/ui/` — UI 组件库的 CSS 模块和字体
