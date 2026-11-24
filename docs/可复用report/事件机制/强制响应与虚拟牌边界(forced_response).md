---
title: chooseToRespond 强制响应与虚拟牌边界
game_version: "无名杀子琪懒人包 v1.11.3"
evidence_status:
  source-confirmed: true
  automated-tested: partial
  game-confirmed: false
last_reviewed: 2026-09-14
keywords: [chooseToRespond, forced, hasUsableCard, cardRespondable, viewAs, hiddenCard, VCard]
---

# `chooseToRespond` 强制响应与虚拟牌边界

## 结论与适用场景

`hasUsableCard(name, "respond")` 只能作为“可能具有响应能力”的粗预检，不能证明紧随其后的 `chooseToRespond` 一定有可选实体牌。它可能因实体牌、`viewAs` 或 `hiddenCard` 为真，且预检使用的事件上下文可能比真正的选择事件宽松。

在 v1.11.3 中，对空候选集合设置 `forced: true` 可能产生 `{ bool:true, cards:[], card:无牌名VCard }`。更重要的是，`chooseToRespond().forResult()` 会在 Promise 返回前由引擎内部调用 `player.respond`；异常也发生在 `forResult()` 返回前。因而返回后的结果校验不能预防这条崩溃链。

当前证据支持的边界是：

1. 粗预检只用于减少无意义交互，不用于证明安全。
2. 若规则要求实体牌，先用即将创建的响应事件作为上下文检查实体候选；没有候选时不要进入危险的 `forced:true` 选择。
3. 有实体候选后才设置 `forced:true`，可覆盖已知的 `viewAs/hiddenCard` 和事件上下文误报，但不能封闭选择期间动态钩子改变候选的时序窗口，故只能称为保守缓解，不能称为完全防护。
4. `forResult()` 成功返回后仍应验证结果形状，但该检查只决定技能自身是否结算后续收益；它既不会、也来不及阻止引擎内部已经发生的 `respond` 或返回前异常。
5. 若必须在调用 `player.respond` 前绝对掌握验证点，只能另行设计“自管选择 → 验证 → 手动 respond”的协议。原始报告没有证明该协议的事件语义、牌移动、AI 和联机行为，本文不把它列为已确认方案。
6. 若规则允许无实体虚拟响应，必须走完整的 `skill/viewAs` 响应协议，不能把“空实体数组”当成普通实体响应成功。

此模式适用于“有合法响应时不得主动取消”、由技能强制打出牌、粗预检后创建响应选择，以及需要兼容转化/虚拟牌的流程。

证据层级：**source-confirmed**；**automated-tested（partial）** 仅指来源任务的 smoke test 覆盖了一个虚拟误报分支，不等于本文通用模式已有完整自动化；未运行 Electron 或联机实局，故不是 `game-confirmed`。

## 不适用边界

- 规则允许玩家主动拒绝：应保持 `forced:false`，但仍建议后置验证。
- 规则明确允许无实体 `hiddenCard/viewAs` 响应：必须保留技能标识及虚拟牌构造，本文的“实体候选”门不能直接套用。
- 牌面原名必须匹配，而不是 `get.name(card, player)` 的当前转化名；需要更严格且另行验证的过滤协议。
- 选择期间有第三方 `onChooseToRespond`、禁牌 mod、来源 `norespond` 或联机同步改变候选集合；前置检查无法封闭此时序窗口，而返回后检查又发生得太晚，本文没有 source-confirmed 的完全防护方案。

## 源码 / API 调用链

```text
hasUsableCard(name, "respond")
  -> 检查手牌实体牌
  -> 也检查响应型 viewAs / hiddenCard
  -> 找不到 chooseToRespond 父事件时可能退回当前事件上下文

chooseToRespond(...).set("forced", true)
  -> 默认 selectCard=[1,1]、position="hs"
  -> game.check / processSelection
  -> forced 且无 selectableItems 时，最少选择数检查被放宽
  -> ui.click.ok
  -> result={bool:true,cards:[],card:nameless VCard}
  -> player.respond([], undefined, ...)
  -> respond content 读取 event.card.name
  -> TypeError
  -> chooseToRespond().forResult() 尚未返回
```

目标版本关键锚点：

- `hasUsableCard` 的实体牌和技能分支：`noname/library/element/player.js:2844-2943`
- `cardRespondable` 的事件上下文差异：`noname/library/index.js:10973-11002`
- 选择事件创建及默认选择数：`noname/library/element/player.js:5418-5498`
- 选择检查与 forced 空集合：`noname/game/check.js:82-121`、`noname/game/index.js:6853-6958`
- 选择结果和自动 VCard：`noname/ui/click/index.js:2975-3045`、`noname/get/index.js:1049-1054`
- `chooseToRespond -> respond` 与崩溃读取：`noname/library/element/content.js:4788-4882,5003-5047,10195-10241`

## 安全模式

