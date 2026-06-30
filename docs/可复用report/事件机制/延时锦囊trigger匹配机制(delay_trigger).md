# 延时锦囊在 phaseJudge 中生效时 skill trigger 匹配机制报告

**调查日期**: 2026-06-30
**调查范围**: `noname/library/element/` + `noname/game/index.js` + `card/standard.js` + 全部 `character/` + 全部 `extension/`
**证据等级**: 精确行号 + 事件链追踪 + trigger 注册→匹配全链路

---

## 问题 1：phaseJudge step 3 创建的 lebu/bingliang/shandian 事件的 player 属性是谁？

### 确认事实

**`next.player = 当前判定阶段所属的玩家`**（即判定区中有该延时锦囊、正在被判定的人）。

**证据**（`noname/library/element/content.js` 第 4286-4311 行）：

```javascript
// phaseJudge 的 step 3（第4步）
async (event, trigger, player) => {
    const name = event.card.name;        // "lebu" / "bingliang" / "shandian"
    // ...
    } else {
        const next = game.createEvent(name);
        next.setContent(lib.card[name].effect);
        next._result = event.result;     // 传入判定结果
        next.card = VJudge;
        next.cards = VJudge?.cards ?? [];
        next.player = player;            // ← player 变量来自 phaseJudge 事件
        await next;
    }
}
```

此处的 `player` 变量来自外层 `phaseJudge` 事件（`content.js:4248` 定义 `phaseJudge: [async (event, trigger, player) => ...]`），即**进入判定阶段的玩家**。

### `global: lebu` vs `player: lebu` 区别

**证据**（`noname/library/index.js` 第 10708-10710 行，`filterTrigger` 函数）：

```javascript
if (!Object.keys(info.trigger).some((role) => {
    if (role != "global" && player != event[role]) {  // ← 核心区别
        return false;
    }
    // ... 检查 triggername 匹配 ...
})) {
    return false;
}
```

| trigger 角色 | 匹配条件 | 含义 |
|-------------|----------|------|
| `player` | `player == event.player` | 仅当技能拥有者是事件的 player 时才触发 |
| `global` | 跳过 player 检查 | 所有拥有该技能的玩家都会触发 |
| `source` | `player == event.source` | 仅当技能拥有者是事件的 source 时才触发 |
| `target` | `player == event.target` | 仅当技能拥有者是事件的 target 时才触发 |

对于 phaseJudge 创建的 lebu 事件：
- `event.player` = 被判定玩家（持有延时锦囊的人）
- `event.source` = undefined（未设置）
- `event.target` = undefined（未设置）

---

## 问题 2：character/ 目录中是否有技能用 `trigger: { player: lebu }` 或 `trigger: { global: lebu }`？

### 确认事实

**没有。** 搜索了全部 `character/` 目录（包括所有子包的 `skill.js`），**未找到任何使用 `trigger: { player: "lebu" }`、`trigger: { global: "lebu" }` 或类似 `bingliang`/`shandian` 触发模式的技能**。

### 全代码库搜索结果

| 模式 | character/ | extension/ | 合计 |
|------|-----------|------------|------|
| `trigger: { player: "lebu" }` | 0 | 1（moxuluo.js） | 1 |
| `trigger: { player: "bingliang" }` | 0 | 1（同上） | 1 |
| `trigger: { player: "shandian" }` | 0 | 1（同上） | 1 |
| `trigger: { global: "lebu" }` | 0 | 0 | 0 |

唯一的实例在 `extension/Nihilphile/module/moxuluo.js:225`：
```javascript
trigger: { player: ["lebu", "bingliang", "shandian"] },
```

### 现有相关技能的模式

现有技能使用**其他触发事件**间接检测：

| 技能 | 触发事件 | 文件 | 方式 |
|------|----------|------|------|
| `_wuxie`（无懈可击）| `{ player: ["useCardToBegin", "phaseJudge"] }` | card/standard.js:4303 | 响应 phaseJudge **子事件**，可取消判定牌 |
| `yonglve` / `reyonglve` | `{ global: "phaseJudgeBegin" }` | character/yijiang/skill.js:6621/6682 | 阶段开始时**手动检查判定区牌名** |
| `dragqianxun` | `{ player: "phaseJudgeBegin" }` | character/offline/skill.js:44640 | 同上 |

**关键发现：没有任何现有技能监听 card.name 同名事件。**

