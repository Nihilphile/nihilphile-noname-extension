# 沈藏锋 AI 行为设计：规则依据

核读日期：2026-10-03。适用：用户本次附图的沈藏锋，经典军争身份局；公开队伍模式可复用战斗判断，胜负与奖励另按模式。本文是行为设计的依据，不是技能改版或实现验收。

## 证据分级

- **本次牌面**：用户附图是本次自定义武将的最高优先级来源；保存于 [本次武将牌](沈藏锋_本次武将牌.png)。
- **项目规则约定**：[规则契约 v1.5](taskboard/shencangfeng/rule-contract-v1.5.md) 与本次图的三技能一致，用于补足快照、连环死亡归因、零势、获得弃牌堆杀等工程歧义。这是自定义武将约定，不是官方武将裁定。旧 v1—v4、早期测试报告不得覆盖它。
- **历史依据**：下列《规则集 3.0》是第三方保存的历史规则文本。已核读具体页面，不将其包装成现行所有客户端的官方裁定。
- **官方直发**：官网身份规则介绍可交叉核验基础胜负方向；其中忠胆英杰的明忠、暗主等专属开局规则不用于经典军争。
- **设计推导**：根据规则设计的玩法判断，不是规则原文，也不是已实测的胜率结论。

## 武将规则表

| 编号 | 本次设计采用的事实 | 依据与边界 |
| --- | --- | --- |
| G1 | 开局 1 势；自己的结束阶段开始时，若本回合没有自己使用的杀造成正数伤害，得 1 势，并尽可能从弃牌堆得 1 杀 | 本次牌面＋项目约定。不是“没用杀”才触发；被闪、完全防止不阻止蓄势。不能把获得指定某张杀的选择权凭空给 AI |
| G2 | 势不少于 3 时，自己的杀改成火焰属性；少于 3 时回到该牌原本属性 | 本次牌面＋项目约定。高势不能自行选择普通或雷属性来规避火伤风险 |
| G3 | 每势使杀伤害和攻击范围 +1；每张杀使用时锁定当时势数，供本张杀的伤害与范围判断 | 本次牌面＋项目快照约定。基础伤害再经酒、装备、技能修正；不是势多就必定命中或死亡 |
| G4 | 每张使用的杀整张结算后，若没有武将因此杀死亡，必须选择清空当时全部势摸等量牌，或失去 1 体力保势 | 本次牌面＋项目约定。被闪、无伤、零势也进入此项。零势选择清势是清 0 摸 0 |
| G5 | 此杀的正数直接伤害或连环传导伤害造成死亡，免 G4 的二选一并保势；不是到濒死就算死亡 | 项目约定。无关死亡、失去体力死亡不算此杀击杀；不额外加势，也不授予额外杀次数。转移后死亡如何归因须核对具体技能，不一概声称有保势资格 |
| G6 | 出牌阶段结束时，可一次重铸至少 1 张手牌杀，摸等量牌；随后可选择 0 至重铸数量名合法角色，视为使用一张无材料铁索连环 | 本次牌面＋项目约定。不要求本回合没用杀，可少选、不选，可选自己及已横置者。技能明确的目标上限覆盖普通铁索至多两人 |
| G7 | 锁心的重铸与后续虚拟铁索是两段行为 | 本次牌面＋重铸历史依据。不选目标也保留换牌；虚拟铁索被无懈不退还重铸成本与摸牌；后段有使用锦囊的交互，前段不是使用杀 |
| G8 | 本项目把图上“回合结束时”落实为自己的结束阶段开始时 | 项目约定。行为文档先按它设计，不把图上宽泛写法扩展为任意角色回合结束都能蓄势 |

## 通用规则与来源

