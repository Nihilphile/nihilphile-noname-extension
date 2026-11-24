# 延时锦囊（乐不思蜀/兵粮寸断/闪电）phaseJudge 阶段生效 Trigger 检测报告

**调查日期**: 2026-06-30  
**调查范围**: `resources/app/noname/` 核心库 + `card/standard.js` + `card/extra.js` + 全部 `character/` 技能文件  
**证据等级**: 源文件精确行号 + 完整事件链追踪

---

## 问题 1：延时锦囊真正"生效"发生在 phaseJudge 的哪个步骤？

### 确认事实

延时锦囊的生效在 `phaseJudge` 事件的 **content 第4步（step 3，行4286-4311）**，以 **card.name 同名事件** 的形式执行 `lib.card[name].effect`。

**完整流程**（`noname/library/element/content.js` 第4248-4311行）：

| 步骤 | 行号 | 操作 | 关键代码 |
|------|------|------|----------|
| Step 0 | 4249-4252 | 日志输出，收集判定区（`j`）的所有牌 | `event.cards = player.getCards("j")` |
| Step 1 | 4253-4279 | 取第一张牌→`lose`到处理区(ordering)→`$phaseJudge`动画→`event.cancelled = false`→**触发 `"phaseJudge"` 子事件**→判断是否有`effect`/`judge`/`nojudge` | `await event.trigger("phaseJudge")` (line 4268) |
| Step 2 | 4281-4285 | 若未取消且需判定 → 执行判定 `player.judge(event.card).set("type", "phase")` | line 4283 |
| Step 3 | 4286-4311 | **生效判定**：excluded→跳过；cancelled→cancel分支；**否则→创建 card.name 事件执行 effect()** | line 4300-4308 |

**Step 3 的生效代码**（行4300-4308）：
```javascript
} else {
    const next = game.createEvent(name);        // 创建 "lebu"/"bingliang"/"shandian" 事件
    next.setContent(lib.card[name].effect);     // 设置内容为 effect() 函数
    next._result = event.result;                // 传入判定结果
    next.card = VJudge;
    next.cards = VJudge?.cards ?? [];
    next.player = player;
    await next;                                 // 执行生效
}
```

### 推断

- **生效 = `lib.card[name].effect()` 被执行**，发生在判定之后、未被无懈取消的情况下
- 乐不思蜀 的 effect：`player.skip("phaseUse")`（standard.js:3234-3236）
- 兵粮寸断 的 effect：`player.skip("phaseDraw")`（extra.js:564-571）
- 闪电 的 effect：判定失败→`player.damage(3, "thunder", "nosource")`；判定成功→`player.addJudgeNext(card)`（standard.js:3314-3319）

---

## 问题 2：有什么 trigger 事件可以检测"延时锦囊对玩家生效"？

### 确认事实

有三层可选事件，推荐方案如下：

### 方案 A（推荐）：监听 card.name 同名事件

```javascript
// 监听 乐不思蜀 生效
trigger: { player: "lebu" }
// 或全局：trigger: { global: "lebu" }
```

**精确检测"在 phaseJudge 中生效（非 useCard 阶段使用）"**：
```javascript
trigger: { player: "lebu" },
filter(event, player) {
    return event.getParent().name === "phaseJudge";
}
```

**理由**：
- 同名事件 `"lebu"` / `"bingliang"` / `"shandian"` 在 phaseJudge Step 3 **仅在未被取消且（如有判定）已判定后** 创建并执行（content.js:4301）
- `event.getParent().name === "phaseJudge"` 将其与 useCard 阶段的同名事件区分开（见问题3）
- `event._result` 携带判定结果（`event._result.bool` 表示判定是否成功）

### 方案 B：监听 phaseJudge 内部子事件 + 检查 cancelled

```javascript
trigger: { player: "phaseJudge" },
filter(event, player) {
    // 这个 trigger 对每张判定牌触发一次（在判定之前）
    // 此时 event.cancelled 尚未被设置——需要延迟检查
}
```

**缺陷**：`"phaseJudge"` 子事件在 **判定之前** 触发（content.js:4268），此时还不知道判定结果；且同名 `"phaseJudge"` 与阶段事件重名，容易混淆。

