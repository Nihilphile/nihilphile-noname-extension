# 无名杀引擎 useCard 事件生命周期探索报告

**日期**: 2026-06-30  
**代码库**: 无名杀子琪懒人包 v1.11.3  
**核心文件**: `noname/library/element/content.js`, `gameEvent.js`, `card/standard.js`, `card/extra.js`

---

## 1. useCard 事件完整链

### 1.1 顶层事件顺序 (content.js:9029-9764)

```
useCard 事件创建 (player.js:7084)
 └─ useCard0          (line 9274) — 牌被抛出后、动画播放后
 └─ useCard1          (line 9350) — 日志显示后
 └─ yingbian          (line 9354) — 应变机制触发
 └─ useCard2          (line 9358) — 第二预处理阶段
 └─ useCard           (line 9362) — 主触发阶段
 └─ useCardToPlayer   (lines 9404-9435) — 目标分拣阶段1
 └─ useCardToTarget   (lines 9437-9468) — 目标分拣阶段2
 └─ useCardToPlayered (lines 9484-9515) — 目标分拣阶段3
 └─ useCardToTargeted (lines 9517-9551) — 目标分拣阶段4
 └─ [contentBefore]   (lines 9553-9603) — 牌的contentBefore处理
 └─ [牌名事件]         (line 9650-9697) — 牌的核心效果, type="card"
 └─ [contentAfter]    (lines 9709-9728) — 牌的contentAfter处理
 └─ 多目标循环         (line 9704, effectCount循环 line 9735)
 └─ 事件结束            (line 9757)
```

### 1.2 牌名事件（如 sha）的内部生命周期 (gameEvent.js:212-256)

牌名事件设置了 `type="card"` (content.js line 9657)，这触发了 gameEvent.js 的自动生命周期：

```javascript
// gameEvent.js lines 213-219
const trigger = async (trigger2, to) => {
    this._triggered = to;
    if (this.type == "card") {
        await this.trigger("useCardTo" + trigger2);  // 对card类型额外触发
    }
    await this.trigger(this.name + trigger2);         // 对所有事件触发
};
```

**牌名事件（如 sha）的完整生命周期：**

```
shaBefore       + useCardToBefore     (_triggered=0→1)
shaBegin        + useCardToBegin      (_triggered=1→2)
[sha content 执行: 目标出闪/命中/伤害判定]
shaEnd          + useCardToEnd        (_triggered=2→3)
shaAfter        + useCardToAfter      (_triggered=3→4)
```

**useCard 顶层事件的生命周期**（无 type="card"，不触发 useCardToX）：

```
useCardBefore   (line 9274前自动触发)
useCardBegin    (自动)
[useCard content 执行]
useCardEnd      (自动: this.name + "End")
useCardAfter    (自动: this.name + "After")
```

### 1.3 各事件属性表

#### useCard 顶层事件属性 (content.js:9029-9086)

| 属性 | 类型 | 说明 |
|------|------|------|
| `event.card` | Card/VCard | 使用的牌 |
| `event.cards` | Card[] | 构成牌的实体牌数组 |
| `event.targets` | Player[] | 所有目标列表 |
| `event.num` | number | 当前处理的目标索引 |
| `event.player` | Player | 使用牌的角色 |
| `event.skill` | string | 通过技能使用时记录技能名 |
| `event.excluded` | Player[] | 被排除的目标列表 |
| `event.directHit` | Player[] | 不可被闪避的目标列表 |
| `event.forceDie` | boolean | 强制结算完成 |
| `event.baseDamage` | number | 基础伤害值 (默认1) |
| `event.effectCount` | number | 效果结算次数 (默认1) |
| `event.effectedCount` | number | 已结算次数计数器 |
| `event.customArgs` | object | 自定义参数 {default:{}, [playerid]:{}} |

#### useCardToPlayer / useCardToTarget 等子事件属性 (content.js:9421-9433)

