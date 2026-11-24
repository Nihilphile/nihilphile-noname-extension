# 无名杀引擎关键机制探索报告

> 搜索目录: `resources/app`  
> 调查日期: 2026-06-30  

---

## 0. 目录与源码结构概要

```
resources/app/
├── character/         # 武将定义（每个包一个文件夹+同名.js入口）
│   ├── bingshi/skill.js   # 势包技能（最丰富，推荐首选参考）
│   ├── bingshi.js         # 势包武将清单 + 部分内联技能
│   ├── diy/skill.js       # DIY包技能
│   ├── sb/skill.js        # 手杀包技能
│   ├── key/skill.js       # 关键包技能
│   ├── extra/skill.js     # 扩展包技能
│   └── ...
├── noname/library/element/
│   ├── player.js          # 玩家对象与全部技能/属性API
│   ├── content.js         # 全部事件 content handler（recover/changeHp/phaseLoop等）
│   └── ...
├── noname/library/zhanfa.js   # 战法系统（护甲、体力等战法示例）
├── noname/get/index.js        # 工具函数（get.skillCount 等）
├── extension/                 # 扩展包
└── mode/                      # 模式（brawl/chess/stone含护盾机制）
```

---

## 1. '每回合限一次' vs '每轮限一次' 的标准实现

### 核心机制

引擎中"回合"的边界通过 `phaseLoop` 定义。每次有角色开始新回合时（即：**任意角色**开始其 `phaseLoop`），为**所有存活玩家**的 `stat` 数组 push 一个新的空统计对象。

**证据**: `noname/library/element/content.js` 第4038-4058行:
```js
// phaseLoop 内容第一步
_status.globalHistory.push({ cardMove:[], custom:[], useCard:[], changeHp:[], everything:[] });
const players = game.players.slice(0).concat(game.dead);
for (const current of players) {
    current.actionHistory.push({...});
    current.stat.push({ card: {}, skill: {}, triggerSkill: {} });
    if (isRound) {
        current.getHistory().isRound = true;
        current.getStat().isRound = true;
    }
}
if (isRound) {
    game.getGlobalHistory().isRound = true;
    await event.trigger("roundStart");
}
```

其中 `isRound` 仅在 `game.roundNumber++`（新一轮开始）时为 `true`。

### 1.1 每回合限一次：`usable: 1`

**触发方式**: 在技能定义中设置 `usable: 1`。

**重置机制**: `get.skillCount(skill, player)` 读取 `player.getStat("skill")[skill]`，取的是当前最新 stat 的值。由于新的 `stat.push({...})` 在每个角色回合开始时发生，`usable: 1` 的计数自然在每个角色回合开始时"归零"。

**结论**: `usable: 1` = 每个角色的回合独立计数，符合"每回合限一次"语义（并非"每轮限一次"）。

#### 触发类技能示例: `mbxuye`（庞羲·蓄业）

**文件**: `character/bingshi/skill.js` 第4038-4066行  
**描述**: "每回合限一次，当全场手牌数最少的角色受到伤害后..."

```js
mbxuye: {
    audio: 3,
    trigger: { global: "damageEnd" },   // 全局触发：有角色受伤后
    filter(event, player) {
        return event.player.isMinHandcard() && event.player.isAlive();
    },
    usable: 1,                           // 每回合限一次
    logTarget: "player",
    check(event, player) {
        return get.attitude(player, event.player) > 0;
    },
    async content(event, trigger, player) {
        const target = event.targets[0];
        const isMax = target.isMaxHandcard();
        await target.draw(2);
        // ...
    },
    ai: { expose: 0.2 },
},
```

#### 主动类技能示例: `pot_liezhi`（臧洪·烈志）

**文件**: `character/bingshi.js` 第789-849行  
**描述**: "每回合限一次，你可减少1点体力上限，视为使用一张无次数限制的【桃】/【酒】"

