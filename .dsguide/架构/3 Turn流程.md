# DeepSeek Harness Turn 流程

## 一、层级关系

```
Round（策略迭代）
  └── Turn（一次输入消耗）
        └── Step（一次模型请求 + 工具执行）
```

- **Round**：策略迭代的最高层级
- **Turn**：一次用户输入的完整处理周期
- **Step**：一次模型请求 + 工具执行

---

## 二、完整 Turn 流程

```
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                   reject | enter(messages)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

---

## 三、阶段详解

### 3.1 Turn Start

- 打开 Turn 边界
- 从 Inbox claim 消息（next-turn 和 next-step 两个有序列表）
- 组装 prompt sections + tool schemas

### 3.2 agent/pre-step（waterfall）

- **权威决策点**
- listener 可以重写 claimed 消息
- listener 可以拒绝消息（reject）
- 空的 first claim 仍会关闭 turn（记录尝试）

### 3.3 Step Start

- 将 claimed 消息追加为 `user/message`
- 从日志派生模型历史（`deriveMessages()`）
- `agent/request` -> `llm/stream` -> `assistant/chunk*` -> `assistant/message`

### 3.4 工具执行

```
tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
```

- 多个工具可以并行执行
- 每个工具调用都通过 waterfall 管线
- 工具结果写入日志

### 3.5 Step End

- 如果工具要求另一次请求，或 next-step input 到达 -> claim -> next step
- 否则关闭 Step

### 3.6 Turn End

- `agent/turn-stopping`（serial）
- 关闭 Turn 边界

---

## 四、关键设计

### 4.1 Input 通过 Inbox 到达 Driver

两个有序列表：
- `next-turn`：等待下一个 Turn 的消息
- `next-step`：等待当前 Turn 下一个 Step 的消息

### 4.2 模型可见 = 已记录

任何到达模型请求的内容必须可从日志重建。这是核心不变量：
- 新的模型可见输入需要新的 session event
- 扩展 `SessionEventMap` 并从日志渲染

### 4.3 持久化事件

以下事件是持久化 session 事件：
- `turn/*`, `step/*`
- `user/message`
- `assistant/*`
- `tool/*`

以下事件是实时扩展点（不持久化）：
- `agent/pre-step`
- `agent/request`
- `llm/stream`
- `tools/*`

### 4.4 Waterfall 语义

`agent/pre-step`、`agent/request`、`llm/stream`、`tools/*` 都是 waterfall：
- listener 收到 `(...args, next)`
- 调用 `next()` 委托给下一个 listener
- 返回而不调用 `next()` 则短路链

### 4.5 Turn Stopping

`agent/turn-stopping` 是 serial 模式：
- 没有 `next()`
- 按注册顺序执行
- 用于 Turn 即将关闭前的最后处理

---

## 五、数据流

```
用户输入
  │
  ▼
┌─────────────┐
│   Inbox     │
│ next-turn   │
│ next-step   │
└──────┬──────┘
       │ claim
       ▼
┌─────────────┐
│ agent/pre-  │ ← waterfall（可拒绝/重写）
│   step      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  step/start │
│  组装 prompt │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│agent/request│ ← waterfall（可替换配置）
│  llm/stream │ ← waterfall（可拦截流式输出）
│assistant/*  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  tool/call  │
│  tools/*    │ ← waterfall（可拦截工具执行）
│  tool/result│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  step/end   │
│  是否需要    │
│  下一个Step? │
└──────┬──────┘
       │ 否
       ▼
┌─────────────┐
│agent/turn-  │ ← serial
│  stopping   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  turn/end   │
└─────────────┘
```

---

## 六、Cancellation 和错误恢复

### 6.1 Cancellation

- Agent 支持取消操作
- 取消时会清理正在执行的工具
- Session 日志记录取消事件

### 6.2 错误恢复

- `agent/request-error`（waterfall）处理请求失败
- 工具执行失败时记录错误但不中断 Turn
- 支持重试策略（`llm-retry` 插件）