| 属性 | 说明 |
|------|------|
| `next.targets` | 所有目标 (继承自 useCard) |
| `next.target` | **当前**正在处理的目标 |
| `next.card` | 使用的牌 |
| `next.cards` | 实体牌数组 |
| `next.player` | 使用牌的角色 |
| `next.skill` | 技能名 |
| `next.excluded` | 被排除的目标 |
| `next.directHit` | 不可闪避的目标 |
| `next.isFirstTarget` | 是否为第一个目标（仅首次为 true） |

---

## 2. 如何判断卡牌"没有被抵消"

### 2.1 杀（sha）的命中判断 (card/standard.js:214-240)

杀的结算分为几个阶段，每个阶段有明确的 trigger：

```
step 1: 目标选择是否出闪
step 2:
  ├─ 未出闪 → 触发 "shaHit" → 进入 step 3 造成伤害
  └─ 出闪成功 → 触发 "shaMiss" → 结算结束
step 3: 
  ├─ 造成伤害 → trigger("shaDamage")
  └─ 未造成伤害 → trigger("shaUnhirt")
```

### 2.2 在 useCardToEnd 中判断

`useCardToEnd` 在 sha 内容执行完毕后触发。此时可以通过以下方式判断：

```javascript
// 方式1: 检查 sha 事件的结果
if (trigger._result && trigger._result.bool) {
    // sha 命中（造成了伤害）
}
if (trigger._result && !trigger._result.bool) {
    // sha 未命中（被闪避或未造成伤害）
}

// 方式2: 监听不同的 trigger 分情况处理
trigger: {
    player: "shaHit",    // sha 命中
    player: "shaMiss",   // sha 被闪避
}
```

### 2.3 在 useCardAfter 中判断

`useCardAfter` 是 useCard 顶层事件触发（整张牌使用完毕后的阶段）。同样可以通过 `trigger._result` 检查。

### 2.4 通用卡牌的取消/排除机制

| 机制 | 实现 |
|------|------|
| **无懈可击抵消** | `event.cancel()` → `_cancelled = true` → 触发 `eventNameCancelled` |
| **目标被排除** | `event.excluded` 数组包含被排除的目标 → 触发 `useCardToExcluded` |
| **目标被忽略** | `info.ignoreTarget` 判定 → 触发 `useCardToIgnored` |
| **直接命中** | `event.directHit` 数组 → 跳过出闪询问 (line 141) |

### 2.5 "成为目标后结算完毕" 的典型 trigger 写法

参考实战代码 (card/standard.js:3783-3784)：

```javascript
// 对于目标角色：监听多个可能的结束事件
trigger: {
    target: ["shaMiss", "useCardToExcluded", "useCardToEnd", "eventNeutralized"],
}
// shaMiss:      被杀命中但被闪避
// useCardToExcluded: 目标被排除
// useCardToEnd: 杀对目标结算完毕
// eventNeutralized: 事件被无效化

// 对于使用牌的角色：监听 useCard 级别的结束事件
trigger: {
    global: ["useCardEnd"],
}
// 或用 player 模式：
trigger: {
    player: ["shaMiss", "useCardAfter", "useCardCancelled"],
}
```

**关键模式**：同时覆盖 `shaMiss` + `useCardToExcluded` + `useCardToEnd` + `eventNeutralized` 可以捕获"成为目标后结算完毕"的所有情况（无论闪避、排除、正常结算、无效化）。

---

## 3. 延时锦囊的结算阶段 (phaseJudge)

### 3.1 判定阶段入口 (player.js:5320-5325)

```javascript
phaseJudge() {
    var next = game.createEvent("phaseJudge");
    next.player = this;
    next.setContent("phaseJudge");
    return next;
}
```

判定阶段是回合阶段列表的第2个阶段（player.js:4248, content.js:4003）：
```
phaseZhunbei → phaseJudge → phaseDraw → phaseUse → phaseDiscard → phaseJieshu
```

### 3.2 判定阶段内容 (content.js:4248-4308)

```
phaseJudge:
  1. 获取判定区所有牌 (player.getCards("j"))
  2. 遍历判定区牌:
     a. 移去判定牌 (player.lose)
     b. 播放动画 ($phaseJudge)
     c. 设置 event.cancelled = false
     d. 触发 "phaseJudge" 事件
     e. 如果卡牌有 judge 函数 → 执行判定
     f. 根据判定结果:
        - 如果未被取消 (!cancelled && !nojudge): 执行判定
        - 如果被取消且有 cancel 函数: 执行取消效果 (如改判)
        - 否则: 执行卡牌 effect
```

