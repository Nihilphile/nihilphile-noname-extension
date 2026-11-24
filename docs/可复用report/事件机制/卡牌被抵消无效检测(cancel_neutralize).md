# 无名杀引擎：卡牌「被抵消/无效」事件检测机制 探索报告

**日期**: 2026-06-30  
**调查者**: explorer  
**搜索范围**: `resources/app/` 下核心引擎文件与卡牌/技能模块

---

## 1. 调查问题列表

| # | 问题 |
|---|------|
| 1 | 卡牌使用后被取消的事件(`useCardCancelled`)及其 filter+content 写法 |
| 2 | 如何区分"被无懈抵消" vs "目标无效" vs "杀被闪避" |
| 3 | 无懈可击抵消牌的事件链 |
| 4 | 卡牌使用后"没有被抵消"如何检测(`event._cancelled`?) |
| 5 | 铁索重铸的事件(`cardDiscard`/`loseAfter`)与`useCard`的区别 |
| 6 | `event.unhurt`的含义与用法 |

---

## 2. 确认事实与证据

### 2.1 GameEvent 生命周期与 Cancel/Neutralize 机制

**核心文件**: `noname/library/element/gameEvent.js`

每个 GameEvent 的标准生命周期（`loop()` 方法，行 212-256）：
```
name + "Before"  →  name + "Begin"  →  [content 执行]  →  
    →  name + "End"  →  name + "After"  →  返回
```
对于 `type == "card"` 的事件，还会额外触发 `useCardTo` + 阶段名。

**Cancel 方法**（行 623-634）：
- `this.untrigger(all, player)` — 中止当前触发链
- `this._cancelled = true` — 标记已取消
- `this.trigger(this.name + "Cancelled")` — 触发如 `useCardCancelled`
- `this.finish()` — 进入 End→After 流程

**关键结论**:
- `cancel()` 在 content 执行期间被调用，设置 `_cancelled = true`
- 触发 `name + "Cancelled"` 事件（如 `useCardCancelled`）
- 然后 `finish()` → 事件继续走 `End` → `After` 流程
- **因此 `useCardAfter` 对已取消的牌也会触发**

**Neutralize 方法**（行 638-658）：
- 设置 `_neutralized = true`
- 触发 `eventNeutralized` 事件
- 调用 `untrigger()` + `finish()`

**Cancel vs Neutralize 对比**:
| 特性 | `cancel()` | `neutralize()` |
|------|-----------|----------------|
| 触发事件 | `name + "Cancelled"` | `eventNeutralized` |
| 设置标志 | `_cancelled = true` | `_neutralized = true` |
| 用途 | 延时锦囊取消 | 无懈可击抵消非延时锦囊 |
| finish 后 | 走 End→After 流程 | 走 End→After 流程 |

---

### 2.2 `useCardCancelled` 事件

**唯一使用处**: `card/standard.js` 行 4095（方天画戟技能 subSkill）

```javascript
trigger: {
    trigger: { player: ["shaMiss", "useCardAfter", "useCardCancelled"] },
    filter(event, player) {
        return player.getStorage("fangtian_guozhan_trigger").includes(event.card);
    },
    async content(event, trigger, player) {
        if (event.triggername === "shaMiss" && ...) {
            trigger.getParent().excluded.addArray(...);
        } else {
            player.unmarkAuto(event.name, [trigger.card]);
        }
    },
},
```

**写法要点**:
- `useCardCancelled` 是全局事件，由 `gameEvent.cancel()` 自动触发
- filter 中通过 `event.triggername` 区分不同触发事件
- 在 `useCardCancelled` 触发时执行清理逻辑

**注**: `useCardCancelled` 在整个代码库中仅此一处使用，极其罕见。

---

### 2.3 无懈可击抵消牌的事件链

**无懈可击卡牌定义**: `card/standard.js` 行 3140-3212

```javascript
wuxie: {
    type: "trick",
    notarget: true,
    content() {
        var trigger = event.getParent(2)._trigger;
        if (trigger.name === "phaseJudge") {
            // 延时锦囊：直接设置 cancelled = true
            trigger.untrigger("currentOnly");
            trigger.cancelled = true;
        } else {
            // 非延时锦囊：调用 neutralize()
            trigger.neutralize();
        }
    },
}
```