---

## 问题 3：`trigger: { player: "lebu" }` 能否工作？`global: lebu` 是否可行？

### ⚠️ 关键发现：`trigger: { player: "lebu" }` 可能无法触发

经过对 trigger 注册→触发→匹配的完整链路追踪，发现了严重问题：

#### Trigger 注册链路

当技能有 `trigger: { player: "lebu" }` 时（`noname/library/element/player.js:10419-10443`）：

1. 调用 `setTrigger("player", "lebu")`
2. 注册 `lib.hook["{playerid}_player_lebu"] = [skill]`
3. 设置 `lib.hookmap["lebu"] = true`

**关键**：hook 以 trigger 名 `"lebu"` 为 key，而非事件生命周期名。

#### Trigger 触发链路

当 lebu 事件通过 `game.createEvent("lebu")` 创建并启动时（`noname/library/element/gameEvent.js:212-257`），其 `loop()` 触发：

```javascript
const trigger = async (trigger2, to) => {
    this._triggered = to;
    await this.trigger(this.name + trigger2);  // "lebu" + "Before" = "lebuBefore"
};
```

触发的 trigger 名为：`"lebuBefore"` → `"lebuBegin"` → `"lebuEnd"` → `"lebuAfter"`。

**从未调用 `this.trigger("lebu")`**。

#### Trigger 匹配链路

当 `this.trigger("lebuBefore")` 被调用时（`gameEvent.js:419-446`）：

```javascript
trigger(name) {  // name = "lebuBefore"
    // ...
    if (!lib.hookmap[name]) {  // lib.hookmap["lebuBefore"] → undefined
        return;  // ← 提前返回！arrangeTrigger 不会创建
    }
    // ...
}
```

因为 `hookmap` 中只有 `"lebu"` 条目（没有 `"lebuBefore"`），所以 `trigger("lebuBefore")` 是空操作，**任何监听 `"lebu"` 的技能都不会触发**。

### 结论

| 方案 | 可行性 | 原因 |
|------|--------|------|
| `trigger: { player: "lebu" }` | ❌ **不可行** | "lebu" 从未被 trigger 系统触发 |
| `trigger: { player: "lebuBefore" }` | ✅ 可行（理论） | 但需验证无懈对 Before 时机的影响 |
| `trigger: { player: "lebuBegin" }` | ✅ 可行（理论） | 但此时 event._result 尚未设置到子事件 |
| `trigger: { player: "lebuEnd" }` | ✅ 可行（理论） | 效果已执行完毕 |
| `trigger: { player: "lebuAfter" }` | ✅ 可行（理论） | 同 lebuEnd |
| `trigger: { global: "lebu" }` | ❌ **不可行** | 同上，"lebu" 未被触发 |

### 如果 moxuluo 扩展的 `trigger: { player: ["lebu", "bingliang", "shandian"] }` 确实在工作...

则存在以下可能性之一：
1. **有其他代码路径**调用了 `trigger("lebu")`（但全代码库搜索未发现）
2. **lib.relatedTrigger** 有运行时动态添加（但搜索 `relatedTrigger[` 未发现）
3. **存在某种自动匹配机制**：事件名 "lebu" 自动触发同名 trigger（但在 GameEvent 代码中未找到此机制）

**建议主控进行 runtime smoke test** 来验证 moxuluo 扩展的 `nihil_shiying_stack_delay` 技能是否真的被触发。

---

## 问题 4：延时锦囊生效事件对象的完整属性

### 确认事实

`phaseJudge` step 3 创建的 lebu 事件（`content.js:4300-4308`）：

```javascript
const next = game.createEvent(name);   // name = "lebu"/"bingliang"/"shandian"
next.setContent(lib.card[name].effect);
next._result  = event.result;          // ← 判定结果
next.card     = VJudge;                // ← 对应判定牌卡牌对象
next.cards    = VJudge?.cards ?? [];   // ← 判定牌的 cards 属性
next.player   = player;                // ← 被判定玩家
// next.source = undefined（未设置）
// next.target = undefined（未设置）
```

### 属性速查表