### 3.3 具体延时锦囊定义

#### 乐不思蜀 (lebu) — card/standard.js:3214-3285

```javascript
lebu: {
    type: "delay",
    filterTarget(card, player, target) {
        return lib.filter.judge(card, player, target) && player !== target;
    },
    judge(card) {
        if (get.suit(card) === "heart") return 1;   // 判定成功
        return -2;                                    // 判定失败
    },
    judge2(result) {
        if (result.bool === false) return true;       // 失败则生效
        return false;
    },
    effect() {
        if (result.bool === false) {
            player.skip("phaseUse");                  // 生效：跳过出牌阶段
        }
    },
    // 无 cancel 函数 → 被无懈可击抵消后无额外效果
}
```

#### 兵粮寸断 (bingliang) — card/extra.js:544-597

```javascript
bingliang: {
    type: "delay",
    range: { global: 1 },
    filterTarget(card, player, target) {
        return lib.filter.judge(card, player, target) && player != target;
    },
    judge(card) {
        if (get.suit(card) == "club") return 1;       // 梅花: 判定成功
        return -2;                                     // 其他花色: 判定失败
    },
    judge2(result) {
        if (result.bool == false) return true;
        return false;
    },
    effect() {
        if (result.bool == false) {
            player.skip("phaseDraw");                  // 生效：跳过摸牌阶段
        }
    },
}
```

#### 闪电 (shandian) — card/standard.js:3286-3323

```javascript
shandian: {
    type: "delay",
    cardnature: "thunder",                            // 牌属性：雷
    filterTarget(card, player, target) {
        return lib.filter.judge(card, player, target) && player === target;
    },
    judge(card) {
        if (get.suit(card) === "spade" && get.number(card) > 1 && get.number(card) < 10)
            return -5;                                 // 黑桃2-9: 判定命中
        return 1;                                     // 其他: 未命中
    },
    judge2(result) {
        if (result.bool === false) return true;
        return false;
    },
    effect() {
        if (result.bool === false) {
            player.damage(3, "thunder", "nosource");   // 生效：3点雷电伤害
        } else {
            player.addJudgeNext(card);                 // 未生效：移动到下家
        }
    },
    cancel() {
        player.addJudgeNext(card);                     // 被取消：移动到下家
    },
}
```

### 3.4 检测延时锦囊生效的方式

在 phaseJudge 流程中：

```javascript
// way 1: 监听 phaseJudge 触发
trigger: { player: "phaseJudgeBegin" }

// way 2: 监听具体牌名事件
trigger: { player: "lebu" }      // 乐不思蜀生效时触发
trigger: { player: "bingliang" } // 兵粮寸断生效时触发
trigger: { player: "shandian" }  // 闪电生效时触发

// way 3: 检查 event.cancelled 状态
// 在 phaseJudge 内容中 line 4267: event.cancelled = false
// line 4282: if (!event.cancelled && !event.nojudge) → 执行判定
// line 4291: if (event.cancelled && !event.direct) → 执行取消效果
```

---

## 4. 杀的自然属性（fire/thunder/none）获取和比较

### 4.1 get.nature(card, player) — get/index.js:3264-3279

```javascript
nature(card, player) {
    if (typeof card == "string") {
        return card.split(lib.natureSeparator).sort(lib.sort.nature)
                   .join(lib.natureSeparator);
    }
    if (Array.isArray(card)) {
        return card.sort(lib.sort.nature).join(lib.natureSeparator);
    }
    var nature = card.nature;
    if (player不为false且牌在手牌区) {
        var owner = get.owner(card);
        if (owner) {
            return game.checkMod(card, owner, nature, "cardnature", owner);
        }
    }
    return nature;  // 如 "fire"、"thunder"、"fire|thunder"、"stab"、undefined
}
```

### 4.2 get.natureList(card, player) — get/index.js:3286-3301