**完整事件链**（非延时锦囊被无懈）：
```
1. useCard 事件开始
   ├── useCardBefore → useCardBegin
   ├── useCard1 → useCard2 → useCard
   │   └── [逐目标结算]
   │       └── cardName 事件 (如 "shunshou")
   │           └── 被无懈响应 → trigger.neutralize()
   │               ├── trigger._neutralized = true
   │               ├── trigger.trigger("eventNeutralized")  ← 可监听
   │               ├── trigger.untrigger()
   │               └── trigger.finish()
   │                   └── cardNameEnd → cardNameAfter
   ├── useCardEnd    ← useCard 仍正常走完
   └── useCardAfter  ← useCardAfter 仍会触发
```

**延时锦囊被无懈**:
- Wuxie 设置 `trigger.cancelled = true`
- 触发 `judgeNameCancelled`
- 执行 `lib.card[name].cancel` 回调（如闪电：放入下家判定区）

---

### 2.4 区分"被无懈抵消" vs "目标无效" vs "杀被闪避"

**证据来源**: `card/standard.js` (sha 卡牌 content，行 140-274)

**(a) 杀被闪避 → `shaMiss`**
- 触发条件：目标出闪（`result.result === "shaned"`）
- 事件：`shaMiss`（player 事件）
- 行 225：`event.trigger("shaMiss")`

**(b) 杀命中 → `shaHit`**
- 触发条件：目标未出闪
- 事件：`shaHit` → 可能随后触发 `shaDamage`
- 行 216：`event.trigger("shaHit")`

**(c) 杀被无懈抵消 → `eventNeutralized`**
- 无懈通过 `neutralize()` 抵消杀的目标事件
- 触发 `eventNeutralized` 全局事件
- 目标事件中 `_neutralized = true`

**(d) 目标无效的不同机制**:
- **excluded**: 目标被排除 → `useCardToExcluded`
- **ignoreTarget**: 卡牌忽略该目标 → `useCardToIgnored`
- **directHit**: 强行命中跳过闪检测 → 通过 `event.directHit[]` 或 `directHit2`

**(e) `event.unhurt` 机制**:
- 行 230：`if (... && !event.unhurt) { damage } else { shaUnhirt }`
- 通过 `customArgs.default.unhurt = true` 设置
- 效果：即使没出闪也不造成伤害

**区分判断表**:
| 情景 | 触发的事件 | 可检测标志 |
|------|-----------|-----------|
| 杀被闪避 | `shaMiss` | `result.result === "shaned"` |
| 杀命中 | `shaHit` → `shaDamage` | 伤害事件触发 |
| 卡牌被无懈抵消 | `eventNeutralized` | `event._neutralized === true` |
| 卡牌被 cancel | `useCardCancelled` | `event._cancelled === true` |
| 目标被排除 | `useCardToExcluded` | 在 excluded 数组中 |
| 杀未造成伤害(unhurt) | `shaUnhirt` | `event.unhurt === true` |

---

### 2.5 卡牌"没有被抵消"如何检测

**三种检测方式**：

**方式一：检测 `_cancelled`**
```javascript
// 参考: character/tw/skill.js 行 3182
return evts.filter(evt => !evt._cancelled && !evt._finished);
```

**方式二：检测 `_neutralized`**
```javascript
// 参考: character/newjiang/skill.js 行 4507
if (evt._neutralized || (evt.responded && (!evt.result || !evt.result.bool))) { ... }
```

**方式三：组合检查（推荐用于破魔类技能）**
```javascript
trigger: { player: "useCardAfter" },
filter(event, player) {
    const useCard = event.parent;
    if (useCard._cancelled) return false;    // 被 cancel
    if (useCard._neutralized) return false;  // 被 neutralize
    return true;  // 牌没有被抵消
}
```

**关键发现**:
- `useCardAfter` 对已抵消和未抵消的牌都会触发
- 必须在 filter 中自行检查 `_cancelled` / `_neutralized`
- `_cancelled` 标志在 `gameEvent.cancel()` 中设置（gameEvent.js 行 630）
- `_neutralized` 标志在 `gameEvent.neutralize()` 中设置（gameEvent.js 行 642）

---

### 2.6 铁索重铸的事件与 useCard 的区别

**铁索连环卡牌**: `card/extra.js` 行 449-461
- `recastable: true` — 可被重铸
- 使用时 content：`target.link()` — 横置目标

**使用铁索（useCard 流程）**:
1. `useCard` → `useCardAfter` 完整流程
2. 触发所有 useCard 系列事件

**重铸铁索（recast 流程）**:
```
player.recast(cards)
  → game.createEvent("recast")
  → content:
      ① recastingLose → loseToDiscardpile → 触发 loseAfter
      ② recast 事件触发
      ③ recastingGain → draw → 触发 gainAfter
```