| 属性 | 值 | 说明 |
|------|-----|------|
| `event.name` | `"lebu"` / `"bingliang"` / `"shandian"` | 事件名 |
| `event.player` | 被判定玩家 | 持有该延时锦囊的玩家 |
| `event.source` | `undefined` | phaseJudge 创建时未设置 |
| `event.target` | `undefined` | 未设置 |
| `event.card` | 判定牌对象 | |
| `event.cards` | `[]` 或判定牌的 cards | |
| `event._result` | `{ bool, card, suit, number, ... }` | 判定结果对象 |
| `event._result.bool` | `true` / `false` | 判定函数 judge() 返回值经过 judge2() 翻转后的结果 |
| `event._result.card` | 判定牌（从牌堆翻出的牌）| |
| `event._result.suit` | 判定牌花色 | |
| `event._result.number` | 判定牌点数 | |

### `_result.bool` 含义

由于 `lib.card[name].judge2` 对结果做了翻转（`result.bool === false ? true : false`）：

| 卡牌 | `_result.bool === false` 含义 | `_result.bool === true` 含义 |
|------|------------------------------|------------------------------|
| 乐不思蜀 | ✅ 被乐住（跳过出牌阶段）| ❌ 乐无效（判定红桃）|
| 兵粮寸断 | ✅ 被兵住（跳过摸牌阶段）| ❌ 兵无效（判定梅花）|
| 闪电 | ✅ 被劈中（3点雷电伤害）| ❌ 未命中（移动到下家）|

**证据**：
- 乐不思蜀 judge: `get.suit(card) === "heart" ? 1 : -2`（standard.js:3221-3225）
- 乐不思蜀 judge2: `result.bool === false ? true : false`（standard.js:3227-3232）
- 闪电 judge: `(spade 2-9) ? -5 : 1`（standard.js:3299-3306）
- 闪电 judge2: `result.bool === false ? true : false`（standard.js:3307-3312）

---

## 问题 5：事件链 — 哪一步能被 trigger 系统捕获？

### 完整事件链

```
phaseJudge（阶段事件，_triggered: 0→1→2→...）
  │
  ├── [lifecycle] phaseJudgeBefore
  ├── [lifecycle] phaseJudgeBegin  
  ├── [content Step 0] 收集判定区牌 event.cards
  ├── [content Step 1] 取牌→lose→$phaseJudge动画→
  │     └── event.trigger("phaseJudge")  ←── ★ 无懈可击在此拦截
  │           ├── arrangeTrigger("phaseJudge") → _wuxie 技能触发
  │           └── 若被无懈：event.cancelled = true
  ├── [content Step 2] if !cancelled: 执行判定 event.result = await judge()
  └── [content Step 3] 分支：
        ├── if excluded: 跳过
        ├── if cancelled && !direct && lib.card[name].cancel 存在:
        │     └── 创建 "shandianCancel" 事件（仅闪电）
        └── else:
              └── 创建 "lebu" 事件 → ★★★ 生效事件
                    │
                    ├── [lifecycle] lebuBefore   ← trigger 名: "lebuBefore"
                    ├── [lifecycle] lebuBegin    ← trigger 名: "lebuBegin"
                    ├── [content] lib.card[name].effect()
                    │     └── lebu: player.skip("phaseUse")
                    │     └── bingliang: player.skip("phaseDraw")
                    │     └── shandian: result.bool===false?damage:addJudgeNext
                    ├── [lifecycle] lebuEnd      ← trigger 名: "lebuEnd"
                    └── [lifecycle] lebuAfter    ← trigger 名: "lebuAfter"
```

### 各步能否被 trigger 捕获

| 步骤 | trigger 名 | 能否用于检测生效？ | 备注 |
|------|-----------|-------------------|------|
| `phaseJudgeBegin` | `"phaseJudgeBegin"` | ❌ 太早 | 判定尚未开始，所有判定牌都在 |
| `"phaseJudge"` 子事件 | `"phaseJudge"` | ❌ 判定前 | 此时 event.cancelled 尚未确定 |
| 判定 | `"judge"` (type="phase") | ❌ 仅判定 | 不区分生效与否 |
| `lebuBefore` | `"lebuBefore"` | ⚠️ 过于提前 | 效果尚未执行 |
| `lebuBegin` | `"lebuBegin"` | ⚠️ 过于提前 | 效果尚未执行 |
| `lebuEnd` | `"lebuEnd"` | ✅ 效果已执行 | **推荐**：效果已执行完毕 |
| `lebuAfter` | `"lebuAfter"` | ✅ 效果已执行 | **推荐**：同上 |
| `phaseJudgeAfter` | `"phaseJudgeAfter"` | ❌ 太晚 | 所有判定牌已处理完毕，需手动推断 |

