# 无名杀引擎：伤害防止 & 体力流失机制探查报告

> **探查日期**：2026-06-30  
> **目标目录**：`F:\AI_project\nameless_game\无名杀子琪懒人包v1.11.3-win32-x64\resources\app`  
> **问题列表**：1) 伤害阻止 pattern 2) 阻止后转体力流失 3) "防止伤害，改为失去等量体力" 4) damage 事件完整生命周期 5) loseHp vs damage 6) 每回合限一次的防止伤害写法

---

## 1. damage 事件的完整生命周期

### 1.1 核心文件

| 文件 | 作用 |
|------|------|
| `noname/library/element/content.js:11328-11444` | damage 事件 content 定义 |
| `noname/library/element/gameEvent.js:212-257` | 事件循环：自动触发 Before/Begin/Content/End/After |
| `noname/library/element/gameEvent.js:623-634` | cancel() 方法实现 |
| `noname/library/element/player.js:8508-8521` | loseHp() 方法 |
| `noname/library/element/player.js:8579-8588` | changeHp() 方法 |
| `noname/library/element/content.js:11547-11567` | loseHp content 定义 |
| `noname/library/element/content.js:11599-11634` | changeHp content 定义 |

### 1.2 事件触发顺序（完整链路）

由 `gameEvent.js:212-257` 的事件循环机制（`loop()` 方法）自动驱动。对于名为 `damage` 的事件：

```
触发阶段                   触发时机                    来源位置
─────────────────────────────────────────────────────────────────────
damageBefore        ← event loop 自动, _triggered===0   gameEvent.js:227
                                                       → await trigger("Before", 1)
                                                       即 await trigger("damageBefore")

  ─── 进入 content 数组 (content.js:11328-11444) ───
  
  damageBegin1      ← content step [0] 手动触发        content.js:11337
                      (game.callHook("checkDamage1") 先执行)

  damageBegin2      ← content step [1] 手动触发        content.js:11341
                      (game.callHook("checkDamage2") 先执行)

  damageBegin3      ← content step [2] 手动触发        content.js:11345
                      (game.callHook("checkDamage3") 先执行)

  damageBegin4      ← content step [3] 手动触发        content.js:11349
                      (game.callHook("checkDamage4") 先执行)

  [实际处理伤害]     ← content step [4]                 content.js:11351-11443
                      - 播放伤害音效
                      - 记录伤害历史
                      - player.changeHp(-num, false)   // 扣除体力（含护甲处理）
                      - 伤害动画
                      - 触发 damageZero (num==0) 或 damage (num>0)

  damageEnd          ← event loop 自动, finished===true gameEvent.js:247
                       _triggered===2                   → await trigger("End", 3)
                                                       即 await trigger("damageEnd")

  damageAfter        ← event loop 自动, finished===true gameEvent.js:249
                       _triggered===3                   → await trigger("After", 4)
                                                       即 await trigger("damageAfter")
```

### 1.3 cancel() 打断生命周期

```javascript
// gameEvent.js:623-634
cancel(all, player, notrigger) {
    this.untrigger(all, player);     // 清除待执行触发器
    if (!notrigger) {
        this._cancelled = true;
        next = this.trigger(this.name + "Cancelled");  // → "damageCancelled"
    }
    this.finish();                   // 标记事件完成
    return next;
}
```

**重要**：cancel 后：
- `damage` / `damageZero` 不会触发
- `damageCancelled` 会触发（如果 `notrigger !== true`）
- 事件立即 `finish()`，后续 content steps 不执行
- **仍然会依次走** `damageEnd` 和 `damageAfter`（因为 `finished=true`，event loop 会继续走完 End/After 阶段）

### 1.4 checkDamage 钩子系统

```javascript
// hooks/index.js:311-331
checkDamage1: [ kuanggu, jyliezhou ]   // 设置 checkKuanggu, checkJyliezhou 标记
checkDamage2: []                        // 空
checkDamage3: [ jiushi ]                // 设置 checkJiushi 标记
checkDamage4: []                        // 空
```

这些钩子在对应 `damageBegin` 触发前执行，只设置 flag，不阻止事件。技能通过检查这些 flag 进行条件判断。

---

## 2. 角色阻止伤害的完整步骤（含 filter + content）

### 2.1 通用模板