```js
const choose = responder.chooseToRespond(prompt, { name: requiredName });

const hasPhysicalCandidate = responder.getCards("hs").some(card =>
  get.name(card, responder) === requiredName
  && lib.filter.cardRespondable(card, responder, choose)
  && (!choose.filterCard || choose.filterCard(card, responder, choose))
);

if (!hasPhysicalCandidate) {
  // 不进入 forced 选择，直接按“没有可用实体响应牌”处理。
  await resolveFailure(responder);
  return;
}

// 只覆盖已知的粗预检误报；动态钩子仍可能在选择期间清空候选。
choose.set("forced", true);
const result = await choose.forResult();
const selected = result?.cards?.[0];
const valid = result?.bool === true
  && selected
  && get.itemtype(selected) === "card"
  && result?.card
  && result.card.name === requiredName;

if (!valid) {
  // 仅阻止本技能把异常返回值当成成功收益；不能回滚或阻止内部 respond。
  await resolveFailure(responder);
  return;
}

// 正常返回时，chooseToRespond 已在内部完成 respond 和实体牌移动。
// 此处只结算依赖成功响应的后续效果，不手动 respond，也不重复弃牌。
await resolveSuccess(responder, result);
```

这是“覆盖已知误报”的保守实体牌模式，不是绝对防崩方案。前置检查与 `forResult()` 之间仍存在动态窗口；如果候选在该窗口被清空，危险路径可能在 Promise 返回前发生，后置 `valid` 根本没有执行机会。

若规则不要求“有牌时不得取消”，使用 `forced:false` 可避开本报告确认的 forced 空确认分支，但会改变规则语义。若规则既要求强制、又要求在 `respond` 前完全验证，应另行调查自管选择协议；至少需要确认选择结果构造、`respondTo/skill/viewAs`、实体牌移动、AI、录像和联机同步，本文不给出未经验证的伪代码。

## 失败模式与冲突说明

- **较早报告的冲突**：参数调查把 `hasUsableCard(...) === true` 视为创建 `forced:true` 响应的安全门；后出的崩溃调查以更完整源码链证明该门会被虚拟牌能力、事件上下文和时序变化误报。本页将其降级为粗预检。
- **后出报告内部建议的降级**：崩溃报告提出“`forResult()` 后验证失败则绝不调用 `player.respond`”作为补强，但同一报告记录的调用链已经证明 `chooseToRespond` 在 `forResult()` 返回前内部调用 `player.respond`。因此这条建议只能保护技能后续收益，不能用于崩溃预防。
- 只检查 `result.bool`：如果 `forResult()` 正常返回了异常形状，会把空结果误判为后续效果成功；但增加检查仍不能拦截返回前崩溃。
- 只把 `forced` 改为 false：避免已知空确认崩溃，但若规则要求有牌不得取消，会弱化规则。
- 把“前置实体候选检查”写成绝对安全保证：动态钩子仍可能在选择期间清空候选。
- 把后置验证描述成 `respond` 前的验证：时序错误，标准 `chooseToRespond` 已在内部完成或尝试 `respond`。
- 手工 `discard(result.cards)`：标准 `chooseToRespond` 成功后已进入 `respond` 牌移动链，会造成重复移动。
- 用 `hasSha("respond")` 代替合法性检查：可能只看到牌名而忽略当前 `cardRespondable`。
- 为支持虚拟响应而允许空 `cards` 直接进入实体牌分支：缺少 `skill/viewAs` 协议时仍会产生无效 `card`。
- 未经另行验证就改为“自管选择 + 手动 respond”：可能改变标准响应事件、实体牌去向、技能关联、AI 和联机语义。

## 最小回归用例

1. 无实体牌、无虚拟能力：前置实体检查失败，不进入 `forced:true` 的 `chooseToRespond().forResult()`，失败分支执行一次。
2. `hiddenCard/viewAs` 令粗预检为真但无实体候选：仍不进入危险 forced 选择；这才是已知误报场景的崩溃预防点。
3. 有一张合法实体响应牌：设 forced；结果含实体牌和响应牌对象；成功效果只执行一次。
4. 有多张合法实体牌：必须选择一张，不能主动取消，只移动所选组成牌。
5. 有牌名匹配但在实际响应事件上下文受 `cardRespondable` / `filterCard` 禁用：不进入 forced 选择，不累计成功效果。
6. 前置检查后实体牌被动态钩子移动或禁用：这是明确的残余风险；测试应记录是否在 `forResult()` 返回前复现崩溃，不能把后置验证写成预期兜底。
7. 仅在 mock 令 `forResult()` 返回 `{bool:true,cards:[],card:无牌名VCard}` 时：后置验证应拒绝后续收益；该测试不证明真实引擎崩溃已被阻止。
8. 来源用实体牌和无实体虚拟牌分别触发上游用牌事件：只要上游过滤只看 `event.card.name`，两者都能触发；下游响应是否允许虚拟牌必须由规则另行定义。
9. 联机结果包装和第三方 `onChooseToRespond`：真实牌局中验证；未通过前保持非 `game-confirmed`。

## 版本风险

本结论锁定 v1.11.3。`forced` 的空集合放宽、`ui.click.ok` 的结果形状、`get.autoViewAs(undefined)`、`respond` 对 `event.card` 的读取以及 `cardRespondable` 的事件分支都可能随版本改变。升级时必须重跑“forced + 零候选”最小复现，并分别验证实体、转化和无实体虚拟响应。

## 来源 / 案例

- 主要来源：[霍旌【协攻】强制空响应崩溃边界](../霍旌接口/2026-09-14-协攻强制空响应崩溃.md)
- 发生冲突的较早来源：[霍旌【协攻】杀参数与响应链调查](../霍旌接口/2026-09-14-协攻杀参数.md)
- 案例中的武将名和技能名不构成本页结论；本页仅固化选择事件、实体牌和虚拟牌的通用安全边界。
