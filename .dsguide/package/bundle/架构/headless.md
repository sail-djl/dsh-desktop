# dsh-headless Bundle

| 属性 | 值 |
| :-- | :-- |
| 包名 | `@deepseek-ai/dsh-headless` |
| 路径 | `packages/bundle/headless/` |
| 描述 | 无头一次性运行：无 Host、无 HTTP、无浏览器层 |
| 依赖数 | ~5 |

## 与 web-app 的区别

| 维度 | web-app | headless |
| :-- | :-- | :-- |
| 依赖数 | ~60 | ~5 |
| Host 服务 | webserver, apiproxy, frontend-static | 无 |
| 前端 UI | 40+ client-ui-* 组件 | 无 |
| 存储 | storage, storage-domain, storage-json | 无 |
| 适用场景 | 浏览器 Web UI | CI/CLI 一次性任务 |

## 典型用法

```bash
dsh --profile headless "run the tests"
```