**关键区别**:
| 特性 | `useCard` | `recast` |
|------|----------|----------|
| 事件链 | useCard → useCardAfter | recast → lose → gain |
| 触发 useCardAfter | ✅ | ❌ |
| 触发 loseAfter | ❌ | ✅ |
| getHistory("useCard") | ✅ | ❌ |
| 可被无懈抵消 | ✅ | ❌ |

**重铸流程代码**: `noname/library/element/player.js` 行 1481-1519
**重铸 content**: `noname/library/element/content.js` 行 617-638

---

### 2.7 `event.unhurt` 的含义与用法

**来源**: `card/standard.js` 行 230, 256, 265（sha content）

**设置方式**: 
```javascript
trigger.customArgs.default.unhurt = true;   // 设置
delete trigger.customArgs.default.unhurt;    // 清除
```

**语义**: `unhurt = true` 时，即使目标未出闪也不造成伤害，触发 `shaUnhirt` 而非 `shaDamage`

**参考案例**: `extension/Nihilphile/module/tia.js` 行 661, 725（荣光技能弹药点数判定）

**与其他机制对比**:
| 机制 | 设置方式 | 效果 |
|------|---------|------|
| `directHit` | `event.directHit.push(target)` | 跳过闪检测，强制命中 |
| `directHit2` | `customArgs.default.directHit2 = true` | 同上，全局生效 |
| `unhurt` | `customArgs.default.unhurt = true` | 允许出闪但不造成伤害 |
| `noCancel` | skill 配置 | DIY技能不可取消 |
| `cannotBeNullified` | 未在引擎中找到 | 当前版本不存在 |

---

## 3. 推断与剩余未知

### 3.1 推断
1. **`useCardCancelled` 设计意图**：提供"卡牌被抵消"的独立钩子，但由于大多数技能在 `useCardAfter` 中自行判断更灵活，该事件使用极少。
2. **wuxie 双路径设计**：延时锦囊走 `cancelled` 路径（需要 `cancel` 回调），非延时锦囊走 `neutralize` 路径，设计合理。
3. **`useCardAfter` 是主要检测点**：所有 useCard（无论是否抵消）都触发，filter 中区分结果。

### 3.2 剩余未知
1. **`noCancel` 完整语义**：仅出现在 DIY 技能，引擎核心未使用。
2. **`cannotBeNullified`**：整个代码库未找到，当前版本不存在。
3. **`_wuxie` 事件**：存在引用但未找到创建代码，可能是旧版本遗留。

---

## 4. 可行方案

### 方案 A：破魔类技能（卡牌不可被抵消）
```javascript
trigger: { player: "useCard" },
async content(event, trigger, player) {
    trigger.customArgs.default.directHit2 = true;
}
```

### 方案 B：检测卡牌被抵消后触发
```javascript
trigger: { player: "useCardAfter" },
filter(event, player) {
    const useCard = event.parent;
    return !useCard._cancelled && !useCard._neutralized;
}
```

### 方案 C：区分杀被闪避 vs 被无懈
```javascript
trigger: { player: ["shaMiss", "eventNeutralized"] },
filter(event, player) {
    if (event.name === "shaMiss") { /* 被闪避 */ }
    if (event.name === "eventNeutralized") { /* 被无懈 */ }
}
```

---

## 5. 决策输入（给主控）

1. **卡牌抵消检测推荐锚点**：`useCardAfter` 配合 `_cancelled` / `_neutralized` 标志。
2. **铁索重铸与使用铁索是两条不同事件链**，需分别监听。
3. **`event.unhurt` 是 sha 专有**，通用不可抵消建议用 `directHit2`。
4. **不存在 `cannotBeNullified` 系统属性**，需通过 `directHit2`/`nowuxie`/`customArgs` 实现。
5. **推荐 `useCardAfter` + filter 判断**，比冷门的 `useCardCancelled` 更清晰灵活。

---

*证据文件索引（均位于 `resources/app/` 下）*:
- 事件生命周期: `noname/library/element/gameEvent.js` 行 212-257, 623-658
- useCard 流程: `noname/library/element/content.js` 行 9029-9763
- sha 命中/闪避/伤害: `card/standard.js` 行 140-274
- 无懈可击: `card/standard.js` 行 3140-3212
- 铁索重铸: `card/extra.js` 行 449-461, `noname/library/element/player.js` 行 1481-1519
- useCardCancelled: `card/standard.js` 行 4095
- _cancelled 案例: `character/tw/skill.js` 行 3182, `character/mobile/skill.js` 行 5362
- _neutralized 案例: `character/newjiang/skill.js` 行 4507
- unhurt 案例: `extension/Nihilphile/module/tia.js` 行 661, 725
