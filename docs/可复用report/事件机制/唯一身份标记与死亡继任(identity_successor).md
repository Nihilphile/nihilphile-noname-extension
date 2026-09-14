---
title: 唯一身份标记与死亡继任
game_version: "无名杀子琪懒人包 v1.11.3"
evidence_status:
  source-confirmed: true
  automated-tested: false
  game-confirmed: false
last_reviewed: 2026-09-14
keywords: [unique-role, mark-skill, die, dieAfter, forceDie, addSkills, reconnect]
---

# 唯一身份标记与死亡继任

## 结论与适用场景

需要表达“全场至多一名角色持有、公开可见、可迁移，并在持有者死亡后继任”的身份时，优先把一个静态标记技能挂在当前身份角色本人身上。身份查询由“谁持有该技能”唯一决定；所有初始化、迁移、死亡继任和修复入口都收束到同一个规范化函数。

此模式适用于唯一领袖、契约主、旗手、护送对象等全局单例身份。它比让多个技能拥有者分别在 `storage` 中保存目标引用更不容易产生分叉和悬空引用。

证据层级：**source-confirmed**。目标版本源码确认了技能/标记广播、技能添加幂等和死亡事件顺序；没有自动化或真实牌局证据，尤其不能标记为 `game-confirmed`。

## 不适用边界

- 身份允许同时存在多个持有者，或按阵营各自唯一；此时需要显式集合/分区约束。
- 身份状态必须跨房间、跨存档持久化；静态标记技能只表达当前牌局内状态。
- 休整、移出游戏、复活、替换角色等模式不走普通 `die/dieAfter`；必须为对应生命周期另设入口。
- 目标版本的断线重连快照未证明会立即恢复运行时获得的技能和 mark。在线广播成立，不等于重连恢复成立。
- 多个候选人同时有资格继任但规则未定义优先级；文档只能要求确定性裁决，不能替规则作者决定具体顺序。

## 源码 / API 调用链

```text
phaseBefore(game.phaseNumber == 0) / enterGame
  -> 若当前无身份持有者，按已声明的确定性规则选择候选人
  -> setUniqueHolder(target)
     -> 扫描 game.players + game.dead，移除其他持有者的标记技能
     -> target.addSkill(markSkill)
     -> addSkill / markSkill 广播在线状态与公开标记

当前身份持有者 die
  -> 死者先从 game.players 移入 game.dead
  -> player:"die"：可执行死亡中的选择/授技；技能和选择事件均需 forceDie
  -> 引擎清除死者 mark UI，但常驻技能并未在该段被统一移除
  -> player:"dieAfter"：标记技能自身选择继任者
  -> setUniqueHolder(successor 或 null)
```

目标版本关键锚点：

- `player.addSkill/removeSkill`：`noname/library/element/player.js:10571-10640,11099-11130`
- `player.markSkill/unmarkSkill`：`noname/library/element/player.js:9844-9905`
- `player.addSkills` / `changeSkills`：`noname/library/element/player.js:10545-10569`、`noname/library/element/content.js:381-424`
- `die` 的移出存活列表与触发顺序：`noname/library/element/content.js:11713-11824`
- 重连相关负证据：`noname/get/index.js:1823-1863`、`noname/library/element/player.js:4158-4248`、`noname/library/index.js:11734-11743,12671-12925`

## 安全模式

```js
function allKnownPlayers() {
  return game.players.concat(game.dead);
}

function getUniqueHolder(markSkill) {
  return game.players.find(current => current.hasSkill(markSkill)) || null;
}

function setUniqueHolder(markSkill, target) {
  for (const current of allKnownPlayers()) {
    if (current !== target && current.hasSkill(markSkill)) {
      current.removeSkill(markSkill);
    }
  }
  if (target?.isIn() && !target.hasSkill(markSkill)) {
    target.addSkill(markSkill);
  }
}
```

- 标记技能使用 `charlotte: true`、`mark: true`、`marktext` 和 `intro`，让身份事实与 UI 同源。
- 把 `dieAfter` 继任监听器放在标记技能上，并声明 `forceDie: true`；这样只有唯一旧持有者触发。
- 死亡时授予普通技能，应在 `player: "die"` 上声明 `forceDie: true`，为 `chooseTarget` 同样设置 `forceDie`，并在候选过滤中排除已拥有该技能者。
- 每个入口先清理 `game.players.concat(game.dead)` 中的旧标记，再添加新标记。重复调用可恢复唯一性。
- 多候选初始化和继任必须采用已记录、可测试的确定性顺序，例如以事件相关角色为起点的座次顺序。
- 如需提高在线可见性的自愈能力，可在安全阶段边界对权威持有者调用 `syncSkills()` / `markSkill()`；这不是重连已验证的替代品。

## 失败模式

- 多个技能拥有者各自在 `storage` 保存目标：会出现不同客户端或不同拥有者认定不同身份角色。
- 只删除标记 DOM、不移除技能：权威状态与 UI 分裂。
- 只扫描存活角色：死亡角色上的残留技能无法被规范化清理。
- 每个候选人都监听死亡并自行继任：多人同技能时结算依赖触发顺序，可能重复迁移。
- 仅依赖 `addSkill` 幂等避免重复授技：`addSkills` 的事件和日志仍可能产生误导，候选过滤应先排除重复。
- 把在线 `broadcast` 推导为断线重连已支持：原始调查没有这个证据。

## 最小回归用例

1. 单候选正常开局和中途进入：无身份时建立一个持有者；已有身份时不抢占。
2. 主动迁移：旧标记消失、新标记出现，存活与死亡角色合计持有数恒为 1。
3. 人工注入两个标记后调用规范化入口：恢复为一个。
4. 身份持有者死亡：按已声明顺序选择唯一存活继任者；无候选时清空身份。
5. 死亡中可选授技：取消不授予；选择未拥有者后只增加一次；没有合法候选时不弹框。
6. 两个在线客户端观察初始化、迁移和继任：技能状态与公开标记一致。
7. 断线后重连：分别检查重连瞬间和下一安全阶段边界；在真实证据前该项预期保持“待验证”。
8. 特殊死亡、复活、替换角色：记录是否经过普通 `die/dieAfter`；未经过者不得误判为本模式已覆盖。

## 版本风险

本结论锁定 v1.11.3。升级时必须复核死亡时序、`addSkill/removeSkill` 广播、mark 清理及重连 `reinit` 状态载荷。`charlotte`、`fixed` 等技能属性的移除语义也可能变化；不要为防御性目的添加未经目标版本证实的属性。

## 来源 / 案例

- 原始调查：[霍旌“帅”身份与遗忠授技生命周期接口调查](../霍旌接口/2026-09-14-帅生命周期.md)
- 原报告中的武将名、技能名和多人同将裁决仅是案例；本页可复用结论是“唯一标记技能 + 单一规范化入口 + 标记技能自身继任”。