```javascript
natureList(card, player) {
    // 返回数组: ["fire"]、["thunder"]、["fire","thunder"]、["stab"]、[]
}
```

### 4.3 game.hasNature(item, nature, player) — game/index.js:562-571

```javascript
hasNature(item, nature, player) {
    var natures = get.natureList(item, player);
    if (!nature) return natures.length > 0;  // 是否有任意属性
    if (nature == "linked") {
        return natures.some(n => lib.linked.includes(n));  // 是否为传导属性
    }
    return get.is.sameNature(natures, nature);  // 比较是否相同
}
```

### 4.4 杀支持的属性 (card/standard.js:98)

```javascript
sha: {
    nature: ["thunder", "fire", "kami", "ice"],
    // kami = 神, ice = 冰
    // stab = 刺 (刺杀属性)
}
```

### 4.5 常见用法

```javascript
// 获取属性列表
var natures = get.natureList(event.card);  // ["fire", "thunder"]

// 判断是否为火杀
if (game.hasNature(event.card, "fire")) { ... }

// 判断是否为雷杀
if (game.hasNature(event.card, "thunder")) { ... }

// 判断是否有任意属性
if (game.hasNature(event.card)) { ... }

// 判断是否为传导属性 (fire/thunder)
if (game.hasNature(event.card, "linked")) { ... }

// 获取属性字符串用于UI
var natureStr = get.nature(event.card);      // "fire|thunder"
var firstNature = get.natureList(event.card)[0]; // "fire"

// 设置属性线颜色 (content.js:9302)
var nature = get.natureList(event.card)[0];
if (nature) config.color = nature;  // 用于 player.line(targets, {color: "fire"})
```

### 4.6 属性杀与伤害类型的关系

杀造成伤害时传递属性 (card/standard.js:234)：
```javascript
target.damage(get.nature(event.card));
// get.nature 返回 "fire"/"thunder"/"ice"/"kami"/undefined
// undefined/none → 普通伤害
// "fire" → 火焰伤害
// "thunder" → 雷电伤害
```

---

## 5. 获取使用的卡牌的所有目标

### 5.1 event.targets (useCard 层级)

```javascript
// 在 useCard 事件及所有子事件中
event.targets  // Player[] — 卡牌的所有预定目标
```

### 5.2 event.target (牌名事件/useCardToX 层级)

```javascript
// 在 sha/useCardToPlayer/useCardToTarget 等事件中
event.target   // Player — 当前正在处理的单个目标
```

### 5.3 额外目标

```javascript
event.addedTargets    // 额外添加的目标（如方天画戟）
event._targets        // 内部目标记录
```

### 5.4 目标处理循环 (content.js:9404-9551)

```javascript
// 4组 triggeredTargets 控制目标的分阶段处理:
event.triggeredTargets1  // → useCardToPlayer 事件
event.triggeredTargets2  // → useCardToTarget 事件
event.triggeredTargets3  // → useCardToPlayered 事件
event.triggeredTargets4  // → useCardToTargeted 事件

// 每组通过 event.getTriggerTarget() 迭代目标:
let target = event.getTriggerTarget(targets, event.triggeredTargetsN);
```

### 5.5 实战：从 useCardToEnd 中获取所有目标

```javascript
// 方法1: 通过 parent 链回溯到 useCard
filter(event, player) {
    const useCard = event.parent;  // useCardToEnd.parent === 牌名事件
    // 继续向上: event.parent.parent === useCard 事件
    const allTargets = useCard.targets;
    const currentTarget = event.target;
}

// 方法2: 直接使用 targets 属性
// useCardToPlayer/useCardToTarget 等子事件都复制了 targets
event.targets   // 所有目标
event.target    // 当前目标
```

---

## 6. "成为目标后结算完毕"的 trigger 写法总结

### 6.1 四种典型模式

#### 模式A: 目标角色监听（覆盖退出/排除/闪避/无效化）
```javascript
trigger: {
    target: ["shaMiss", "useCardToExcluded", "useCardToEnd", "eventNeutralized"],
}
```

