# 无名杀引擎：准备阶段触发与摸牌机制 探索报告

> 搜索目录：`resources\app\`
> 核心源文件：`noname/library/element/content.js`（事件内容函数）、`noname/library/element/player.js`（玩家方法）、`noname/library/skill.js`（标准技能模板）、`noname/game/index.js`（checkMod/gameLoop）
> 日期：2026-06-30

---

## 一、问题清单

1. 准备阶段(`phaseBegin`)触发的 skill 完整写法
2. 如何在准备阶段摸牌
3. 手牌上限的动态修改 (`mod: {maxHandcard}`)
4. 护盾数量影响摸牌/手牌上限的模式
5. 类似「准备阶段摸X张牌」(X=护盾数)的实现

---

## 二、确认的事实（附证据）

### 2.1 回合/阶段事件触发层级

**源文件**：`noname/library/element/content.js`，line 3997—4243

一个玩家回合的完整触发链（按执行顺序）：

| 触发事件名 | 含义 | 证据 |
|---|---|---|
| `phaseBefore` | 阶段前（整回合最前） | content.js:3999 |
| *(round start 判定 & history 初始化)* | — | content.js:4001–4067 |
| `phaseBeforeStart` | 回合开始前准备 | content.js:4070 |
| `phaseBeforeEnd` | 回合开始前结束 | content.js:4073 |
| *(翻面检查、phaseNumber++、popup)* | — | content.js:4075–4158 |
| `phaseBeginStart` | 回合开始时预处理 | content.js:4160 |
| **`phaseBegin`** | **回合开始（主触发点）** | content.js:4163 |
| `phaseZhunbei` → `phaseJudge` → `phaseDraw` → `phaseUse` → `phaseDiscard` → `phaseJieshu` | 六个子阶段依次执行 | content.js:4166–4224 |
| `phaseEnd` | 回合结束 | content.js:4231 |
| `phaseAfter` | 回合结束后 | content.js:4235 |

**阶段名映射**（`noname/library/index.js` line 14223）：
```javascript
phaseName = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
```

**关键区分**：
- `phaseBegin` = 回合开始（整个大回合开始，在准备阶段之前）
- `phaseZhunbeiBegin` = 准备阶段开始时
- `phaseBefore` = 在任何阶段处理之前（比 phaseBegin 更早）

---

### 2.2 各子阶段内部触发层级

**phaseZhunbei** (content.js:4244)：
```
phaseZhunbei → 触发 phaseZhunbei（派生 phaseZhunbeiBegin / phaseZhunbeiEnd）
```

**phaseDraw** (content.js:4313)：
```
phaseDrawBegin1 → phaseDrawBegin2 → 实际摸牌 → phaseDrawEnd
```
其中 `phaseDrawBegin2` 是修改摸牌数量 `trigger.num` 的标准时机：
```javascript
// skill.js:406-414
zf_phaseDraw: {
    trigger: { player: "phaseDrawBegin2" },
    filter(event, player) {
        return !event.numFixed;   // 防锁死
    },
    async content(event, trigger, player) {
        trigger.num += get.info(event.name).num;  // 增加摸牌阶段摸牌数
    }
}
```

> **注意**：摸牌阶段默认摸2张（player.js:5329：`next.num = 2`），首回合可选少摸1张。

---

### 2.3 手牌上限修改链 (`maxHandcard` mod)

**源文件**：`noname/library/element/player.js`，line 11846

```javascript
getHandcardLimit() {
    var num = Math.max(this.hp, 0);          // 基础值 = 当前体力
    num = game.checkMod(this, num, "maxHandcardBase", this);   // tier 1: 基础覆盖
    num = game.checkMod(this, num, "maxHandcard", this);       // tier 2: 增量修改
    num = game.checkMod(this, num, "maxHandcardFinal", this);  // tier 3: 最终修正
    return Math.max(0, num);
}
```

`checkMod` (game/index.js:8423) 遍历玩家所有技能中的 `mod` 对象，调用对应的修改函数。

**三级 mod 含义**：

| Mod 键 | 用途 | 典型示例 |
|---|---|---|
| `maxHandcardBase` | 基础值覆盖（替代 `hp`） | 「手牌上限固定为体力上限」 |
| `maxHandcard` | 增量/减量修改 | 「手牌上限+X」 |
| `maxHandcardFinal` | 最终微调 | 极少使用 |

---

### 2.4 弃牌计算

**源文件**：`noname/library/element/player.js`，line 12701

```javascript
needsToDiscard(add, filter, pure) {
    let cards = this.getCards("h"), num = 0;
    // ...add处理...
    cards = cards.filter(card => filter(card, this, cards));
    num += cards.length - this.getHandcardLimit();
    return pure ? num : Math.max(0, num);
}
```

手牌超出 `getHandcardLimit()` 返回值的部分即为需要弃置的数量。

---

## 三、完整 Skill 写法模式

### 3.1 模式一：准备阶段摸N张牌（固定数量）

**源文件**：`character/bingshi/skill.js`，line 4823—4836（`spyingjia -> subSkill.draw`）

```javascript
spyingjia: {
    // ...主技能定义...
    subSkill: {
        draw: {
            charlotte: true,                // 不显示为独立技能
            trigger: { player: "phaseBegin" },  // 回合开始触发
            filter(event, player) {
                return event.skill == "spyingjia"; // 额外过滤条件
            },
            forced: true,                   // 强制触发
            popup: false,                   // 不弹窗
            async content(event, trigger, player) {
                player.removeSkill(event.name);  // 一次性：用完自删
                await player.draw(2);            // 摸2张
            },
        },
    },
},
```

**简化版（直接在主技能上定义）**：
```javascript
mySkill: {
    trigger: { player: "phaseBegin" },
    forced: true,
    async content(event, trigger, player) {
        await player.draw(2);  // 摸2张
    },
},
```

### 3.2 模式二：准备阶段摸X张牌（X = 动态值，如护盾数/标记数）

**源文件**：`character/extra/skill.js`，line 3779—3793（`dclinjie` 觉醒技）

```javascript
dclinjie: {
    trigger: { player: "phaseBegin" },
    filter(event, player) {
        return !game.hasPlayer(current => !current.hasAllHistory("damage", evt => evt.num));
    },
    forced: true,
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        // ...统计标记...
        await player.draw(player.countMark("dclinjie"));  // 摸「标记数」张牌
    },
},
```

**另一个示例**（`character/huicui/skill.js` line 8170—8180）：
```javascript
dcguangshi: {
    trigger: { player: "phaseZhunbeiBegin" },   // 准备阶段开始时
    filter(event, player) {
        return !game.hasPlayer(current => current != player && !current.hasMark("dcjizhong"));
    },
    forced: true,
    content() {
        player.draw(game.filterPlayer().reduce(
            (sum, current) => sum + current.countMark("dcjizhong"), 0
        ));  // 摸「全场某标记总数」张牌
        player.loseHp();
    },
},
```

### 3.3 模式三：手牌上限动态修改

**源文件**：`character/bingshi/skill.js`，line 344—360（`mbxiezhi_effect`）

```javascript
mySkill_effect: {
    charlotte: true,
    onremove: true,
    mark: true,             // 显示mark图标
    intro: {
        content: "手牌上限和出杀次数+#",
    },
    mod: {
        maxHandcard(player, num) {
            return num + player.countMark("mbxiezhi_effect");
        },
        cardUsable(card, player, num) {
            if (card.name == "sha") {
                return num + player.countMark("mbxiezhi_effect");
            }
        },
    },
},
```

**直接在技能中定义 mod**（`character/clan/skill.js` line 7345）：
```javascript
chenliuwushi: {
    charlotte: true,
    mod: {
        maxHandcard(player, num) {
            var add = player.storage.chenliuwushi;
            if (typeof add == "number") return num + add;
            return num;
        }
    }
},
```

### 3.4 模式四：使用标准模板 `zf_maxHandcard`

**源文件**：`noname/library/skill.js`，line 438—463

```javascript
// 使用方式：继承 zf_maxHandcard 模板
myMaxHandcardSkill: {
    modNum: 2,   // 固定+2
    // 或者用函数
    modNum: function(player, num) {
        return num + player.hujia;  // 加上护盾数
    },
    init(player, skill) {
        game.broadcastAll((player2, skill2) => {
            const info = get.info(skill2);
            if (info?.mod?.maxHandcard) return;
            const func = info.modNum;
            const mod = function(player3, num) {
                if (typeof func == "number") return num + func;
                if (typeof func == "function") return func(player3, num);
            };
            lib.skill[skill2].mod.maxHandcard = mod;
        }, player, skill);
    },
    mod: {}
},
```

### 3.5 模式五：摸牌阶段额外摸牌

使用 `phaseDrawBegin2` 触发器：

```javascript
myExtraDraw: {
    trigger: { player: "phaseDrawBegin2" },
    filter(event, player) {
        return !event.numFixed;   // 防止被其他技能锁定后仍修改
    },
    async content(event, trigger, player) {
        trigger.num += 1;   // 摸牌阶段多摸1张
    },
},
```

> 对应引擎代码（content.js:4319：`await event.trigger("phaseDrawBegin2")`），接着在 line 4325 读取 `event.num` 执行摸牌。

---

## 四、护盾(hujia)相关模式

### 4.1 护盾系统概览

护盾（`hujia`）定义在 `noname/library/element/player.js` line 314/3298：
- 是玩家的一个属性，类似 `hp`、`maxHp`
- UI 渲染见 `noname/ui/click/index.js` line 3740：生成 `.shield` 元素
- 主要用于炉石模式 (`mode/stone.js`)

### 4.2 护盾数量影响摸牌：直接模式

**源文件**：`character/sb/skill.js`，line 9553—9563

```javascript
sbjushou_draw: {
    trigger: { player: "turnOverAfter" },
    forced: true,
    filter(event, player) {
        return !player.isTurnedOver() && player.hujia > 0;
    },
    content() {
        player.draw(player.hujia);       // 摸「护盾数」张牌
    },
},
```

### 4.3 护盾相关API

| 方法/属性 | 作用 | 源位置 |
|---|---|---|
| `player.hujia` | 当前护盾值 | player.js:314 |
| `player.changeHujia(n)` | 修改护盾值(+/-) | player.js 中定义 |
| `get.infoHujia(info)` | 获取角色的护盾信息 | ui 相关引用 |

---

## 五、通用模式总结：「准备阶段摸X张牌，X=条件值」

### 完整骨架代码

```javascript
// ===== 方案A：直接用一个技能（简单场景）=====
mySkill: {
    trigger: { player: "phaseBegin" },       // 或 "phaseZhunbeiBegin"
    forced: true,                             // 强制触发（无cost）
    // filter(event, player) { return 条件; },  // 可选过滤
    async content(event, trigger, player) {
        const X = player.hujia;               // 动态值来源
        if (X > 0) {
            await player.draw(X);
        }
    },
},

