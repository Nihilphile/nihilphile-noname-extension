# 无名杀引擎护盾/护甲机制探索报告

**探索日期**: 2026-06-30  
**搜索范围**: `F:\AI_project\nameless_game\无名杀子琪懒人包v1.11.3-win32-x64\resources\app` 下所有 `*.js` 文件  
**关键词**: shield, 护盾, armor, 护甲, hujia, 上限, changeHujia

---

## 1. 核心结论

无名杀引擎**已有完整的护甲系统**，但命名约定是 **`hujia`（护甲）** 而非 shield/armor。不存在 `addShield`/`removeShield`/`handleShield`/`getShield` 等函数，统一 API 为 **`player.changeHujia()`**。

---

## 2. 确认事实（附证据）

### 2.1 存储字段：`player.hujia`

`hujia` 是 player 对象上的**直接属性**（非 `player.storage` 子属性）。

**来源1** — player.js 默认值：
```
noname/library/element/character.js:24:  hujia = 0;
```

**来源2** — 角色数据初始化（数组格式 `[sex, group, "hp/maxHp/hujia", skills]`）：
```
noname/library/element/character.js:194:  this.hujia = get.infoHujia(data[2]);
```

**来源3** — 角色数据初始化（对象格式，直接指定字段）：
```
character/key/character.js:166:  hujia: 2,
character/mobile/character.js:340:  hujia: 1,
character/mobile/character.js:580:  hujia: 3,
```

**字符串格式**: `"hp/maxHp/hujia"`，如 `"3/3/1"` 表示 3体力 / 3上限 / 1护甲
```
noname/get/index.js:941-953:
infoHujia(hp) {
    if (typeof hp == "string" && hp.includes("/")) {
        const num = hp.split("/")[2];
        if (num) {
            if (num == "Infinity" || num == "∞") return Infinity;
            else return parseInt(num);
        }
    }
    return 0;
}
```

**子玩家/随从切换时的保存恢复**：
```
noname/library/element/content.js:2936:  player.storage[current].hujia = player.hujia;
noname/library/element/content.js:2970:  player.storage[current].hujia = player.hujia;
```

### 2.2 API：`player.changeHujia(num, type, limit)`

**定义位置**: `noname/library/element/player.js:8596-8621`

```javascript
changeHujia(num, type, limit) {
    const next = game.createEvent("changeHujia");
    if (typeof num != "number") num = 1;
    if (limit === true) limit = 5;          // ⭐ 默认上限为5
    if (typeof limit == "number" && this.hujia + num > parseInt(limit))
        num = Math.max(0, parseInt(limit) - this.hujia);
    if (typeof type != "string") {
        if (num > 0) type = "gain";
        else if (num < 0) type = "lose";
        else type = "null";
    }
    next.num = num; next.player = this; next.type = type;
    next.setContent("changeHujia");
    return next;
}
```

**参数说明**:
- `num`: 变化量，正数=获得，负数=失去。默认 1
- `type`: `"gain"` | `"lose"` | `"damage"` | `"null"`。省略时自动推断
- `limit`: `true`=上限5，或传入具体数字。省略=无上限

**内容处理器**: `noname/library/element/content.js:11636-11657`

```javascript
async changeHujia(event) {
    const { player } = event;
    let { num } = event;
    if (num > 0) {
        game.log(player, "获得了" + get.cnNumber(num) + "点护甲");
    } else if (num < 0) {
        if (-num > player.hujia) { num = -player.hujia; event.num = num; }
        switch (event.type) {
            case "damage":
                game.log(player, "的护甲抵挡了" + get.cnNumber(-num) + "点伤害");
                break;
            case "lose":
                game.log(player, "失去了" + get.cnNumber(-num) + "点护甲");
                break;
        }
    }
    player.hujia += num;
    player.update();
}
```

**事件触发**: 创建 `"changeHujia"` 事件后，引擎自动产生 `changeHujiaAfter` 等 hook，可在技能中监听：
```
character/key/skill.js:4186:  trigger: { player: "changeHujiaAfter" },
```

### 2.3 显示机制：mark 系统 + `.shield` CSS

#### 2.3.1 游戏中显示（mark 系统）

护甲通过内置的**伪技能 `ghujia`** 使用 mark 系统显示：