### ⚠️ 重要更正

**前序调查（moxuluo__delay-trigger）推荐使用 `trigger: { player: "lebu" }`，但本调查发现此写法无法被触发。** 正确的 trigger 名应为 `"lebuEnd"` 或 `"lebuAfter"`。

---

## 决策输入

### 推荐触发写法（基于本调查）

```javascript
// ===== 乐不思蜀 生效检测 =====
skill_lebu_effect: {
    trigger: { player: "lebuEnd" },   // ← 注意：是 "lebuEnd" 不是 "lebu"
    filter(event, player) {
        // 确保是 phaseJudge 阶段的生效事件
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        // event._result 携带判定结果
        // 乐不思蜀已执行 player.skip("phaseUse")
    }
}

// ===== 兵粮寸断 生效检测 =====
skill_bingliang_effect: {
    trigger: { player: "bingliangEnd" },
    filter(event, player) {
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        // 兵粮寸断已执行 player.skip("phaseDraw")
    }
}

// ===== 闪电 生效检测 =====
skill_shandian_effect: {
    trigger: { player: "shandianEnd" },
    filter(event, player) {
        return event.getParent().name === "phaseJudge";
    },
    async content(event, trigger, player) {
        if (event._result && event._result.bool === false) {
            // 闪电命中：3点雷电伤害已造成
        } else {
            // 闪电不中：已移动到下家
        }
    }
}
```

### 如果需要用 global 角色

```javascript
trigger: { global: "lebuEnd" },
filter(event, player) {
    // player = 技能拥有者
    // event.player = 被判定玩家（受影响的玩家）
    return event.getParent().name === "phaseJudge" 
        && event.player !== player;  // 可选：排除自己
},
async content(event, trigger, player) {
    // 受影响的玩家：event.player
    // 可通过 event.player 获取被乐住的人
}
```

### 如果需要在效果执行前拦截

使用 `"lebuBefore"` 或 `"lebuBegin"`（在 `lib.card[name].effect()` 执行前），但此时效果尚未执行：

```javascript
trigger: { player: "lebuBefore" },
// 适用于需要在效果执行前做预处理/阻止的场景
```

---

## 未决项

1. **`trigger: { player: "lebu" }` 的可行性矛盾**：moxuluo 扩展使用了此模式，但 trigger 全链路分析表明 "lebu" 从未被触发。建议 runtime smoke test 验证。可能存在的未知机制包括：
   - 事件 content 执行过程中是否有隐式 trigger 调用
   - 是否存在我未发现的 hookmap 动态注册
   - 相关 `relatedTrigger` 是否在其他文件中被运行时扩展

2. **事件自动 finish 机制**：lebu 事件的效果函数 `effect()` 不调用 `event.finish()`，但事件确实能正常结束。这表明存在我未完全追踪的自动 finish 机制，可能影响 trigger 行为。

3. **`event.direct` 标志**：phaseJudge step 3 中 `!event.direct` 的检查，此标志的来源和影响未完全追踪。

---

## 关键文件索引

| 文件 | 关键行号 | 内容 |
|------|----------|------|
| `noname/library/element/content.js` | 4248-4311 | phaseJudge 完整 4 步 |
| `noname/library/element/content.js` | 4300-4308 | 生效事件创建 |
| `noname/library/element/content.js` | 4268 | "phaseJudge" 子事件触发 |
| `noname/library/element/gameEvent.js` | 212-257 | GameEvent.loop() 生命周期 |
| `noname/library/element/gameEvent.js` | 419-595 | trigger() 方法（命名匹配）|
| `noname/library/element/player.js` | 10419-10443 | skill trigger 注册 |
| `noname/library/index.js` | 10676-10765 | filterTrigger（角色匹配）|
| `noname/library/index.js` | 461-471 | lib.relatedTrigger 定义 |
| `noname/game/index.js` | 5595-5604 | game.createEvent() |
| `card/standard.js` | 3214-3285 | lebu 定义（effect/judge）|
| `card/standard.js` | 3286-3380 | shandian 定义 |
| `card/extra.js` | 544-601 | bingliang 定义 |
| `extension/Nihilphile/module/moxuluo.js` | 222-256 | 唯一使用 trigger: {player: "lebu"} 的技能 |
