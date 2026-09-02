# dsh-base Bundle

| 属性 | 值 |
| :-- | :-- |
| 包名 | `@deepseek-ai/dsh-base` |
| 路径 | `packages/bundle/base/` |
| 描述 | 所有 profile 的第一个 patch 层 |
| 依赖数 | ~65 |

## cordis.patch.yml 注册的插件

**Agent**: agent, agent-loop, agent-default-model
**LLM**: llm, llm-deepseek, llm-pi-ai, llm-retry, api-gateway
**Shell**: shell-env, bash-sandbox, pwsh-sandbox, sandbox-local, sandbox-policy
**FS**: fs-local, fs-sandbox, fs-observation-policy
**Session**: session, session-persistence-jsonl, session-projection, session-query-sqlite, session-telemetry-otel
**Tools**: tool-bash, tool-pwsh, tool-fs, tool-fs-search, tool-str-replace-editor, tool-web, tool-goal, tool-skill, tool-ralph, tool-workflow, tool-jobs, tool-subagent, tool-subagent-control, tool-subagent-report, tool-todo
**Other**: skill, skill-filesystem, skill-badge, goal, compaction-basic, permission-presets, user-approval, user-questions, jobs-local, workflow-worker-thread, credentials-local, settings-file, token-meter, web, web-search-deepseek