### 方案 C：监听 Cancel 事件（检测"被无懈取消"）

```javascript
// 仅 闪电 有此事件（因为只有 shandian 定义了 cancel 函数）
trigger: { player: "shandianCancel" }
// 乐不思蜀、兵粮寸断 没有 lebuCancel / bingliangCancel 事件
```

**证据**：
- `shandianCancel` 在 content.js:4293 被创建，仅当 `lib.card[name].cancel` 存在时（standard.js:3321-3323）
- `lebu` 和 `bingliang` **没有定义 cancel 函数**（standard.js:3214-3285, extra.js:544-601），因此被无懈取消时 **不触发任何 Cancel 事件**，牌直接丢弃

### 方案 D：监听 phaseJudgeAfter + 手动检查

```javascript
trigger: { player: "phaseJudgeAfter" }
// 此时该玩家的所有判定牌已处理完毕
// 需要手动对比处理前后状态来推断哪些牌生效了
```

---

## 问题 3：useCard 阶段的同名事件和 phaseJudge 阶段的生效事件是否相同？如何区分？

### 确认事实

**同名但不同内容，通过 `getParent().name` 区分**。

#### useCard 阶段（使用牌时）

`card/standard.js:8402-8414`（`game.finishCard`）：
```javascript
} else if (card.type == "delay" || card.type == "special_delay") {
    if (card.content == void 0) {
        card.content = lib.element.content.addJudgeCard;  // 默认内容
    }
}
```

`content.js:9650-9651`（useCard 内容中）：
```javascript
let next = game.createEvent(event.card.name);    // 创建 "lebu" 事件
next.setContent(info.content);                    // info.content = addJudgeCard
```

**结果**：创建一个叫 `"lebu"` 的事件，但内容是把牌放入目标判定区（`addJudgeCard` → `target.addJudge(card, cards)`）。此事件的 `parent` 是 `"useCard"`。

#### phaseJudge 阶段（生效时）

`content.js:4301`：
```javascript
const next = game.createEvent(name);             // 创建 "lebu" 事件
next.setContent(lib.card[name].effect);           // lib.card.lebu.effect = 跳过出牌阶段
```

**结果**：创建同名 `"lebu"` 事件，但内容是执行卡牌效果。此事件的 `parent` 是 `"phaseJudge"`。

### 区分方式

| 检查项 | useCard 阶段 | phaseJudge 阶段 |
|--------|-------------|-----------------|
| `event.getParent().name` | `"useCard"` | `"phaseJudge"` |
| `event.type` | `"card"` (line 9657) | 未设置（undefined） |
| `event._result` | 无 | 有（判定结果，line 4303） |
| 事件内容 | `addJudgeCard` | `lib.card[name].effect` |
| 效果 | 牌进入判定区 | 执行跳过/伤害/移动 |

### 推荐检测写法

```javascript
// 精确检测"延时锦囊在 phaseJudge 中生效"
trigger: { player: "lebu" },  // 或 global: "lebu"
filter(event, player) {
    return event.getParent().name === "phaseJudge";
}
```

---

## 问题 4：有没有现成技能监听延时锦囊生效？

### 确认事实

**没有技能直接以 card.name 事件（"lebu"/"bingliang"/"shandian"）作为 trigger。**

搜索了全部 `character/` 和 `extension/` 目录，没有找到 `trigger: { player: "lebu" }` 或类似的写法。

### 现有相关技能模式

| 技能 | 文件 | 触发事件 | 检测方式 |
|------|------|----------|----------|
| `_wuxie`（无懈可击） | card/standard.js:4303-4304 | `{ player: ["useCardToBegin", "phaseJudge"] }` | 响应 phaseJudge 子事件，可取消判定牌 |
| `yonglve` / `reyonglve` | character/yijiang/skill.js:6621/6682 | `{ global: "phaseJudgeBegin" }` | 阶段开始时手动检查判定区牌名 |
| `dragqianxun` | character/offline/skill.js:44640 | `{ player: "phaseJudgeBegin" }` | 同时监听 phaseJudgeBegin（主动技）和 phaseJudge（被动触发） |
| zhanfa 某技能 | noname/library/zhanfa.js:350-373 | `{ global: ["eventNeutralized"], player: ["wuxieAfter"] }` | 检测无懈取消后的牌回收 |

