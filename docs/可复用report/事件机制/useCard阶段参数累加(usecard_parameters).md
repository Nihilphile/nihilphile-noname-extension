---
title: useCard 阶段参数累加
game_version: "无名杀子琪懒人包 v1.11.3"
evidence_status:
  source-confirmed: true
  automated-tested: false
  game-confirmed: false
last_reviewed: 2026-09-14
keywords: [useCard1, useCard2, baseDamage, customArgs, shanRequired, additional-target]
---

# `useCard` 阶段参数累加

## 结论与适用场景

当若干独立效果要在一张【杀】逐目标结算前累计“基础伤害”和“每个目标所需响应牌数”时，可在顶层 `useCard1` 窗口修改：

- `useCardEvent.baseDamage += delta`：之后复制到每个有效目标的牌名事件。
- `useCardEvent.customArgs[playerid].shanRequired`：按目标角色分别设置；缺省值是一张，首次加一写成 2，后续继续累加。

如果后续 `useCard1/useCard2` 仍可能增加目标，应为 `game.players.concat(game.dead)` 中所有当前角色预写按 `playerid` 的参数，而不是只遍历当下 `targets`。多个同类全局技能由引擎逐项 `await`，无需自建并发队列；结果不得依赖某一技能拥有者固定先行动。

此模式适用于一次用牌上多来源累加数值、附加目标也应继承参数、与其他使用 2/++ 惯例的响应次数加成组合。

证据层级：**source-confirmed**。引擎链和内置技能写法已确认；未做自动化或真实牌局验证。

## 不适用边界

- 要按每个目标分别改变基础伤害，而不是整张牌共享 `baseDamage`。
- 参数只应影响当前已经选中的目标，明确不应影响后续追加目标。
- 效果触发条件是“命中”“造成伤害后”或“整张牌结算后”；这些应选择更晚事件，不应提前写在 `useCard1`。
- 极端流程会在参数预写之后创建/复活全新角色；快照遍历无法覆盖未来对象。
- 第三方技能直接覆盖而非累加同一字段；本模式无法保证与破坏累加惯例的实现可交换。

## 源码 / API 调用链

```text
牌使用者 useCard(card, targets)
  -> 初始化 excluded / directHit / customArgs={default:{}} / baseDamage
  -> 实体组成牌进入处理区
  -> useCard0
  -> useCard1
       -> 各技能事件按调度顺序逐个 await
       -> 累加顶层 baseDamage
       -> 累加 customArgs[playerid].shanRequired
  -> yingbian
  -> useCard2（仍可追加目标）
  -> useCard
  -> 目标分拣；排除目标不创建牌名事件
  -> 为每个有效目标创建 sha 事件
       -> 复制顶层 baseDamage
       -> 复制 customArgs.default，再复制 customArgs[target.playerid]
       -> 循环请求 shanRequired 次响应
       -> 未完全响应时按 baseDamage 等参数造成伤害
```

目标版本关键锚点：

- 顶层初始化与阶段顺序：`noname/library/element/content.js:9071-9085,9237-9275,9351-9363`
- 目标分拣和参数复制：`noname/library/element/content.js:9410-9551,9639-9682,9700-9708`
- 【杀】响应次数与伤害：`card/standard.js:129-165,214-236`、`noname/library/element/player.js:8357-8372`
- 触发任务串行调度：`noname/library/element/gameEvent.js:454-592`、`noname/library/element/content.js:3420-3468`

## 安全模式

```js
function addUseCardParameters(useCardEvent, damageDelta = 1, responseDelta = 1) {
  useCardEvent.baseDamage += damageDelta;

  for (const current of game.players.concat(game.dead)) {
    const id = current.playerid;
    useCardEvent.customArgs[id] ??= {};
    const args = useCardEvent.customArgs[id];
    const baseline = typeof args.shanRequired === "number" ? args.shanRequired : 1;
    args.shanRequired = baseline + responseDelta;
  }
}
```

- 在 `useCard1` 触发器中先确认 `event.card?.name` 和牌使用者符合通用规则，再修改顶层事件。
- 每个独立贡献只在自身成功完成后累加一次；失败、取消或无效输入不得改参数。
- 使用按 `playerid` 的增量赋值，避免仅写 `customArgs.default` 后被目标专属值覆盖。
- 响应牌的选择与安全边界见[强制响应与虚拟牌边界](./强制响应与虚拟牌边界(forced_response).md)；本页不把粗预检当作参数累加成功证据。
- 已经在早期窗口支付的代价不会因稍后目标排除或整张牌无有效目标而自动返还；若规则要求返还，需要另建补偿协议。

## 失败模式

- 只遍历 `trigger.targets`：后续追加目标拿不到按角色参数。
- 把 `shanRequired` 无条件写成 2：覆盖已有加成，结果依赖技能顺序。
- 只写 `customArgs.default.shanRequired`：随后目标专属值可能覆盖默认值。
- 在逐目标牌名事件才修改顶层参数：其他目标可能已经复制旧值。
- 自建并行响应框：破坏引擎已有的串行触发顺序。
- 因后续目标被排除而回滚早期已完成的响应/代价：源码没有这种自动事务语义。

## 最小回归用例

1. 单次成功贡献：顶层 `baseDamage` 从 1 变 2，目标 `shanRequired` 从缺省一张变 2。
2. 成功、失败、成功三个串行贡献：仅成功项累加，最终两个字段均为 3。
3. 初始目标 A，随后在 `useCard1/useCard2` 加入 B：A、B 创建的牌名事件读取相同累计值。
4. A 被排除、B 有效：A 不创建牌名事件；B 保留累计参数；早期代价不返还。
5. 所有目标都被排除：不请求响应、不造成伤害，但已完成的早期子事件不自动回滚。
6. 与另一个按“缺省 1、首次写 2、后续 ++”实现的加成组合：不同触发顺序得到相同总数。
7. 多目标：顶层基础伤害复制给每个有效目标，按角色响应次数只读取各自 `playerid` 项。

## 版本风险

本结论锁定 v1.11.3。`useCard1/useCard2` 阶段名、`baseDamage`、`customArgs`、`playerid` 键和逐目标复制顺序属于版本敏感接口；升级时必须复核初始化、追加目标窗口、参数覆盖顺序和牌名事件创建逻辑。

## 来源 / 案例

- 原始调查：[霍旌【协攻】杀参数与响应链调查](../霍旌接口/2026-09-14-协攻杀参数.md)
- 既有背景：[useCard 事件生命周期](./useCard事件生命周期.md)
- 原始调查中的身份名和技能名只用于来源定位；本页机制与任何特定武将无关。

