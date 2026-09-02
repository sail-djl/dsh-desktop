# MCP (Model Context Protocol) 集成

> DSH 如何通过 MCP 连接外部系统，让 LLM 调用外部工具。

---

## 一、MCP 是什么

MCP (Model Context Protocol) 是标准化的模型上下文协议，用于连接外部系统。DSH 通过 `@deepseek-ai/dsh-mcp-client` 插件将 MCP Server 的工具注册到 DSH 工具注册表，让 LLM 可以像调用内置工具一样调用外部工具。

---

## 二、架构总览

```
外部 MCP Server (独立进程)
  │ stdio / SSE
  │
MCP Client (SDK: @modelcontextprotocol/sdk)
  │ tools/list + tools/call
  │
dsh-mcp-client 插件 (Cordis Plugin)
  │ ctx.tools.register()
  │
DSH Tool Registry
  │
Agent Loop (LLM 决定调用哪个工具)
  │
模型调用 mcp__{serverName}__{rawName}
  │
dsh-mcp-client executor
  │ callToolUncached (用 rawName)
  │
外部 MCP Server 执行
  │
结果 → ContentBlock 映射 → LLM
```

---

## 三、源码位置

| 文件 | 路径 | 职责 |
| :-- | :-- | :-- |
| `index.ts` | `packages/mcp/mcp-client/src/index.ts` | Cordis 插件入口：apply + 配置验证 |
| `connection.ts` | `packages/mcp/mcp-client/src/connection.ts` | 连接管理：重连 + 生命周期 |
| `tools.ts` | `packages/mcp/mcp-client/src/tools.ts` | 工具桥接：发现 + 注册 + 执行 |
| `transport.ts` | `packages/mcp/mcp-client/src/transport.ts` | 传输层：stdio / streamable-http |
| `package.json` | `packages/mcp/mcp-client/package.json` | 包信息 + 依赖 |

---

## 四、插件配置

### 4.1 stdio 模式（本地进程）

```yaml
# cordis.patch.yml
- insert:
    - id: mcp-redis-production
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: redis                    # 命名空间（必填，32 字符内）
        command: npx                         # 启动命令
        args: ['-y', '@modelcontextprotocol/server-redis']  # 参数
        env:                                 # 环境变量
          REDIS_URL: !!js process.env.REDIS_URL || 'redis://192.168.1.98:6379'
        cwd: ''                              # 工作目录
        toolCallTimeoutMs: 60000             # 单次调用超时 (ms)
        failOnStartupError: false            # 启动失败是否阻断
        reconnect:                           # 重连策略
          enabled: true
          initialDelayMs: 500
          maxDelayMs: 30000
          maxAttempts: 10
```

### 4.2 Streamable HTTP 模式（远程服务）

```yaml
- insert:
    - id: mcp-remote-api
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: streamable-http
        serverName: remote-api
        url: https://mcp-server.company.com/sse
        headers:
          Authorization: Bearer ${MCP_TOKEN}
        toolCallTimeoutMs: 120000
        failOnStartupError: true
        reconnect:
          enabled: true
          initialDelayMs: 1000
          maxDelayMs: 60000
          maxAttempts: 5
```

### 4.3 多 Server 配置

```yaml
# 同时连接多个 MCP Server
- insert:
    - id: mcp-gitlab
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: gitlab
        command: npx
        args: ['-y', '@modelcontextprotocol/server-gitlab']
        env:
          GITLAB_TOKEN: ${GITLAB_TOKEN}
          GITLAB_API_URL: https://gitlab.company.com/api/v4

- insert:
    - id: mcp-redis
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: redis
        command: npx
        args: ['-y', '@modelcontextprotocol/server-redis']
        env:
          REDIS_URL: redis://192.168.1.98:6379

- insert:
    - id: mcp-filesystem
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: fs
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
```

---

## 五、工具命名规则

```
MCP Server 原始名: get_key
Server Name: redis
公开名: mcp__redis__get_key    ← 模型看到的工具名
```

**规则：**
- 格式：`mcp__{serverName}__{rawName}`
- 限制：最多 64 字符，只允许 `[A-Za-z0-9_-]`
- 超长：截断 + SHA-256 哈希后 12 位
- 命名空间：每个 serverName 必须唯一（重复会报错）

**示例：**

| serverName | rawName | 公开名 |
| :-- | :-- | :-- |
| redis | get_key | `mcp__redis__get_key` |
| gitlab | create_merge_request | `mcp__gitlab__create_merge_request` |
| fs | read_file | `mcp__fs__read_file` |

---

## 六、连接生命周期

### 6.1 启动流程

