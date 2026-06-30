# 无名杀引擎事件机制 — 可复用调查报告

> 全部由 CC_Crew explorer 产出，覆盖引擎核心事件机制。

| 报告文件 | 覆盖内容 | 来源任务 |
|----------|---------|---------|
| 护盾机制(hujia).md | `player.hujia`、`changeHujia`、`ghujia` mark、上限5、伤害吸收 | 兵狼卫·铠武 |
| 伤害防止与体力流失(damage_loseHp).md | `trigger.cancel()`、`loseHp` vs `damage`、damage 生命周期 | 兵狼卫·救驾 |
| 准备阶段触发与摸牌(phase_draw).md | `phaseBegin`、`phaseDrawBegin2`、`maxHandcard` mod、`player.draw(N)` | 兵狼卫·铠武 |
| 每回合限一次与出牌阶段(usable_phase).md | `usable:1` vs `round:1`、`enable:"phaseUse"`、`recover` API、`changeHujia` | 兵狼卫·甲装 |
| useCard事件生命周期.md | useCard完整链、shaHit/shaMiss、before/begin/after、targets | 魔虚罗·适应 |
| 卡牌被抵消无效检测(cancel_neutralize).md | `_cancelled` vs `_neutralized`、`eventNeutralized`、无懈流程 | 魔虚罗·破魔 |
| 复制卡牌强制使用(copy_force).md | `get.copy`、`player.useCard`、`directHit`、`nowuxie`、印卡穿透 | 魔虚罗·破魔 |
| 延时锦囊phaseJudge生效检测(delay_effect).md | `phaseJudge` 生效时机、`event._result`、useCard vs phaseJudge 同名事件 | 魔虚罗·适应(延时) |
| 延时锦囊trigger匹配机制(delay_trigger).md | 事件命名规则（裸名不触发）、`lebuEnd` 才是正确 trigger | 魔虚罗·适应(延时修复) |