```js
pot_liezhi: {
    enable: "chooseToUse",
    usable: 1,                          // 每回合限一次
    locked: false,
    mod: {
        cardUsable(card) {
            if (card?.storage?.potliezhi) return Infinity;  // 此牌无次数限制
        }
    },
    filter(event, player) {
        return ["tao", "jiu"].some(name => {
            const card = new lib.element.VCard({ name, isCard: true, storage: { potliezhi: true } });
            return event.filterCard(card, player, event);
        });
    },
    chooseButton: {
        dialog(event, player) {
            const list = ["tao", "jiu"].filter(/*...*/);
            return ui.create.dialog("烈志", [list, "vcard"], "hidden");
        },
        backup(links, player) {
            return {
                viewAs: { name: links[0][2], isCard: true, storage: { potliezhi: true } },
                filterCard: () => false,
                selectCard: -1,
                manualConfirm: true,
                log: false,
                popname: true,
                async precontent(event, trigger, player2) {
                    event.getParent().addCount = false;
                    player2.logSkill("pot_liezhi");
                    await player2.loseMaxHp();
                }
            };
        }
    },
},
```

### 1.2 每轮限一次：`round: N`

**文件**: `character/bingshi/skill.js` 第1286-1314行: `mbquanchong`（陈祇·权宠）  
**描述**: "锁定技，每轮限一次，结束阶段..."

```js
mbquanchong: {
    trigger: { player: "phaseJieshuBegin" },
    forced: true,
    round: 1,                           // 每轮限一次
    filter(event, player) {
        return player.countDiscardableCards(player, "he");
    },
    async content(event, trigger, player) {
        // ...
    },
},
```

**工作原理**: 当技能记录(logSkill)时，`player.storage[skillName + "_roundcount"] = game.roundNumber`（`player.js` 第9440-9445行）。在技能可用性检查中（`player.js` 第2899行）：
```js
if (info.round && info.round - (game.roundNumber - player.storage[skill + "_roundcount"]) > 0) {
    continue;  // 距离上次发动不足round轮，不可用
}
```
在 `refreshSkill` 重置时（`player.js` 第10813-10817行）：
```js
if (info.round && player.storage[skill + "_roundcount"]) {
    delete player.storage[skill + "_roundcount"];
    player.unmarkSkill(skill + "_roundcount");
}
```

### 1.3 两种限制的对比

| 机制 | `usable: 1` | `round: 1` |
|------|------------|------------|
| 重置时机 | 任意角色回合开始时 (stat.push) | 游戏轮数增加时 (isRound) |
| 适用场景 | 每回合限一次（独立计数） | 每轮限一次 |
| 触发/主动 | 均可使用 | 均可使用 |
| 存储位置 | `getStat("skill")[skill]` | `storage[skill + "_roundcount"]` |

---

## 2. 出牌阶段主动技能 (`enable: "phaseUse"`) 的标准写法

### 最简模板

```js
skillName: {
    enable: "phaseUse",      // 出牌阶段可用
    usable: 1,               // 出牌阶段限一次
    filter(event, player) {
        return /* 条件，如 player.countCards("h") > 0 */;
    },
    filterCard: true,        // (可选)选择自己手牌
    selectCard: -1,          // (可选)选择全部手牌
    filterTarget: true,      // (可选)需指定目标
    selectTarget: [1, 1],    // (可选)目标数量范围
    async content(event, trigger, player) {
        // 技能效果
    },
    ai: {
        order: 8,            // AI优先级(越大越后)
        result: { player: 1 },
    },
},
```

### 实际示例1: `potjiyu`（势楼贵·积羽）

**文件**: `character/bingshi/skill.js` 第4212-4244行

```js
potjiyu: {
    audio: 3,
    enable: "phaseUse",
    filter(event, player) {
        return player.hasCard(card => lib.filter.cardDiscardable(card, player), "h");
    },
    filterCard: lib.filter.cardDiscardable,
    check(card) { return 8 - get.value(card); },
    prompt() { return lib.translate["potjiyu_info"].split("②")[0].slice(1); },
    usable: 1,
    content() {
        let gains = [];
        let types = [get.type2(cards[0])];
        while (true) {
            const card = get.cardPile2(card => !types.includes(get.type2(card)));
            if (card) { gains.push(card); types.push(get.type2(card)); }
            else break;
        }
        if (gains.length) {
            player.addTempSkill("potjiyu_effect", ["phaseBefore", "phaseChange", "phaseAfter", ...lib.phaseName.map(i => i + "After")]);
            player.gain(gains, "gain2").gaintag.add("potjiyu_effect");
        }
    },
    ai: { order: 10, /* ... */ },
},
```

