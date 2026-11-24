# 无名杀引擎机制索引

本报告库的分类、晋升和证据状态规则见[治理契约](../GOVERNANCE.md)。

> 本索引覆盖 `事件机制/` 下的引擎机制文档，以及本次晋升所对应的原始证据档案；不声称覆盖同级 `ai_logic/` 等其他专题目录。以武将或任务命名的报告保留为证据档案，不应直接当作跨版本 API 保证。

## 快速入口

| 机制类型 | 文档 | 关键词 | 证据状态 |
|---|---|---|---|
| 身份与生命周期 | [唯一身份标记与死亡继任](./唯一身份标记与死亡继任(identity_successor).md) | `markSkill`、唯一持有者、`die`、`dieAfter`、`forceDie`、重连 | source-confirmed |
| 实体牌移动 | [实体牌交集与牌区追踪](./实体牌交集与牌区追踪(card_transfer_intersection).md) | `gainAfter`、`loseAsyncAfter`、`getl/getg`、`cards2`、HE 区 | source-confirmed |
| 用牌参数 | [`useCard` 阶段参数累加](./useCard阶段参数累加(usecard_parameters).md) | `useCard1`、`baseDamage`、`customArgs`、`shanRequired`、额外目标 | source-confirmed |
| 响应安全 | [`chooseToRespond` 强制响应与虚拟牌边界](./强制响应与虚拟牌边界(forced_response).md) | `forced`、空选择、`hasUsableCard`、`cardRespondable`、`viewAs`、`hiddenCard` | source-confirmed；automated-tested(partial) |
| 用牌生命周期 | [useCard 事件生命周期](./useCard事件生命周期.md) | `useCard0/1/2`、逐目标、`shaHit/shaMiss`、targets | 既有调查 |
| 抵消与无效 | [卡牌被抵消无效检测](./卡牌被抵消无效检测(cancel_neutralize).md) | `_cancelled`、`_neutralized`、`eventNeutralized`、无懈 | 既有调查 |
| 复制与强制使用 | [复制卡牌强制使用](./复制卡牌强制使用(copy_force).md) | `get.copy`、`player.useCard`、`directHit`、`nowuxie` | 既有调查 |
| 延时锦囊 | [phaseJudge 生效检测](./延时锦囊phaseJudge生效检测(delay_effect).md) | `phaseJudge`、`event._result`、延时锦囊生效 | 既有调查 |
| 延时锦囊 | [trigger 匹配机制](./延时锦囊trigger匹配机制(delay_trigger).md) | 裸名事件、`lebuEnd`、事件命名 | 既有调查 |
| 濒死结算 | [濒死机制](./濒死机制(dying).md) | `dying`、濒死队列、救援、死亡衔接 | 既有调查 |
| 伤害与体力 | [伤害防止与体力流失](./伤害防止与体力流失(damage_loseHp).md) | `trigger.cancel()`、`loseHp`、damage 生命周期 | 既有调查 |
| 护甲 | [护盾机制](./护盾机制(hujia).md) | `player.hujia`、`changeHujia`、伤害吸收、上限 | 既有调查 |
| 阶段与资源 | [准备阶段触发与摸牌](./准备阶段触发与摸牌(phase_draw).md) | `phaseBegin`、`phaseDrawBegin2`、`player.draw` | 既有调查 |
| 次数与主动技 | [每回合限一次与出牌阶段](./每回合限一次与出牌阶段(usable_phase).md) | `usable`、`round`、`phaseUse`、`recover` | 既有调查 |
| 编译边界 | [普通 content 闭包丢失](./普通content闭包丢失(StepCompiler).md) | `StepCompiler`、闭包、`async content`、注入变量 | 既有 source-confirmed / tested 文档 |

## 复合与档案报告

| 报告 | 覆盖内容 | 使用建议 |
|---|---|---|
| [落绯实现：事件牌区与扩展打包](../落绯实现_事件牌区与扩展打包.md) | `damageEnd`、濒死顺序、`changeHpAfter`、处理区实体牌、ZIP 导入 | 多机制复合档案；按需取证，不作为单一机制入口 |
| [唯一身份与死亡授技原始调查](../霍旌接口/2026-09-14-帅生命周期.md) | 身份初始化/迁移/继任、死亡授技、在线同步与重连风险 | 证据档案；通用结论已晋升到“身份与生命周期” |
| [实体牌给牌追踪原始调查](../霍旌接口/2026-09-14-军赏给牌追踪.md) | `getl/getg` 实体交集、`gain/loseAsync`、牌区边界 | 证据档案；通用结论已晋升到“实体牌移动” |
| [强制空响应崩溃原始调查](../霍旌接口/2026-09-14-协攻强制空响应崩溃.md) | forced 空选择、粗预检、虚拟牌、调用时序 | 主要证据；其后置建议仍需按内部调用时序降级 |
| [用牌参数与响应链原始调查](../霍旌接口/2026-09-14-协攻杀参数.md) | `baseDamage`、`shanRequired`、串行触发、响应牌去向 | 参数机制证据；其中“粗预检后即可 forced”已被后续报告降级 |

## 冲突与阅读规则

- 两份响应档案的结论存在先后修正：`hasUsableCard(name, "respond")` 只能做粗预检，不能保证 `forced:true` 的选择存在实体候选。崩溃预防必须发生在进入危险 forced 选择之前或选择内部；`forResult()` 返回后的验证只保护技能后续收益，不能阻止内部 `respond` 或返回前异常。详见[强制响应与虚拟牌边界](./强制响应与虚拟牌边界(forced_response).md)。
- `useCard` 大生命周期已经有文档；参数累加文档只补充 `baseDamage/customArgs`，不复制完整生命周期。
- `StepCompiler` 文档已经存在并已列入索引，不再为本次任务创建重复文档。
- 所有版本化结论默认只适用于各文档声明的目标版本；`source-confirmed`、`automated-tested` 和 `game-confirmed` 不得互相替代。