### 关键发现

- **无懈可击（`_wuxie`）** 响应的是 `"phaseJudge"` 子事件（content.js 第4268行的 `event.trigger("phaseJudge")`），而非 card.name 事件
- 现有技能如 `yonglve` 在 `phaseJudgeBegin` 阶段就进行干预（弃置判定牌），发生在判定和生效**之前**
- **没有任何现有技能监听"生效后"的事件**

---

## 问题 5：如何知道延时锦囊"没被无懈且在判定后生效"？

### 确认事实

使用 **问题2 方案 A** 的精确写法即可。以下详细说明为什么这样能确保"没被无懈且已判定"。

### 事件链分析

当一张延时锦囊在 phaseJudge 中被处理时，完整事件链为：

```
phaseJudge (阶段事件)
  ├── phaseJudgeBefore (自动生命周期)
  ├── phaseJudgeBegin (自动生命周期)
  ├── [content Step 0] 收集判定区牌
  ├── [content Step 1] 取牌 → lose到处理区 → event.trigger("phaseJudge")  ←──无懈在此拦截
  │     ├── 若无懈响应：event.cancelled = true
  │     └── 若无懈不响应：event.cancelled = false
  ├── [content Step 2] if !cancelled: judge (判定)
  └── [content Step 3] 分支：
        ├── if excluded: 忽略
        ├── if cancelled && !direct: 检查 lib.card[name].cancel
        │     ├── lebu/bingliang: 无 cancel() → 牌直接丢弃，无事件
        │     └── shandian: 有 cancel() → 创建 "shandianCancel" 事件 → addJudgeNext
        └── else: 创建 card.name 事件 → effect() ←──★ 生效在此
```

### 保证条件

监听 `"lebu"` / `"bingliang"` / `"shandian"` 且 `event.getParent().name === "phaseJudge"` 时：
- ✅ 牌**肯定没被无懈取消**（否则走的是 cancel 分支，不会创建同名事件）
- ✅ 牌**肯定没被 excluded**（否则跳过整个 Step 3）
- ✅ 如有判定函数，**判定已完成**（Step 2 在 Step 3 之前执行）
- ✅ `event._result` 可获取判定结果：
  - `event._result.bool`：判定是否成功（bool === false 通常意味着"对目标不利"）
  - `event._result.card`：判定牌
  - `event._result.suit`：判定牌花色
  - `event._result.number`：判定牌点数

### 判定结果解读

| 卡牌 | 判定成功条件 | result.bool |
|------|-------------|-------------|
| 乐不思蜀 | 红桃 → 跳过无效 | `true` |
| 兵粮寸断 | 梅花 → 跳过无效 | `true` |
| 闪电 | 黑桃2~9 → 命中 | `true`（因为 judge 返回负值→judge2 翻转）|

具体判断函数（see `card/standard.js:3221-3232` for lebu, `card/extra.js:552-563` for bingliang）：
```javascript
// 乐不思蜀
judge(card) { return get.suit(card) === "heart" ? 1 : -2; }
judge2(result) { return result.bool === false ? true : false; }  // 翻转

// 兵粮寸断
judge(card) { return get.suit(card) == "club" ? 1 : -2; }
judge2(result) { return result.bool == false ? true : false; }   // 翻转

// 闪电
judge(card) { return (spade 2-9) ? -5 : 1; }
judge2(result) { return result.bool === false ? true : false; }  // 翻转
```

### 精确 trigger 写法

```javascript
// 示例：监听 乐不思蜀 真正生效
trigger: { player: "lebu" },
filter(event, player) {
    // 确保是 phaseJudge 阶段的生效事件，而非 useCard 阶段的使用事件
    return event.getParent().name === "phaseJudge";
},
async content(event, trigger, player) {
    // event._result 已包含判定结果
    const judged = event._result;
    // 乐不思蜀生效 = 判定结果对目标不利
    // (由于judge2翻转，bool===false 表示被乐住)
    game.log(player, "被乐不思蜀生效，判定结果:", judged.bool);
}
```