### 实际示例2: `sbjiewei`（手杀·借威）—— 消耗护甲出牌阶段技能

**文件**: `character/sb/skill.js` 第9567-9592行

```js
sbjiewei: {
    audio: 2,
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.hujia > 0;       // 有护甲才能发动
    },
    filterTarget(card, player, target) {
        return target != player && target.countCards("h");
    },
    content() {
        player.changeHujia(-1);        // 消耗1点护甲
        player.gainPlayerCard(target, "visible", true, "h");  // 获得目标手牌
    },
    ai: {
        combo: "sbjushou",
        order: 8,
        result: {
            player(player, target) { return player.hujia - 3.6; },
            target: -1,
        },
    },
},
```

### 关键要点

- `enable: "phaseUse"` 使技能在出牌阶段按钮可见
- `usable: 1` 控制使用次数（配合上述 stat.push 机制，每回合重置）
- `filterCard` 和 `selectCard` 控制手牌选择（可省略 `selectCard: -1` 表示选择全部符合条件的）
- `filterTarget` 和 `selectTarget` 控制目标选择
- `content()` 或 `async content()` 是技能效果体
- `ai` 块中 `order` 控制技能在AI决策中的优先级（数字越大越后执行）
- `precontent` 可在 `content` 之前做前置交互（如选择数量）

---

## 3. 回复体力 (`recover`/`changeHp`/`gain`) 的 API

### 3.1 `player.recover(params)` — 标准回复体力

**定义**: `noname/library/element/player.js` 第8418-8476行

```js
recover(params) {
    const next = game.createEvent("recover");
    next.player = this;
    // 支持多种参数形式:
    // recover(num)          → 回复num点体力
    // recover({num:N, card:C, source:S}) → 对象形式
    // recover(num, card)     → 位置参数组合
    // recover(num, "nocard") → 不带卡牌标记
    // ...
    next.setContent("recover");
    return next;
}
```

**content handler**: `noname/library/element/content.js` 第11519-11546行:
```js
async recover(event, trigger, player) {
    let { num } = event;
    if (num > player.maxHp - player.hp) {
        num = player.maxHp - player.hp;  // 不超过体力上限
        event.num = num;
    }
    if (num > 0) {
        game.broadcastAll(function(player2) {
            player2.$recover();
        }, player);
        player.$damagepop(num, "wood");
        game.log(player, "回复了" + get.cnNumber(num) + "点体力");
        await player.changeHp(num, false);
    }
}
```

### 3.2 `player.recoverTo(num, args)` — 回复体力至指定值

**定义**: `player.js` 第8484-8493行
```js
recoverTo(num, args) {
    const num2 = num - this.getHp(true);
    return this.recover({ num: num2, ...args });
}
```

### 3.3 `player.changeHp(num, popup)` — 直接修改体力值

**定义**: `player.js` 第8579-8588行

**重要**: `changeHp` 的 content handler（`content.js` 第11599-11635行）包含护甲抵挡逻辑：
```js
async changeHp(event) {
    let { player, num } = event;
    // 受到伤害时，护甲先吸收伤害
    if (num < 0 && player.hujia > 0 && event.getParent().name == "damage" 
        && !player.hasSkillTag("nohujia") && !event.getParent().nohujia) {
        event.hujia = Math.min(-num, player.hujia);
        event.getParent().hujia = event.hujia;
        event.num += event.hujia;
        player.changeHujia(-event.hujia).type = "damage";
    }
    num = event.num;
    player.hp += num;
    // ...
}
```

**关键**: 护甲自动抵挡伤害。当受到伤害`changeHp(-N)`时，如果玩家有护甲，优先用护甲吸收等量伤害。

### 3.4 `player.loseHp(num)` — 流失体力（直接扣血，不触发伤害事件）

**定义**: `player.js` 第8508-8522行

### 3.5 回复体力实际使用示例