**`ghujia` 定义**: `noname/library/skill.js:1742-1749`
```javascript
ghujia: {
    intro: {
        content: function(content, player) {
            return "已有" + get.cnNumber(player.hujia) + "点护甲值";
        }
    },
    markimage: "image/card/shield.png"
}
```

**mark 触发**: `noname/library/element/player.js:4374-4378`
```javascript
// 在 $update() 中：
if (this.hujia) {
    this.markSkill("ghujia");
} else {
    this.unmarkSkill("ghujia");
}
```

**mark 数字显示**: `noname/library/element/player.js:4611-4612`
```javascript
} else if (i == "ghujia") {
    num = this.hujia;
}
```
护甲值直接显示在盾牌图标上的 `.markcount` 元素中。

#### 2.3.2 选将界面显示

`noname/ui/create/index.js:3146-3168` — 两种模式：
- **newstyle 模式**: 若 `hujia > 0`，添加一个 `.shield` div + hujia 数字文本
- **old 模式**: 为每个护甲点循环创建 `.shield` div（`for (var i = 0; i < shield; i++)`）

#### 2.3.3 点击查看其他角色

`noname/ui/click/index.js:3738-3742`
```javascript
const infoShield = get.infoHujia(nameInfoHP);
if (infoShield) {
    ui.create.div(".shield", hpDiv);
    const shieldTextDiv = ui.create.div(".text", hpDiv);
    shieldTextDiv.innerHTML = `×${infoShield}`;
}
```

### 2.4 护甲上限：默认 5

**来源1** — `changeHujia` 中 `limit=true` → `5`:
```
noname/library/element/player.js:8601-8602:
if (limit === true) limit = 5;
```

**来源2** — 各技能中检查上限的模式：
```javascript
// 大量技能使用 player.hujia < 5 作为可获取护甲的前置条件：
character/bingshi/skill.js:4006:  return player.hujia < 5;
character/mobile/skill.js:10394:  eff = target.hujia < 5 ? 1 : 0;
character/mobile/skill.js:15749:  return target != player && target.hujia < 5;
character/offline/skill.js:26759:  return event.player.hujia < 5;
```

**来源3** — 护甲满时的 AI 行为：
```
character/sb/skill.js:9784:  if ((player.hp <= 1 && !player.canSave(player)) || player.hujia >= 5)
character/sb/skill.js:9870:  if (target.hp <= 1 || target.hujia >= 5)
```
当 `hujia >= 5` 时 AI 不再试图获取护甲。

**注意**: 可通过 `limit` 参数自定义上限：
```javascript
player.changeHujia(1, null, 3);  // 上限3
player.changeHujia(1, null, true); // 上限5（默认）
```

### 2.5 伤害吸收机制

**位置**: `noname/library/element/content.js:11599-11606`

```javascript
async changeHp(event) {
    let { player, num } = event;
    if (num < 0 && player.hujia > 0 && 
        event.getParent().name == "damage" && 
        !player.hasSkillTag("nohujia") && 
        !event.getParent().nohujia) {
        event.hujia = Math.min(-num, player.hujia);
        event.getParent().hujia = event.hujia;
        event.num += event.hujia;
        player.changeHujia(-event.hujia).type = "damage";
    }
    // ... then applies remaining hp change
}
```

**伤害吸收流程**:
1. 受到 N 点伤害 → 如果 `player.hujia > 0` 且无 `nohujia` 标签
2. 吸收 `min(N, player.hujia)` 点伤害
3. `damage` 事件的 `.hujia` 属性记录吸收量
4. 护甲减少吸收量，体力只扣剩余部分

**绕过护甲的方式**:
- `player.damage("nohujia")` — 在 damage 调用时传 `"nohujia"` 参数（player.js:8345）
- `player.hasSkillTag("nohujia")` — 如 `jueqing`（绝情）技能标签
- `event.nohujia = true` — 直接设置 damage 事件属性

**护甲伤害音效**:
```
noname/library/element/content.js:11354-11366
```
有护甲时播放专门的护甲伤害音效（`effect/hujia_damage.mp3` 等）。

### 2.6 Trigger 写法：「每失去1点体力获得N点护甲」