| 编号 | 已核验事实及其行为意义 | 来源 |
| --- | --- | --- |
| R1 | 使用杀与打出杀不同；决斗、南蛮交杀通常是打出，借刀要求的是使用杀。前者不自动产生拔刀；后者需要评估拔刀和连环 | 历史依据：[基本牌](https://gltjk.com/sanguosha/rules/card/basic.html)、[锦囊牌](https://gltjk.com/sanguosha/rules/card/scroll.html)；技能导航 [打出与响应](C:/Users/Dreamjiao/.codex/skills/sanguosha-knowledge/references/response.md) |
| R2 | 普通出牌阶段杀限一次；次数、范围、合法目标、有效性分开检查。杀不能对自己使用，铁索允许选自己 | 历史依据：[基本牌](https://gltjk.com/sanguosha/rules/card/basic.html)、[使用条件](https://gltjk.com/sanguosha/rules/flow/condition.html) |
| R3 | 伤害到 0 属于完全防止；濒死先求救，救回才继续结算。伤害没有造成死亡仍须缴拔刀代价 | 历史依据：[伤害流程](https://gltjk.com/sanguosha/rules/flow/damage.html)、[濒死流程](https://gltjk.com/sanguosha/rules/flow/neardeath.html) |
| R4 | 连环看属性伤害。按行动顺序逐个结算，继承起点最终扣减体力形成的基数，下游各自修正；下游增伤不累积到下一人。起点死亡不自动取消传导，终局例外 | 历史依据：[武将牌操作](https://gltjk.com/sanguosha/rules/glossary/herocard.html)、[伤害流程](https://gltjk.com/sanguosha/rules/flow/damage.html) |
| R5 | 藤甲通常挡普通杀、受火伤 +1；白银狮子通常将超过 1 的伤害改为 1；仁王盾挡黑杀；八卦提供判定防御；青釭、贯石斧、青龙须分别考虑具体效果 | 历史依据：[装备牌](https://gltjk.com/sanguosha/rules/card/equipment.html)。不能把直接目标防具失效推广成所有传导目标防具失效 |
| R6 | 失去体力不是伤害，不自动触发卖血、连环或伤害来源奖励；仍可能进入濒死，酒濒死用法只救自己 | 历史依据：[失去体力流程](https://gltjk.com/sanguosha/rules/flow/loselife.html)、[基本牌](https://gltjk.com/sanguosha/rules/card/basic.html)；技能导航 [失去体力](C:/Users/Dreamjiao/.codex/skills/sanguosha-knowledge/references/lose-hp.md) |
| R7 | 重铸等量换牌，普通无懈针对锦囊效果。铁索改变连环状态，不直接造成伤害；对已横置者通常是解链 | 历史依据：[牌操作](https://gltjk.com/sanguosha/rules/glossary/gamecard.html)、[锦囊牌](https://gltjk.com/sanguosha/rules/card/scroll.html)、[武将牌操作](https://gltjk.com/sanguosha/rules/glossary/herocard.html) |
| R8 | 常规顺序为出牌、弃牌、结束阶段；默认手牌上限是当前体力。结束阶段获得的杀通常在普通弃牌之后，不因超上限立即再弃 | 历史依据：[游戏流程](https://gltjk.com/sanguosha/rules/flow/game.html)、[数值](https://gltjk.com/sanguosha/rules/glossary/value.html) |
| R9 | 跳过出牌阶段不保证有出牌阶段结束窗口；终止回合、翻面跳过整回合、额外阶段须分别检查，不能凭空安排锁心或蓄势 | 历史依据：[游戏流程](https://gltjk.com/sanguosha/rules/flow/game.html)；技能导航 [阶段跳过](C:/Users/Dreamjiao/.codex/skills/sanguosha-knowledge/references/phase-skip.md) |
| R10 | 先核胜负再算死亡奖励。基础身份局中，未终局时击杀反贼摸三；主公击杀忠臣弃手牌及装备。连环可能同时涉及主公和其他身份，但结算不是同时发生 | 历史依据：[死亡流程](https://gltjk.com/sanguosha/rules/flow/death.html)；官方直发：[官网身份玩法介绍](https://sanguosha.com/news/20151020_9798_4319)，只取文中明确与身份局相同的胜负说明，不套用暗主免惩罚 |
| R11 | 经典身份局普通无懈针对锦囊对当前一名目标的效果，不能默认抵消整张多目标铁索；它不直接抵消重铸、殺或武将技能 | 历史依据及规则推导：[锦囊牌](https://gltjk.com/sanguosha/rules/card/scroll.html)；技能导航 [无懈可击](C:/Users/Dreamjiao/.codex/skills/sanguosha-knowledge/references/nullification.md)。国无懈及特殊改写不在此范围 |
| R12 | 手牌通常仅本人可见，弃牌堆及装备等公开；无实体材料的视为使用牌不凭空生成可获得的实体牌 | 历史依据：[区域](https://gltjk.com/sanguosha/rules/glossary/zone.html)、[虚拟牌专题](https://gltjk.com/sanguosha/rules/flow/virtual.html)；技能导航 [牌的区域](C:/Users/Dreamjiao/.codex/skills/sanguosha-knowledge/references/card-zones.md)。把看过的某张牌推定一直留在暗手牌中不是规则事实 |
| R13 | 寒冰可在符合条件时防止将造成的伤害改为依次弃两牌；青龙被闪后使用另一杀；方天符合最后手牌条件时增加直接目标；连弩改变合法杀次数 | 历史依据：[装备牌](https://gltjk.com/sanguosha/rules/card/equipment.html)。与G1/G4/G5组合才得到本次行为预期，不是官方自定义武将FAQ |
| R14 | 多目标牌的效果逐目标完整结算；嵌套使用先完成再返回外层。吃过链伤不会取消仍存活角色被指定的后续直接效果 | 历史依据：[使用流程](https://gltjk.com/sanguosha/rules/flow/use.html)、[结算原则](https://gltjk.com/sanguosha/rules/rule/principle.html)及R4。每张独立杀分别按G4/G5归因是项目约定的推导，不证明现有机制实现已通过 |

## 尚需按具体交互补查的边界

伤害转移、护盾吸收是否仍算正数伤害、临时获得技能、特殊濒死限制、死亡后复活、不同客户端的铁索选择与阶段截断，不能统一靠此表猜测。遇到这些具体牌面，先查该技能和目标规则；无法确认时采用不依赖该收益的候选计划，并标记缺口。无名杀代码可以说明项目行为，不能作为官方裁定依据。