```js
// 回复1点体力
await player.recover();                    // 或 player.recover(1)

// 回复N点体力
await player.recover(N);

// 回复至满血
await trigger.player.recoverTo(trigger.player.maxHp);

// 来源标记回复
await player.recover({ num: 2, source: sourcePlayer });

// 直接修改体力（不触发recover事件）
await player.changeHp(1);
```

**实战参考**:
- `character/bingshi/skill.js:2748` — `await trigger.player.recoverTo(trigger.player.maxHp);`
- `character/bingshi/skill.js:5181` — `await player.recover(2);`
- `character/bingshi/skill.js:4026` — `await player.recover();`
- `character/diy/skill.js:5549` — `trigger.player.recover(1 - trigger.player.hp);` (回复至1点)

### 3.6 AI评估回复价值: `get.recoverEffect()`

用于AI判断回复体力对某目标的价值：
```js
get.recoverEffect(player, player, player) > 0  // 判断对自己回复是否有益
```

---

## 4. '失去护盾回复体力' 资源转换模式

### 4.1 护甲（hujia）基本API

**定义**: `noname/library/element/player.js` 第8596-8621行

```js
changeHujia(num, type, limit) {
    // num: 正数=获得护甲, 负数=失去护甲
    // type: "gain"|"lose"|"damage"|"null" (自动推断)
    // limit: 护甲上限，传入true时默认5
    const next = game.createEvent("changeHujia");
    next.num = num;
    next.player = this;
    next.type = type;
    next.setContent("changeHujia");
    return next;
}
```

**content handler** (`content.js` 第11636-11657行):
```js
async changeHujia(event) {
    const { player } = event;
    let { num } = event;
    if (num > 0) {
        game.log(player, "获得了" + get.cnNumber(num) + "点护甲");
    } else if (num < 0) {
        if (-num > player.hujia) {
            num = -player.hujia;  // 不能扣到负数
            event.num = num;
        }
        switch (event.type) {
            case "damage": game.log(player, "的护甲抵挡了" + get.cnNumber(-num) + "点伤害"); break;
            case "lose":   game.log(player, "失去了" + get.cnNumber(-num) + "点护甲"); break;
        }
    }
    player.hujia += num;
    player.update();
}
```

### 4.2 护甲消耗换效果的示例：`sbjiewei`

**文件**: `character/sb/skill.js` 第9567-9592行

这是最接近"消耗护甲换收益"的标准模式：
```js
sbjiewei: {
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.hujia > 0;           // 必须有护甲
    },
    content() {
        player.changeHujia(-1);            // 消耗1点护甲
        player.gainPlayerCard(target, "visible", true, "h");  // 获得效果
    },
},
```

### 4.3 战法中的护甲→体力模式参考

**文件**: `noname/library/zhanfa.js`

战法系统中已有护甲相关的基础设施。虽然未找到精确的 `changeHujia(-2) + recover` 组合模式，但从两个基础API可组合实现。战法相关条目：
- `zf_hujia` (护甲I): 每轮开始获得1点护甲
- `zf_hujia2` (护甲II): 每轮开始获得2点护甲
- `changeHujia` 和 `recover` 均可独立调用

### 4.4 推荐实现方式："失去护盾回复体力"

根据引擎现有API，"消耗2点护甲回复1点体力"的标准实现为：

```js
mySkill: {
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.hujia >= 2 && player.getDamagedHp() > 0;
    },
    content() {
        player.changeHujia(-2);   // 消耗2点护甲
        player.recover();         // 回复1点体力
    },
    ai: {
        order: 6,
        result: {
            player(player) {
                if (player.hujia >= 2 && player.getDamagedHp() >= 2) return 1;
                if (player.hujia >= 2 && player.getDamagedHp() == 1) return 0.3;
                return 0;
            },
        },
    },
},
```

### 4.5 护甲自动吸收伤害（被动机制）

当角色有护甲且受到伤害时，引擎**自动**用护甲抵挡（`content.js:11602-11607`）：
```
受到N点伤害 → 优先扣除hujia → 剩余伤害扣除hp
```
这是内建机制，无需单独实现。

### 4.6 注意事项