---

## 问题 6：闪电被改判/无懈后的移动（addJudgeNext）有没有特殊事件？

### 确认事实

**没有特殊事件。闪电移动统一使用 `addJudgeNext → addJudge` 事件。**

### 两种移动场景

#### 场景 A：闪电生效但判定不中（黑桃2~9以外的牌）

`card/standard.js:3314-3319`（effect 函数）：
```javascript
effect() {
    if (result.bool === false) {
        player.damage(3, "thunder", "nosource");  // 命中：雷电伤害
    } else {
        player.addJudgeNext(card);                  // 不中：移动到下家
    }
}
```

#### 场景 B：闪电被无懈可击取消

`card/standard.js:3321-3323`（cancel 函数）：
```javascript
cancel() {
    player.addJudgeNext(card);                      // 被取消：移动到下家
}
```

触发事件：`"shandianCancel"` → `addJudgeNext` → 找到下家 → `target.addJudge(card, cards)` → `"addJudge"` 事件

### addJudgeNext 详细流程

`noname/library/element/player.js:9135-9165`：
```javascript
addJudgeNext(card, unlimited) {
    // 1. 检查牌是否仍在处理区
    // 2. 从当前玩家开始，循环找下一个合法目标
    let target = this;
    do {
        target = target.getNext();
        if (!target) target = this;
        if (lib.filter.judge(card, target, target)) break;  // 找到合法目标
        if (target == this) target = null;
    } while (target);
    // 3. 对找到的目标执行 addJudge
    if (target) return target.addJudge(card, cards);  // → "addJudge" 事件
}
```

### 可检测的事件

| 事件 | 触发时机 | 备注 |
|------|----------|------|
| `"shandianCancel"` | 闪电被无懈取消时 | 仅闪电池有此事件（其他延时锦囊无） |
| `"shandian"` | 闪电生效时（effect被调用） | 包括判定命中（伤害）和判定不中（移动）两种情况 |
| `"addJudge"` | 闪电移动到下家判定区时 | fire on the NEXT target |
| `"addJudgeAfter"` | addJudge 完成后 | 可用于检测新牌进入判定区 |

### 区分闪电"伤害"vs"移动"

在 `"shandian"` 事件的 content 中，通过 `result.bool` 区分：
```javascript
trigger: { global: "shandian" },
filter(event, player) {
    return event.getParent().name === "phaseJudge";
},
async content(event, trigger, player) {
    if (event._result && event._result.bool === false) {
        // 闪电命中：3点雷电伤害
    } else {
        // 闪电不中：将移动到下家（addJudgeNext 已执行）
    }
}
```

---

## 总结：延时锦囊生效的精确 Trigger 写法

### 通用模板

```javascript
// ===== 乐不思蜀 生效检测 =====
skill_lebu_effect_detect: {
    trigger: { player: "lebu" },     // 或 { global: "lebu" }
    filter(event, player) {
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        // 乐不思蜀已生效（跳过出牌阶段即将执行）
        // event._result.bool: false=被乐住, true=乐无效
    }
}

// ===== 兵粮寸断 生效检测 =====
skill_bingliang_effect_detect: {
    trigger: { player: "bingliang" },
    filter(event, player) {
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        // 兵粮寸断已生效（跳过摸牌阶段即将执行）
    }
}

// ===== 闪电 生效检测 =====
skill_shandian_effect_detect: {
    trigger: { player: "shandian" },
    filter(event, player) {
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        if (event._result && event._result.bool === false) {
            // 闪电命中 → 3点雷电伤害（damage 事件将随后触发）
        } else {
            // 闪电不中 → 已移动到下家
        }
    }
}

// ===== 闪电 被无懈取消 =====
skill_shandian_cancel_detect: {
    trigger: { player: "shandianCancel" },  // 仅闪电有 Cancel 事件
    async content(event, trigger, player) {
        // 闪电被无懈取消 → 已移动到下家
    }
}
```

### 事件对比速查表

