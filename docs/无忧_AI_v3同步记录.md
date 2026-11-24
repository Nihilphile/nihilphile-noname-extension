# 无忧 AI v3 定向同步记录

- 来源：`artifacts/wuyou-ai-v1/implementation`，提交 `7ae0fb67e489c391cf06cbda403000fe918da703`。
- 目标：原 `codex/baoguo` 工作区。本次只同步工作区文件，没有合并 Git 历史，也没有提交。
- 用户已授权解除无忧 AI 禁选：原 `extension.js` 仍禁选殷华普通版、落绯血偶师版，并继续清理鲜血仪葬版、剑华、沈藏锋的旧临时禁选；另清理全部遗留的无忧禁选条目。原包的其他武将与原有验收记录未改。
- 同步范围：`module/wuyou.js`、三个无忧测试、五份无忧 v3 文档，以及 `docs/evidence/wuyou-ai-v3/`。`tests/wuyou_behavior_test.js` 的 loader 断言保留原目录落绯血偶师版禁选；`tests/wuyou_ai_decision_test.js` 增加原目录引擎探针路径，保留隔离工作树路径。
- 同步前备份：`artifacts/wuyou-sync-20261012-230527/`。
- 校验：八个无需适配的文件与来源 SHA-256 一致；证据目录 161 个文件与来源逐一 SHA-256 一致。三个无忧测试脚本、`module/wuyou.js` 与 `extension.js` 的 `node --check`、针对 `extension.js` 的 `git diff --check` 均通过。
- 主控独立复核：加载测试通过；无忧模块与来源哈希一致；与同步前全扩展和测试目录的哈希清单对比，所有原有非目标文件均未改变。
