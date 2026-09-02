# mcp-client 插件详解

| 属性 | 值 |
| :-- | :-- |
| 包名 | `@deepseek-ai/dsh-mcp-client` |
| 路径 | `packages/mcp/mcp-client/` |
| 描述 | MCP client bridge: 连接 MCP Server 并注册工具到 ctx.tools |

## 文件职责

| 文件 | 职责 |
| :-- | :-- |
| `index.ts` | Cordis 插件入口：apply() + 配置 Schema 验证 + serverName 命名空间预留 |
| `connection.ts` | 连接管理器：startConnection() + 指数退避重连 + 生命周期 |
| `tools.ts` | 工具桥接：syncTools() + publicToolName() + execute() + 图片处理 |
| `transport.ts` | 传输层：stdio (子进程) / streamable-http (SSE) |

## 配置 Schema

```typescript
// stdio 模式
interface StdioConfig {
  transport: 'stdio'
  serverName: string          // 命名空间（32 字符内，唯一）
  command: string             // 启动命令
  args: string[]              // 参数
  env: Record<string, string> // 环境变量
  cwd: string                 // 工作目录
  toolCallTimeoutMs: number   // 调用超时
  failOnStartupError: boolean // 启动失败是否阻断
  reconnect?: ReconnectConfig // 重连策略
}

// streamable-http 模式
interface StreamableHttpConfig {
  transport: 'streamable-http'
  serverName: string
  url: string                 // MCP 端点 URL
  headers: Record<string, string>
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  reconnect?: ReconnectConfig
}
```

## 重连策略

| 参数 | 默认值 | 说明 |
| :-- | :-- | :-- |
| `enabled` | true | 自动重连 |
| `initialDelayMs` | 500 | 首次重连延迟 |
| `maxDelayMs` | 30000 | 最大重连延迟 |
| `maxAttempts` | 10 | 最大重试次数 |

## 工具命名

```
mcp__{serverName}__{rawName}
```
- 最多 64 字符
- 只允许 `[A-Za-z0-9_-]`
- 超长：截断 + SHA-256 哈希后 12 位

## 测试

```bash
cd packages/mcp/mcp-client
pnpm test        # 单元测试
pnpm run build   # 构建
```