1. 护甲上限: `changeHujia` 第三个参数 `limit` 可设置上限（`true`=5），防止护甲溢出
2. 护甲类型: `changeHujia` 第二个参数 `type` 影响日志显示：`"gain"`/`"lose"`/`"damage"`
3. `nohujia` 标签: 有 `skillTag: "nohujia"` 的角色不受护甲保护（伤害直接扣血）
4. `changeHujiaAfter` 事件可在护甲变化后触发其他技能

---

## 5. 锁定技 modifier (`mod: {}`) 详解

`mod` 是技能定义中的一个对象，用于**修改游戏核心数值**而不触发事件。常用于锁定技。

### 5.1 手牌上限相关 (`maxHandcard`)

**文件**: `character/bingshi/skill.js` 第351-360行 (`mbxiezhi_effect`)

```js
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
```

**文件**: `character/bingshi/skill.js` 第4203-4207行 (`potguansha_hand`)

```js
mod: {
    maxHandcard(player, num) {
        return num + player.countMark("potguansha_hand");
    },
},
```

**intro配合**:
```js
intro: {
    content: "手牌上限+#",   // #会被自动替换为实际数值
},
```

### 5.2 常见 `mod` 键位汇总

| mod key | 参数 | 作用 | 返回值 |
|---------|------|------|--------|
| `maxHandcard(player, num)` | player, 当前上限 | 手牌上限 | 新上限值 |
| `cardUsable(card, player, num)` | card, player, 当前可用次数 | 牌使用次数(杀等) | `Infinity`=无限次 |
| `targetInRange(card, player, target)` | card, player, target | 目标距离/范围 | `true`=无视距离 |
| `cardEnabled(card, player)` | card, player | 牌是否可用 | `false`=禁用 |
| `cardSavable(card, player)` | card, player | 牌是否可救人 | `false`=不可 |
| `cardRespondable(card, player)` | card, player | 牌是否可响应 | `false`=不可 |
| `maxCharge(player, num)` | player, 当前上限 | 蓄力值上限 | 新上限值 |
| `maxMark(skill, player, num)` | skill, player, 当前上限 | 标记上限 | 新上限（不常用） |

### 5.3 手牌上限相关的AI评估

AI在判断手牌上限相关技能时会考虑:
- `get.recoverEffect()` — 用于评估补牌/回复的价值
- `player.getDamagedHp()` — 已损失体力
- `player.countCards("h")` — 当前手牌数

### 5.4 其他有用mod实际示例

**无视距离** (`targetInRange`):
```js
// character/bingshi/skill.js:2755-2761 (mbchizhang)
mod: {
    targetInRange(card, player, target) {
        if (get.is.damageCard(card)) return true;  // 伤害牌无视距离
    },
},
```

**禁用牌** (`cardEnabled`):
```js
// character/bingshi.js:256-267 (pothuanshi)
mod: {
    cardEnabled(card, player) {
        if (get.name(card) == "jiu" && !player.isDying()) return false;
    },
    cardSavable(card, player) {
        if (get.name(card) == "jiu" && !player.isDying()) return false;
    },
},
```

**牌无限使用** (`cardUsable`):
```js
// character/bingshi.js:793-799 (pot_liezhi)
mod: {
    cardUsable(card) {
        if (card?.storage?.potliezhi) return Infinity;  // 此牌无次数限制
    },
},
```

### 5.5 锁定技标准结构

```js
myLockedSkill: {
    audio: 2,
    forced: true,         // 锁定技标记(不显示按钮)
    locked: false,        // 可被技能封锁（false表示可以）
    mod: {
        // modifier functions here
    },
    // 如有触发效果：
    trigger: { /* ... */ },
    // 如有主动效果（锁定技一般不包含）：
    // enable: "phaseUse",
},
```

### 5.6 完整锁定技示例：`mbchizhang`（手杀黄祖·持杖）

**文件**: `character/bingshi/skill.js` 第2754-2780行