#### 范本：`sbkurou`（苦肉 — 谋黄盖）

**文件**: `character/sb/skill.js:9847-9877`

```javascript
// 子技能 gain: 每失去体力后获得护甲
subSkill: {
    gain: {
        audio: "sbkurou",
        trigger: { player: "loseHpEnd" },           // ⭐ 监听 loseHpEnd 事件
        forced: true,
        locked: false,
        filter(event, player) {
            return player.isIn() && 
                   player.hujia < 5 &&               // ⭐ 检查护甲未满
                   event.num > 0;                     // ⭐ 确保是失去体力（非0）
        },
        getIndex: event => event.num,
        async content(event, trigger, player) {
            await player.changeHujia(2, null, true);  // ⭐ 获得2点护甲
        },
    },
},
```

#### 另一个范本：伤害转护甲（天庭扩展）

```javascript
// extension/天庭/extension.js:2788-2793
trigger: { player: 'damageEnd' },   // 或 global: 'damageEnd'
content: function () {
    trigger.cancel();                // 取消伤害
    player.changeHujia(trigger.num, null, true);  // 伤害量转为护甲
},
```

#### 关键 Trigger 事件列表

| 事件名 | 触发时机 | 用途 |
|--------|----------|------|
| `changeHp` | 体力变化前 | 检测受伤 |
| `changeHpAfter` | 体力变化后 | 受伤后给护甲 |
| `loseHp` | 失去体力前 | 拦截/修改 |
| `loseHpEnd` | 失去体力后 | **「每失去体力获得护甲」的标准触发点** |
| `damage` | 受到伤害前 | 修改伤害量 |
| `damageEnd` | 受到伤害后 | 检测护甲吸收量（`event.hujia`） |
| `changeHujiaAfter` | 护甲变化后 | 检测护甲归零或满甲 |

### 2.7 直接操作护甲的技能范例

#### 主动获得护甲（选项式）
```javascript
// character/bingshi/skill.js:3993-4030 — 三选一：摸牌/回血/护甲
["hujia", "获得1点护甲"],
// ...
case "hujia":
    await player.changeHujia(1, null, true);
    break;
```

#### 给予其他角色护甲
```javascript
// character/sb/skill.js:10634 — 节钺：令一名其他角色获得1点护甲
target.changeHujia(1, null, true);
```

#### 消耗护甲（失去护甲）
```javascript
// character/sb/skill.js:9578 — 失去1点护甲发动效果
player.changeHujia(-1);

// character/sb/skill.js:10539 — 异步方式
await player.changeHujia(-1);
```

#### 根据条件获得不定量护甲
```javascript
// character/sb/skill.js:9487 — 弃置多少牌获得多少护甲
player.changeHujia(cards.length, null, true);
```

#### 检测护甲吸收量后补偿（`sbxiayuan` — 于禁）
```javascript
// character/sb/skill.js:10578-10610
trigger: { global: "damageEnd" },
filter(event, player) {
    return event.hujia &&           // ⭐ damage 事件的 hujia 属性记录吸收量
           !event.player.hujia &&   // 护甲被完全打穿
           event.player.isIn() &&
           player.countCards("h") > 1;
},
// ...
target.changeHujia(trigger.hujia, null, true);  // 补偿等量护甲
```

---

## 3. 推断与推理

### 3.1 `player.hujia` 不是 storage 键
`hujia` 是 player 对象的直接属性（与 `hp` 同级），与 `player.hp`、`player.maxHp` 并列。这意味着它随角色本体存在，不依赖任何技能。`player.storage` 中的 `hujiaing` 是**另一个**概念——它是 `hujia`（护驾，主公技）的状态标记，不是护甲值。

### 3.2 护甲系统与体力系统的关系
护甲是体力的"前置缓冲"——只有 `changeHp` 被调用（且为负数）时才触发吸收，**只在 damage 事件流程中生效**。`loseHp`（直接失去体力）最终也调用 `changeHp`，因此护甲也能吸收 `loseHp`。

### 3.3 `ghujia` 标记的触发时机
**每次 `player.update()` 都会重新评估** `markSkill("ghujia")` / `unmarkSkill("ghujia")`。这意味着：
- 护甲值变化后，盾牌标记上的数字自动更新
- 护甲归零时，盾牌标记自动消失
- `changeHujia` 的 content handler 中已调用 `player.update()`