// ===== 方案B：分离 + 手牌上限联动 =====
mySkill: {
    // ...主技能逻辑...
    group: "mySkill_draw",
    subSkill: {
        draw: {
            charlotte: true,
            trigger: { player: "phaseBegin" },
            forced: true,
            popup: false,
            async content(event, trigger, player) {
                await player.draw(player.hujia);      // 摸牌=护盾数
                if (player.hujia > 0) {
                    player.addSkill("mySkill_limit");
                    player.addMark("mySkill_limit", player.hujia, false);
                }
            },
        },
        limit: {
            charlotte: true,
            onremove: true,
            mark: true,
            intro: { content: "手牌上限+#" },
            mod: {
                maxHandcard(player, num) {
                    return num + player.countMark("mySkill_limit");
                },
            },
        },
    },
},
```

### 可用的动态值来源

| 表达式 | 含义 |
|---|---|
| `player.hujia` | 护盾值 |
| `player.hp` | 当前体力 |
| `player.maxHp` | 体力上限 |
| `player.getDamagedHp()` | 已损失体力 |
| `player.countCards("h")` | 手牌数 |
| `player.countCards("e")` | 装备数 |
| `player.countMark("xxx")` | 某标记数 |
| `player.countCharge(true)` | 蓄力点（最大可用） |
| `player.getHandcardLimit()` | 手牌上限 |
| `game.countPlayer()` | 存活玩家数 |
| `game.filterPlayer(f).length` | 满足条件的玩家数 |
| `game.players.length` | 总玩家数 |
| `game.roundNumber` | 当前轮次 |

---

## 六、推断与未知项

### 推断
1. **`phaseBefore` vs `phaseBegin`**：`phaseBefore` 在计时/轮次判定之前触发，`phaseBegin` 在判定之后触发。如需最早介入新一轮，用 `phaseBefore`（参看已废弃的 `_turnover` 技能，line 1771）。通常情况下 `phaseBegin` 更安全。
2. **`phaseZhunbeiBegin` vs `phaseBegin`**：前者在准备阶段子事件开始时触发，后者在整回合的「准备阶段」之前触发。若技能设计意图是「在准备阶段（而非回合更早时机）发动」，应使用 `phaseZhunbeiBegin`。
3. **`phaseDrawBegin2` 修改 `trigger.num`**：这是扩展摸牌阶段摸牌数量的标准方式——只需 `trigger.num += X`。

### 未知/需确认项
1. `modPhaseDraw` 全局钩子（content.js:4322）的注册方和使用场景未完全追踪——该钩子可完全替换摸牌阶段行为。
2. `maxHandcardFinal` 的实际使用极少，需要确认是否有第三方扩展依赖于此。
3. 护盾(`hujia`)在当前代码库中主要在 stone 模式和 sb 角色包中使用，是否为更多模式通用取决于模式配置。

---

## 七、决策输入（给主控）

| 决策点 | 推荐方案 | 理由/证据 |
|---|---|---|
| 准备阶段何时触发 skill | 用 `phaseBegin`（回合开始）或 `phaseZhunbeiBegin`（准备阶段） | 前者是整个回合的第一个触发点，后者是准备阶段的精确触发点。见 content.js:4163/4244 |
| 如何增加摸牌数量 | 在 `phaseDrawBegin2` 中 `trigger.num += X` | 引擎在 phaseDraw content 的 step 2 触发 phaseDrawBegin2，随后一步读取 num 执行摸牌。见 content.js:4319-4325 |
| 手牌上限修改 | 使用 `mod: { maxHandcard(player, num) { return num + X; } }` | 三级 mod 链保证修改被正确应用。见 player.js:11848-11849 |
| 护盾->摸牌 | 直接 `player.draw(player.hujia)` | 已有实战先例（sb/skill.js:9562） |
| 护盾->手牌上限 | 使用 `mod.maxHandcard` 返回 `num + player.hujia` | 推测可行，需验证 mod 在 hujia 变化时是否自动重算 |

---

## 八、关键源文件索引

| 文件 | 关键行 | 内容 |
|---|---|---|
| `noname/library/element/content.js` | 3997-4243 | phase 事件内容（回合触发链） |
| `noname/library/element/content.js` | 4244-4246 | phaseZhunbei 内容 |
| `noname/library/element/content.js` | 4313-4345 | phaseDraw 内容（含 phaseDrawBegin2） |
| `noname/library/element/content.js` | 3247-3294 | phaseLoop 内容（回合循环） |
| `noname/library/element/player.js` | 5300-5353 | phase()/phaseZhunbei()/phaseDraw() 等事件创建 |
| `noname/library/element/player.js` | 7310-7363 | draw() 摸牌方法 |
| `noname/library/element/player.js` | 11846-11851 | getHandcardLimit() 手牌上限计算 |
| `noname/library/element/player.js` | 12701-12721 | needsToDiscard() 弃牌计算 |
| `noname/library/skill.js` | 340-463 | zf_anyGain/zf_phaseDraw/zf_maxHandcard 标准模板 |
| `noname/game/index.js` | 8423-8449 | checkMod() 修改链执行函数 |
| `noname/library/index.js` | 14223 | phaseName 阶段名数组 |
| `character/sb/skill.js` | 9553-9563 | 护盾->摸牌示例 |
| `character/extra/skill.js` | 3779-3793 | phaseBegin + 动态摸牌示例 |
| `character/bingshi/skill.js` | 344-360 | maxHandcard mod 完整示例 |
| `character/bingshi/skill.js` | 4823-4836 | phaseBegin 触发子技能摸牌示例 |
| `character/clan/skill.js` | 7345-7349 | 直接 mod.maxHandcard 示例 |
| `character/huicui/skill.js` | 8170-8180 | phaseZhunbeiBegin + 动态摸牌示例 |