#### 模式B: 使用者监听（useCard顶层完成）
```javascript
trigger: {
    player: ["shaMiss", "useCardAfter", "useCardCancelled"],
}
// 或
trigger: {
    player: "useCardEnd",    // useCard 顶层事件结束时
}
// 或
trigger: {
    global: "useCardEnd",    // 全局监听任意角色 useCard 结束
}
```

#### 模式C: 牌名事件完成时（针对单个目标）
```javascript
trigger: {
    target: "shaEnd",         // sha对当前目标结算完毕
    target: "useCardToEnd",   // card事件对当前目标结算完毕
}
```

#### 模式D: 延时锦囊结算完毕
```javascript
trigger: {
    player: "phaseJudgeEnd",  // 判定阶段结束
    player: "phaseJudgeAfter",// 判定阶段后
}
// 或监听具体锦囊的 effect/cancel 事件
trigger: {
    player: "lebu",           // 乐不思蜀生效
    player: "shandian",       // 闪电生效
}
```

### 6.2 通过 useCardToEnd 精确匹配父事件 ID

```javascript
// 来自 extension/Nihilphile/module/tia.js:674
filter(event, player) {
    const useCard = event.parent;       // useCardToEnd.parent 是牌名事件
    // useCard.parent 才是 useCard 事件
    if (!useCard || !useCard._tia_rongguang_id) return false;
    
    // 判断是否为最后一个目标
    const targets = useCard.targets || [];
    if (targets.length && event.target && 
        event.target !== targets[targets.length - 1]) return false;
    return true;
}
```

---

## 7. 关键发现与决策输入

### 7.1 版本特征
- 本版本 `useCardToEnd` 和 `useCardAfter` 并非在 content.js 中显式 `trigger()` 调用
- 它们是 **gameEvent.js 的事件循环自动生成的**：通过 `this.name + "End"/"After"` 模式
- `useCardToPlayer` / `useCardToTarget` / `useCardToPlayered` / `useCardToTargeted` 是 content.js 中显式 `createEvent` 创建的占位事件，其 content 为 `emptyEvent`，作用是触发 `event.name` 自身作为 trigger

### 7.2 事件命名规律
- `<eventName>Before` / `<eventName>Begin` / `<eventName>End` / `<eventName>After` = 自动生成
- `<eventName>` = 通过 `emptyEvent` content 在内容阶段触发
- `useCardTo<eventName>` = 对 card 类型事件额外触发的全局事件
- `useCard<number>` = 在 useCard 内容中显式触发的特殊阶段

### 7.3 建议的设计模式
对于新技能的开发：

| 需求 | 推荐 trigger |
|------|-------------|
| 使用牌前 | `useCardBefore` 或 `useCard1` |
| 成为目标时 | `useCardToPlayer` / `useCardToTarget` (通过 target) |
| 成为目标后 | `useCardToPlayered` / `useCardToTargeted` (通过 target) |
| 牌对目标结算完毕 | `useCardToEnd` (target) 或 `shaEnd` (target) |
| 牌使用完毕 | `useCardEnd` / `useCardAfter` (player/global) |
| 杀命中/未命中 | `shaHit` / `shaMiss` (player/target) |
| 造成伤害 | `shaDamage` / `damage` (source/target) |
| 延时锦囊生效 | `phaseJudge` 或具体牌名事件 (player) |
| 目标结算完毕（含排除） | `["shaMiss", "useCardToExcluded", "useCardToEnd", "eventNeutralized"]` |

### 7.4 未确认项
- `phaseJudgeCancelled`、`phaseJudgeEnd`、`phaseJudgeAfter` 的确切触发顺序需要进一步在运行时验证
- `filterTarget2` 实际上仅在 `lib.filter` 中定义为辅助函数，未见直接作为 trigger 模式大量使用的证据

---

> **证据来源**: 所有行号引用自主代码库 `resources\app` 目录。`content.js`(9029-9764)、`gameEvent.js`(212-256)、`standard.js`(95-273,3214-3323,3783-3793)、`extra.js`(544-597)、`get/index.js`(3147-3301)、`game/index.js`(562-571)。