```javascript
skillName: {
    // ① 选择触发时机（五选一）
    trigger: { source: "damageBefore" },
    // 或 player: "damageBefore"
    // 或 source/player: "damageBegin1/2/3/4"
    
    // ② 条件过滤（必须返回 true 才可发动）
    filter(event, player) {
        return /* 条件 */;
    },
    
    // ③ AI 判断是否发动
    check(event, player) {
        return get.damageEffect(event.player, event.source, player) < 0;
    },
    
    // ④ 执行内容
    content() {
        trigger.cancel();
        // ... 补充效果
    },
}
```

### 2.2 五种可用触发时机对比

| 触发时机 | 阶段 | 典型用途 | 示例路径 |
|----------|------|----------|----------|
| `damageBefore` | 最早 | 完全拦截/转换伤害 | sp2/skill.js:9062, skill.js:1706 |
| `damageBegin1` | checkDamage1后 | 伤害加成, 条件触发 | skill.js:341 |
| `damageBegin2` | checkDamage2后 | 来源侧防止 | skill.js:1376, standard.js:3480 |
| `damageBegin3` | checkDamage3后 | 伤害修正 | standard.js:3559 |
| `damageBegin4` | checkDamage4后 | 目标侧防止 | collab/skill.js:6995, bingshi/skill.js:3272 |

---

## 3. 阻止伤害后转为体力流失

### 3.1 现成实现："防止伤害，改为失去等量体力"

核心 Pattern：
```javascript
trigger: { source: "damageBefore" },
filter(event, player) { return /* 条件 */; },
content() {
    trigger.cancel();
    trigger.player.loseHp(trigger.num);
}
```

**完整证据（代码位置）**：

| 技能名 | 文件:行号 | 触发 | filter | content |
|--------|-----------|------|--------|---------|
| `nhyinbing` | character/sp2/skill.js:9061-9070 | source: damageBefore | sha only | cancel + loseHp(num) |
| `shenfeng_effect` | character/newjiang/skill.js:1328-1338 | source: damageBefore | parent check | cancel + loseHp(num) |
| `dcyanxi_jueqing` | character/huicui/skill.js:694-706 | source: damageBefore | card storage check | cancel + loseHp(num) |
| `kotomi_chuanxiang2_jueqing` | character/key/skill.js:4678-4686 | source: damageBefore | parent skill check | cancel + loseHp(num) |

### 3.2 变体："防止伤害，改为减少体力上限"

```javascript
// _kamisha (noname/library/skill.js:1375-1399)
trigger: { source: "damageBegin2" },
filter(event, player) { return event.hasNature("kami") && event.num > 0; },
content(event, trigger, player) {
    trigger.cancel();
    trigger.player.loseMaxHp(trigger.num).source = player;
}
```

### 3.3 变体："防止伤害，改为弃牌"（寒冰剑/冰杀）

```javascript
// hanbing_skill (card/standard.js:3478-3555)
trigger: { source: "damageBegin2" },
content() {
    "step 0"; trigger.cancel();
    "step 1"; discardPlayerCard(...);
    "step 2"; discardPlayerCard(...);
}
```

### 3.4 loseHp 事件链

```
loseHpBefore → loseHpBegin → [content: changeHp(-num)] → loseHpEnd → loseHpAfter
```

被转为 loseHp 的伤害：damage 走 damageCancelled→damageEnd→damageAfter，同时 loseHp 独立走自己的完整事件链。

---

## 4. loseHp vs damage 的区别

| 维度 | `damage` | `loseHp` |
|------|----------|----------|
| **核心方法** | `player.damage(source)` | `player.loseHp(num)` |
| **事件链** | damageBefore→Begin1-4→damage/damageZero→End→After | loseHpBefore→Begin→End→After |
| **护甲(hujia)** | 优先扣护甲 (`content.js:11602-11607`) | 无护甲处理 |
| **音效** | 根据nature播放伤害音效 | 固定 loseHp 音效 |
| **日志** | "受到了X点伤害" | "失去了X点体力" |
| **伤害记录** | `player.stat[].damaged += num` | 无 damage 记录 |
| **取消时触发** | `damageCancelled` | `loseHpCancelled` |
| **濒死检查** | content step [5] | content 结尾 |

---