```js
mbchizhang: {
    mod: {
        targetInRange(card, player, target) {
            if (get.is.damageCard(card)) return true;  // 锁定效果：伤害牌无视距离
        },
    },
    locked: false,
    audio: 2,
    trigger: { player: "useCardToPlayered" },  // 触发效果
    filter(event, player) {
        return event.isFirstTarget && get.is.damageCard(event.card)
            && player.countDiscardableCards(player, "h")
            && player.hasHistory("lose", evt => { /*...*/ });
    },
    async cost(event, trigger, player) {
        event.result = await player.chooseToDiscard(get.prompt2(event.skill), [1, Infinity], "chooseonly")
            .set("ai", card => { /*...*/ }).forResult();
    },
    // content ...
},
```

---

## 6. `changeHujia(-2)` 消耗护甲 + `recover` 回复体力模式

### 6.1 现有示例

代码库中**未找到精确的** `changeHujia(-2) + player.recover()` 组合模式。

最接近的实现：
- **`sbjiewei`** (消耗1护甲→获得敌人手牌): `character/sb/skill.js:9578`
  ```js
  content() {
      player.changeHujia(-1);        // 消耗1点护甲
      player.gainPlayerCard(target, "visible", true, "h");
  },
  ```

- **`erika_yousheng`** (失去所有护甲→作为任务判定): `character/key/skill.js:4220`
  ```js
  var num = player.hujia;
  if (num > 0) {
      player.changeHujia(-num);
      player.chooseToDiscard(num, true, "he");
  }
  ```

- **`sb/skill.js:116`** (注释掉的hujia作为recover替代方案):
  ```js
  //hujia: ["获得1点护甲", (player, target) => get.recoverEffect(target, player, player), 
  //         player => player.changeHujia(1, void 0, true)],
  ```
  这说明护甲在AI评估中与回复体力使用相同的评估函数 `get.recoverEffect()`。

### 6.2 推荐的`changeHujia(-2) + recover`实现

```js
skillName: {
    audio: 2,
    enable: "phaseUse",
    usable: 1,                          // 每回合限一次
    filter(event, player) {
        return player.hujia >= 2 && player.getDamagedHp() > 0;
    },
    content() {
        player.changeHujia(-2);         // 消耗2点护甲
        player.recover();               // 回复1点体力
    },
    ai: {
        order: 6,
        result: {
            player(player) {
                if (player.hujia >= 2 && player.getDamagedHp() >= 2) return 1;
                if (player.hujia >= 2 && player.getDamagedHp() === 1) return 0.3;
                return 0;
            },
        },
    },
},
```

### 6.3 变体：消耗N护甲回复N体力（通过chooseNumbers交互）

```js
async content(event, trigger, player) {
    const result = await player.chooseNumbers(
        "请选择消耗的护甲值", 
        [{ min: 1, max: Math.min(player.hujia, player.getDamagedHp()) }]
    ).forResult();
    if (result?.bool) {
        const num = result.numbers[0];
        player.changeHujia(-num);
        player.recover(num);
    }
},
```

### 6.4 拓展：通过damage事件捕获护甲消耗

如果需要"每当护甲抵挡伤害时回复体力"，可通过监听 `changeHujiaAfter` 事件：

```js
trigger: { player: "changeHujiaAfter" },
filter(event, player) {
    return event.type === "damage" && event.num < 0;  // 护甲抵挡了伤害
},
async content(event, trigger, player) {
    const lostHujia = -trigger.num;
    if (lostHujia >= 2) {
        player.recover();  // 每抵挡2点伤害回复1点体力
    }
},
```

**参考**: `character/key/skill.js:4186` — 已有使用 `changeHujiaAfter` 触发器。

---

## 7. 附加发现：`addTempSkill` 模式

`addTempSkill` 是实现临时效果的核心机制（常用于"直到你的下回合开始"类效果）。

**API**: `player.js` 第11224行:
```js
addTempSkill(skill, expire, checkConflict)
// expire 格式示例:
//   { player: "phaseBegin" }            → 直到该玩家的下回合开始
//   { global: "roundStart" }            → 直到下一轮开始
//   "phaseUseAfter"                     → 到出牌阶段结束后（简写）
//   ["phaseBefore", "phaseAfter", ...]  → 多个时机
```

