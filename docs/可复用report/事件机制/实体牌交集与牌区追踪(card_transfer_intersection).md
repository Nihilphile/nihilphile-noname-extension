---
title: 实体牌交集与牌区追踪
game_version: "无名杀子琪懒人包 v1.11.3"
evidence_status:
  source-confirmed: true
  automated-tested: false
  game-confirmed: false
last_reviewed: 2026-09-14
keywords: [gainAfter, loseAsyncAfter, getl, getg, cards2, card-zone, physical-card]
---

# 实体牌交集与牌区追踪

## 结论与适用场景

要判断“来源角色的实体牌确实从手牌区或装备区离开，并实际进入指定目标角色的手牌区”，应同时监听 `gainAfter` 与 `loseAsyncAfter`，再对同一移动事件的失去集和获得集按实体牌对象求交集：

```js
const lostFromSourceHE = trigger.getl(sourcePlayer)?.cards2 ?? [];
const gainedByTarget = trigger.getg(targetPlayer) ?? [];
const movedCards = gainedByTarget.filter(card => lostFromSourceHE.includes(card));
```

`movedCards.length` 是该事件中真实完成的移动张数。适用于给牌、夺取、技能转移、一对多/多对一聚合移动，以及“只按实际到达张数触发收益”的规则。

证据层级：**source-confirmed**。目标版本引擎实现和两个内置技能模式相互印证；未执行自动化或真实牌局验证。

## 不适用边界

- 目标落点是装备区、判定区或扩展区；这些不是 `gain` 到手牌的语义。
- 来源牌区包含判定区或扩展区；`cards2` 在目标版本仅为 `hs.concat(es)`。
- 第三方扩展直接操作 DOM、调用 `directgain/directlose`，或伪造历史而绕过标准事件。
- 规则要统计“计划移动”而非“实际抵达”；本模式刻意排除未成功离开、被销毁或改道的牌。
- 来源角色与目标角色相同且牌本来就在其手牌区；没有真实移动，不应由本模式制造一次移动事实。

## 源码 / API 调用链

```text
target.gain(cards, source) / source.give(cards, target) / chooseToGive
  -> gain 为有原持有者的牌创建 lose 子事件
  -> lose 按离开前区域记录 hs / es / js / ...
  -> lose.cards2 = hs + es
  -> gain 剔除未成功离开、被销毁、已在目标手牌等无效牌
  -> 余牌插入目标手牌区
  -> gainAfter
       getl(source).cards2 ∩ getg(target)

game.loseAsync(...)
  -> 一个或多个 lose / gain 子事件
  -> 子 gain 以 getlx=false 抑制重复报告
  -> loseAsyncAfter 由 getl/getg 聚合最终移动
```

目标版本关键锚点：

- `Player.gain/getl/getg`：`noname/library/element/player.js:7959-8068`
- `Player.give` 与 `chooseToGive`：`noname/library/element/player.js:8188-8201`、`noname/library/element/content.js:5186-5222`
- `lose` 的区域记录与 `cards2`：`noname/library/element/content.js:11043-11195`
- `gain` 的失败过滤与入手：`noname/library/element/content.js:10480-10745`
- `loseAsync` 聚合：`noname/game/index.js:945-1012`、`noname/library/element/content.js:5427-5542`
- `equip/addJudge` 的空 `getg`：`noname/library/element/player.js:8929-9097`

## 安全模式

```js
const transferTracker = {
  trigger: { global: ["gainAfter", "loseAsyncAfter"] },
  forced: true,
  filter(event, owner) {
    const sourcePlayer = resolveSource(owner, event);
    const targetPlayer = resolveTarget(owner, event);
    if (!sourcePlayer || !targetPlayer || sourcePlayer === targetPlayer) return false;
    if (typeof event.getl !== "function" || typeof event.getg !== "function") return false;
    const lost = event.getl(sourcePlayer)?.cards2 ?? [];
    return (event.getg(targetPlayer) ?? []).some(card => lost.includes(card));
  },
  async content(event, trigger, owner) {
    const sourcePlayer = resolveSource(owner, trigger);
    const targetPlayer = resolveTarget(owner, trigger);
    const lost = trigger.getl(sourcePlayer)?.cards2 ?? [];
    const moved = (trigger.getg(targetPlayer) ?? [])
      .filter(card => lost.includes(card));
    if (moved.length) await applyReward(owner, moved.length);
  },
};
```

- 在触发建立时固定来源角色和目标角色；结算时不要重新解析可能已经变化的身份。
- 只把实体对象交集作为移动事实，不附加 `source`、`giver`、动画字符串、卡名或技能名条件。
- 不要求牌在后续触发完成时仍由目标持有；`getg(target)` 已记录它确实到达过目标手牌。
- 如需防御非标准事件中的重复实体引用，可对交集做 `Set` 去重；标准事件和内置示例直接按数组交集计数。

## 失败模式

- 只检查 `event.source` / `event.giver`：漏掉夺取、强制获得和部分聚合移动。
- 只监听 `gainAfter`：漏掉由父 `loseAsyncAfter` 统一报告的聚合移动。
- 同时计算子 `gainAfter` 与父聚合结果而忽略 `getlx` 语义：可能重复计数。
- 使用输入牌数组而非最终 `getg`：会把未成功离开、销毁或改道的牌计入。
- 使用 `getl(source).cards` 或所有区域集合：可能把判定区、扩展区错误当作手牌/装备区。
- 结算时检查牌当前所在位置：后续立即转移会错误抹掉已经发生的移动。

## 最小回归用例

1. 来源角色给非目标角色一张手牌：交集 0。
2. 来源角色给目标角色一张手牌：交集 1；一次给两张则为 2。
3. 一张手牌和一张装备牌同时进入目标手牌：`cards2` 交集为 2。
4. 目标通过技能强制获得来源角色的牌，且无 `giver` / `"give"` 动画：仍按实体交集计数。
5. 来源角色的装备牌经标准卡牌流程进入目标手牌：按 1 计数。
6. 来源角色的判定区或扩展区牌被目标获得：因不在 `cards2` 而不计。
7. 聚合移动中混入其他来源、其他接收者：只计算指定来源与指定目标的交集，父事件只触发一次。
8. 预定移动失败、被销毁或抵达前改道：最终 `getg(target)` 不含该牌，不计。
9. 牌抵达后被另一个后置技能立刻移走：当前移动仍计一次。
10. 来源与目标相同且牌原已在手牌：不计。

## 版本风险

本结论锁定 v1.11.3。`cards2`、`getl/getg`、`getlx` 和 `loseAsync` 子事件抑制均属于需要随版本复核的实现约定。升级后至少重查上述源码锚点，并运行普通获得、聚合获得及各牌区落点用例。

## 来源 / 案例

- 原始调查：[霍旌实体牌给牌追踪调查](../霍旌接口/2026-09-14-军赏给牌追踪.md)
- 原报告以特定武将和收益技能为案例；本页只保留“来源 HE 实际失去 ∩ 目标实际获得”的通用机制。