| 事件名 | 在哪触发 | 触发时机 | 附带信息 | 仅延时锦囊? |
|--------|----------|----------|----------|------------|
| `"lebu"` / `"bingliang"` / `"shandian"` (parent=useCard) | useCard 内容 | 牌被使用时 | 无判定结果 | ❌ 所有同名牌 |
| `"lebu"` / `"bingliang"` / `"shandian"` (parent=phaseJudge) | phaseJudge Step 3 | **生效时** | `event._result` 含判定结果 | ✅ |
| `"phaseJudge"` (子事件) | phaseJudge Step 1 | 每张判定牌，判定前 | `event.cancelled` 标记无懈状态 | ✅ |
| `"phaseJudgeBegin"` | phaseJudge 生命周期 | 判定阶段开始时 | 判定区所有牌 `event.cards` | ✅ |
| `"phaseJudgeAfter"` | phaseJudge 生命周期 | 判定阶段结束后 | 无 | ✅ |
| `"shandianCancel"` | phaseJudge Step 3 cancel分支 | 闪电被无懈时 | 无判定结果 | ✅ |
| `"judge"` (type="phase") | phaseJudge Step 2 | 判定时 | 判定牌 | ❌ |
| `"addJudge"` | addJudgeNext → addJudge | 闪电移动到下家时 | 牌信息 | ❌ 所有 addJudge |
| `"eventNeutralized"` | GameEvent.neutralize | 事件被无懈抵消时 | `event._neutralize_event` | ❌ |

---

## 未决项

1. **乐不思蜀/兵粮寸断被无懈取消后的牌去向**：因为没有 `cancel()` 函数，牌在 Step 1 已被 `lose` 到处理区，Step 3 取消时不触发任何 Cancel 事件，牌随后被销毁。这不影响生效检测，但如果需要知道"牌被无懈了"，可以监听 `"phaseJudge"` 子事件并在无懈的 `_wuxie` 技能执行后检查 `event.cancelled`。

2. **`event.direct` 标志**：在 Step 3 中有一个 `!event.direct` 的检查（line 4291）。这个标志的来源和用途在现有搜索结果中未完全追踪到——它可能用于某些特殊技能（如帷幕）直接跳过一个判定牌而不触发任何事件。如果遇到此类场景需要进一步调查。

3. **延时锦囊无 `judge` 函数的情况**：如果某延时锦囊没有 `judge` 函数只有 `effect`，Step 1 会设置 `nojudge = true`，跳过判定直接进入 Step 3 生效。这种情况下 `event._result` 为 undefined。确认三张标准延时锦囊都有 `judge` 函数。

---

## 关键文件索引

| 文件 | 关键行号 | 内容 |
|------|----------|------|
| `noname/library/element/content.js` | 4248-4311 | phaseJudge 完整内容（4步） |
| `noname/library/element/content.js` | 4268 | "phaseJudge" 子事件触发点（无懈拦截点） |
| `noname/library/element/content.js` | 4283 | 判定执行 |
| `noname/library/element/content.js` | 4293 | Cancel 事件创建（name + "Cancel"） |
| `noname/library/element/content.js` | 4300-4308 | **生效事件创建（name 事件 + effect 内容）** |
| `noname/library/element/content.js` | 502-581 | executeDelayCardEffect（单独执行延时锦囊效果） |
| `noname/library/element/player.js` | 5320-5325 | player.phaseJudge() 方法 |
| `noname/library/element/player.js` | 1363-1384 | player.executeDelayCardEffect() |
| `noname/library/element/player.js` | 9135-9165 | player.addJudgeNext() |
| `noname/library/element/gameEvent.js` | 212-257 | GameEvent.loop()（自动生命周期：Before/Begin/End/After） |
| `card/standard.js` | 3214-3285 | 乐不思蜀（lebu）完整定义 |
| `card/standard.js` | 3286-3380 | 闪电（shandian）完整定义 |
| `card/standard.js` | 4297-4400 | _wuxie（无懈可击）技能定义 |
| `card/standard.js` | 3178-3192 | 无懈可击 content()：区分 phaseJudge vs useCard |
| `card/standard.js` | 8402-8414 | 延时类牌自动分配 content = addJudgeCard |
| `card/extra.js` | 544-601 | 兵粮寸断（bingliang）完整定义 |
| `noname/game/index.js` | 5595-5604 | game.createEvent()（事件 parent 设置） |