**实战示例** (`character/bingshi/skill.js`):
```js
// 直到该玩家下回合开始
player.addTempSkill(skill, { player: "phaseBegin" });

// 直到出牌阶段结束
player.addTempSkill("potjiejie_used", "phaseUseAfter");

// 直到下一轮开始
player.addTempSkill("potjiejie_blocker", { global: "roundStart" });

// 关键：addTempSkill 配合 addMark 可实现临时计数
player.addTempSkill(skill, { player: "phaseBegin" });
player.addMark(skill, num, false);
```

**`addTempSkill` + `mod` 组合** — 通过临时技能设置modifier来实现持续效果:
```js
// 添加临时技能，获得手牌上限+2直到回合开始
player.addTempSkill("mySkill_effect", { player: "phaseBegin" });
// mySkill_effect 定义中包含:
// mod: { maxHandcard(player, num) { return num + 2; } }
```

---

## 8. 总结与决策输入

### 事实 (Confirmed)
1. `usable: 1` 在每个角色的回合开始时（phaseLoop的stat.push）重置，实现"每回合各角色独立计数"
2. `round: 1` 通过 `_roundcount` storage 实现每轮限一次，由 `isRound` 标志控制
3. `recover()` 最终通过 `changeHp` 实现，changeHp会先让护甲吸收伤害
4. `mod: { maxHandcard }` 是修改手牌上限的标准方式
5. 护甲(hujia)通过 `changeHujia()` API管理，支持 `gain`/`lose`/`damage` 三种type
6. 代码库中不存在精确的"消耗2护甲回复体力"模式，但两个基础API可以组合实现
7. `addTempSkill` 是临时效果的推荐实现方式

### 推断 (Inferred)
1. "每回合限一次"在引擎中默认就是每个角色各自计数（因为stat.push在每个phaseLoop发生时对所有玩家执行）
2. 任何 `usable: N` 的技能，在非自己回合触发后，到当前回合角色的下个回合开始时就会恢复可用

### 未决项 (Unresolved)
1. `phaseUse` 阶段的 `usable` 重置是否完全等于"每回合限一次"——需要确认多人游戏中的边界情况
2. `cardUsable` mod 在修改杀次数时与 `sha` 默认限制的交互顺序

### 推荐进一步行动
- 如需精确实现"消耗护甲→回复体力"，参考 §6.2 和 §4.4 的组合模式
- 如需实现"每回合限一次"触发型技能，参考 §1.1 的 `mbxuye` 模式
- 如需实现锁定技手牌上限+N效果，参考 §5.1 的 `mod: { maxHandcard }` 模式
- 如需实现"直到下回合开始"的临时效果，参考 §7 的 `addTempSkill` 模式

---

### 关键文件速查

| 功能 | 文件 | 行号 |
|------|------|------|
| phaseLoop stat.push | `noname/library/element/content.js` | 4038-4058 |
| recover API | `noname/library/element/player.js` | 8418-8476 |
| recover content | `noname/library/element/content.js` | 11519-11546 |
| changeHp API | `noname/library/element/player.js` | 8579-8588 |
| changeHp content | `noname/library/element/content.js` | 11599-11635 |
| changeHujia API | `noname/library/element/player.js` | 8596-8621 |
| changeHujia content | `noname/library/element/content.js` | 11636-11657 |
| addTempSkill | `noname/library/element/player.js` | 11224-11268 |
| refreshSkill(usable重置) | `noname/library/element/player.js` | 10789-10824 |
| round机制 | `noname/library/element/player.js` | 9437-9445, 2899-2901 |
| skillCount | `noname/get/index.js` | 4289-4298 |
| mod:maxHandcard示例 | `character/bingshi/skill.js` | 351, 2704, 4204 |
| usable:1 触发示例 | `character/bingshi/skill.js` | 4044 (mbxuye) |
| round:1 示例 | `character/bingshi/skill.js` | 1293 (mbquanchong) |
| phaseUse模板 | `character/bingshi/skill.js` | 4214 (potjiyu) |
| hujia消耗示例 | `character/sb/skill.js` | 9578 (sbjiewei) |
| changeHujiaAfter触发 | `character/key/skill.js` | 4186 |
| 战法护甲示例 | `noname/library/zhanfa.js` | 1199-1227 |
| recoverEffect AI | `character/bingshi/skill.js` | 2163, 4012 |

---

*报告结束。所有文件路径相对于 `resources/app/`。*