```
apply(ctx, config)
  │
  ├─ 1. 解析重连策略 (resolveReconnectPolicy)
  ├─ 2. 预留 serverName 命名空间 (防重名)
  ├─ 3. startConnection(ctx, config, reconnect)
  │      ├─ createTransport(config)     ← 创建传输层
  │      ├─ new Client()                ← MCP SDK 客户端
  │      ├─ client.connect(transport)   ← 连接 MCP Server
  │      └─ enqueueSync(client, ctx)    ← 同步工具列表
  └─ 4. 等待 ready (初始连接 + 工具发现)
```

### 6.2 重连策略

```
连接断开
  │
  ├─ failedAttempts++
  ├─ delayMs = min(maxDelay, initialDelay * 2^(attempts-1))
  ├─ 等待 delayMs
  ├─ 重新 connectGeneration()
  │
  └─ 超过 maxAttempts → 放弃，注销所有工具
```

默认值：
- `initialDelayMs`: 500ms
- `maxDelayMs`: 30000ms (30s)
- `maxAttempts`: 10 次
- 稳定窗口：连接存活超过 `maxDelayMs` 后重置失败计数

### 6.3 工具列表变化

```
MCP Server 通知 tools/list changed
  │
  └─ enqueueSync() → 重新 fetch + swap 工具列表
```

### 6.4 销毁

```
dispose()
  ├─ 停止重连定时器
  ├─ 关闭 MCP Client
  ├─ 等待 in-flight 操作完成
  └─ 注销所有工具
```

---

## 七、工具桥接 (syncTools)

两阶段安全交换：

```
Phase 1: Fetch (不触碰注册表)
  ├─ tools/list 分页获取所有 MCP 工具
  ├─ 构建 ToolDefinition (公开名 + 参数 + 执行器)
  └─ 失败 → 拒绝，保留上一代工具

Phase 2: Swap (交换注册表)
  ├─ dispose 上一代工具
  ├─ register 新一代工具
  └─ 冲突 → 回滚（该 server 的工具全部注销）
```

---

## 八、工具执行流程

```
LLM 调用 mcp__redis__get_key
  │
  ├─ Agent Loop 解析公开名
  ├─ 查找 ToolDefinition
  ├─ 调用 execute(args, exec)
  │      ├─ callToolUncached(client, 'get_key', args, exec, opts)
  │      │    └─ client.request({ method: 'tools/call', params: { name: 'get_key', arguments: args } })
  │      ├─ 结果验证 (RawCallToolResultSchema)
  │      ├─ isError → throw Error
  │      └─ 内容映射 → McpResult { content: ContentBlock[] }
  └─ 结果返回给 LLM
```

---

## 九、配置参数速查

| 参数 | 类型 | 默认值 | 说明 |
| :-- | :-- | :-- | :-- |
| `transport` | `'stdio'` / `'streamable-http'` | 必填 | 传输方式 |
| `serverName` | string | 必填 | 命名空间（32 字符内，唯一） |
| `command` | string | stdio 必填 | 启动命令 |
| `args` | string[] | `[]` | 命令参数 |
| `env` | Record | `{}` | 环境变量 |
| `cwd` | string | `''` | 工作目录 |
| `url` | string | http 必填 | MCP 端点 URL |
| `headers` | Record | `{}` | HTTP 头 |
| `toolCallTimeoutMs` | number | 60000 | 单次调用超时 |
| `failOnStartupError` | boolean | false | 启动失败是否阻断 |
| `reconnect.enabled` | boolean | true | 自动重连 |
| `reconnect.initialDelayMs` | number | 500 | 首次重连延迟 |
| `reconnect.maxDelayMs` | number | 30000 | 最大重连延迟 |
| `reconnect.maxAttempts` | number | 10 | 最大重试次数 |

---

## 十、与 DSH 其他层的关系

| 层 | 关系 |
| :-- | :-- |
| **cordis.patch.yml** | 声明 MCP Server（insert mcp-client 插件） |
| **Cordis** | 插件生命周期管理（activate → active → dispose） |
| **ctx.tools** | MCP 工具注册到 DSH 工具注册表 |
| **Agent Loop** | LLM 调用 MCP 工具时经过 Tool Runtime |
| **permission-presets** | 可拦截 MCP 工具调用（tools/* 事件） |
| **token-meter** | MCP 工具调用不计入 token（外部执行） |
| **session** | MCP 工具调用结果记录到 SessionEvent |

---

## 十一、安全考虑

| 关注点 | 说明 |
| :-- | :-- |
| 命名空间隔离 | 每个 serverName 唯一，防止工具名冲突 |
| 信任边界 | MCP 返回的内容经过 JSON Schema 验证 |
| 超时控制 | 每次调用有独立超时，防止阻塞 |
| 重连限制 | 有最大重试次数，防止无限重连 |
| 图片处理 | MCP 返回的图片需经模型能力验证才注入 |
| 环境变量 | 敏感信息通过 env 传入，不硬编码在配置中 |