### 3.4 mark 与 shield CSS 是两个独立的显示层
- **游戏中**（大画面）：使用 mark 系统 (`ghujia` → 盾牌图标 + 数字)
- **选将界面**（小头像）：使用 `ui.create.div(".shield")` 创建盾牌小格子
- **点击查看**：使用 `.shield` + `.text` 显示 `×N` 格式

### 3.5 无专用 addShield/removeShield 函数
搜索整个代码库，不存在 `addShield`/`removeShield`/`handleShield`/`getShield` 函数。统一入口就是 `player.changeHujia()` 和直接访问 `player.hujia`。

---

## 4. 剩余未知项

1. **护甲是否有配置开关**：未发现全局启用/禁用护甲系统的配置项。护甲似乎始终可用，只要角色的 `hujia` 初始值 > 0 或技能赋予。

2. **护甲与其他属性的交互**：护甲被 `hasSkillTag("nohujia")` 绕过，但未发现护甲与属性伤害（火/雷）等有特殊交互的内置逻辑（技能层面可自行实现）。

3. **Infinity 护甲的实际用途**：`get.infoHujia` 支持 `Infinity`/`∞`，但未发现实际使用无限护甲的角色。

4. **联网同步机制**：`game.addVideo("update", this, [..., this.hujia])` 表明护甲值随 update 视频帧同步，但具体的回放/录像机制未深入验证。

---

## 5. 决策输入

| 决策问题 | 证据总结 | 建议 |
|----------|----------|------|
| 字段名用什么？ | `player.hujia` 是引擎标准，所有现有技能都读/写这个字段 | **使用 `hujia`**，不要另起 shield/armor |
| 如何增加护甲？ | `player.changeHujia(n, null, true)` — 第二个参数可省略，第三个 `true`=上限5 | 直接调用此API |
| 如何显示护甲？ | 引擎自动通过 `ghujia` mark 显示，`player.update()` 自动刷新 | **无需手动处理显示** |
| 上限默认多少？ | 默认 5，在 `changeHujia` 中 `limit=true` 时生效 | 需要不同上限时传第三个参数为数字 |
| 「失去体力获护甲」trigger | `trigger: { player: "loseHpEnd" }` | 标准模式 |
| 如何检测护甲吸收？ | damage 事件后检查 `event.hujia`（吸收量） | 在 `trigger: { global: "damageEnd" }` 中使用 |
| 如何绕过护甲？ | `player.damage("nohujia")` 或给予 `hasSkillTag("nohujia")` | 绝情类技能使用此机制 |
| 护甲mark如何显示？ | `lib.skill.ghujia` 定义 markimage + intro content，自动联动 player.hujia | 内置机制，自动工作 |

---

## 6. 快速参考

```javascript
// === 增加护甲 ===
player.changeHujia(1);                    // +1，无类型，无上限限制
player.changeHujia(1, null, true);        // +1，上限5（推荐写法）
player.changeHujia(3, null, 10);          // +3，上限10

// === 减少护甲 ===
player.changeHujia(-1);                   // -1
player.changeHujia(-2);                   // -2（不会低于0，content 自动钳制）

// === 读取护甲 ===
player.hujia                              // 当前护甲值
get.infoHujia("3/3/2")                   // 从字符串解析 → 2

// === 检查护甲 ===
if (player.hujia > 0) { /* 有护甲 */ }
if (player.hujia < 5) { /* 护甲未满 */ }

// === 伤害绕过护甲 ===
player.damage("nohujia");                // 此伤害无视护甲
// 或角色有 hasSkillTag("nohujia")（如绝情）

// === 监听护甲吸收 ===
trigger: { global: "damageEnd" }
// event.hujia === 本次被护甲吸收的伤害量
// event.player.hujia === 吸收后的剩余护甲

// === 经典 trigger: 失去体力后获得护甲 ===
{
    trigger: { player: "loseHpEnd" },
    filter(event, player) {
        return player.hujia < 5 && event.num > 0;
    },
    async content(event, trigger, player) {
        await player.changeHujia(2, null, true);  // 失去体力后获得2护甲
    },
}
```