## 5. 每回合限一次的防止伤害写法

### 5.1 核心：`usable: 1`

```javascript
skillName: {
    trigger: { player: "damageBegin4" },
    usable: 1,    // ← 每回合限一次
    filter(event, player) { return /* 条件 */; },
    content() { trigger.cancel(); },
}
```

### 5.2 完整示例1：`dclonggong`（龙宫）

```javascript
// character/collab/skill.js:6993-7020
dclonggong: {
    trigger: { player: "damageBegin4" },
    usable: 1,
    filter(event, player) { return event.source && event.source.isIn(); },
    async content(event, trigger, player) {
        trigger.cancel();                     // 防止伤害
        var card = get.cardPile2(card => get.type(card, null, false) == "equip");
        var source = trigger.source;
        if (card && source && source.isIn()) {
            await source.gain(card, "gain2");
        }
    },
}
```

### 5.3 完整示例2：`mbshuanghuai`（霜怀 — 二选一）

```javascript
// character/bingshi/skill.js:3254-3349
mbshuanghuai: {
    trigger: { global: "damageBegin4" },  // global: 全场触发
    usable: 1,
    filter(event, player) { return get.distance(event.player, player) <= 1; },
    async cost(event, trigger, player) {
        // 弹出二选一："防止此伤害" 或 "给【桃】"
    },
    async content(event, trigger, player) {
        if (event.cost_data == "cancel") {
            trigger.cancel();              // 防止伤害
        }
        // 额外: 与上次目标比较, 决定摸牌或失去体力
    },
}
```

### 5.4 其他限次方式

| 方式 | 示例 | 说明 |
|------|------|------|
| `usable: 1` | collab/skill.js:6996 | 标准方式，每回合自动重置 |
| 手动 `storage` 标记 | sixiang/skill.js:5727 | 配合 `addTempSkill`/`markAuto` |
| `addTempSkill(name, "roundStart")` | 多个技能 | 临时技能回合开始自动移除 |

---

## 6. `unhurt` 关键词

`unhurt`（`card/standard.js:230,256,265`）**不是**伤害防止机制，而是**杀不可闪避**（forced hit）属性：

```javascript
if ((!result || !result.bool) && !event.unhurt) {
    target.damage(...);   // 正常造成伤害
}
```

当 `event.unhurt === true`：跳过闪避检查，直接命中。与 damage cancel 无关。

---

## 7. 决策输入总结

### 7.1 确认的事实

| # | 事实 | 证据 |
|---|------|------|
| 1 | damage 完整生命周期: damageBefore→Begin1-4→content→damage/damageZero→End→After | gameEvent.js:212-257 + content.js:11328-11444 |
| 2 | trigger.cancel() 中止伤害, 触发 damageCancelled | gameEvent.js:623-634 |
| 3 | "防止伤害→失去等量体力" 有4+处现成实现 | 见3.1表 |
| 4 | loseHp 直接扣 HP, 不经过护甲, 有独立事件链 | player.js:8508 + content.js:11547 |
| 5 | usable:1 是"每回合限一次"的标准方式 | collab/skill.js:6996, bingshi/skill.js:3273 |
| 6 | _kamisha 内置伤害→减少体力上限转换 | skill.js:1375-1399 |

### 7.2 推荐模板

**防止伤害 → 失去等量体力** (参考 `nhyinbing`, sp2/skill.js:9061-9070):
```javascript
mySubSkill: {
    trigger: { source: "damageBefore" },
    filter(event, player) { return /* 条件 */; },
    content() { trigger.cancel(); trigger.player.loseHp(trigger.num); },
}
```

**每回合限一次** (参考 `dclonggong`, collab/skill.js:6993-7020):
```javascript
mySkill: {
    trigger: { player: "damageBegin4" },
    usable: 1,
    filter(event, player) { return /* 条件 */; },
    content() { trigger.cancel(); },
}
```

### 7.3 未决问题

1. **damageBefore vs damageBegin4**：大部分伤害防止用 damageBegin4（目标）或 damageBegin2（来源），damageBefore 主要用于转换效果。根据需求选择。
2. **cancel后 damageAfter 仍触发**：需通过 `event._cancelled` 或 `change_history` 区分真实发生与取消。

---

*探查完成。所有文件路径基于 resources/app 根目录。*
