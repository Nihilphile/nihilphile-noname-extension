# 无名杀 Mod 武将 AI 字段函数化深度侦察报告

> 时间：2026-06-27
> 任务：侦察 AI 接入机制中每个字段是否/如何支持自定义 function
> 原则：只读源码，不改代码

---

## 一、全景总表：哪些字段支持 function？

| 字段 | 支持 function? | 是否常用 function? | 调用入口文件:行号 |
|------|:---:|:---:|------|
| `order` | ✅ | 常用 | get/index.js:6339 |
| `value` | ✅ | 常用 | get/index.js:6209 |
| `useful` | ✅ | 常用 | get/index.js:6152 |
| `result.player` | ✅ | 偶尔 | get/index.js:6407, 6644 |
| `result.target` | ✅ | 偶尔 | get/index.js:6410, 6647 |
| `result.player_use` | ✅ | 偶尔 | get/index.js:6407 |
| `result.target_use` | ✅ | 偶尔 | get/index.js:6410 |
| `effect.player` | ✅ | 非常常用 | get/index.js:6665-6667 |
| `effect.target` | ✅ | 非常常用 | get/index.js:6708 |
| `effect.player_use` | ✅ | 常用 | get/index.js:6429-6434 |
| `effect.target_use` | ✅ | 常用 | get/index.js:6481-6505 |
| `threaten` | ✅ | 常用 | get/index.js:6020, 6466-6533 |
| `expose` | ❌ | 仅数字 | player.js:9438（logAi 专用） |
| `wuxie` (card.ai) | ✅ | 仅 function | standard.js:4439 等（wuxie 窗口内调用） |
| `canLink` (card.ai) | ✅ | 仅 function | get/index.js:6601, 6820 |
| `modAttitudeFrom` | ✅ | 仅 function | get/index.js:6098（player.ai 动态属性） |
| `modAttitudeTo` | ✅ | 仅 function | get/index.js:6101（player.ai 动态属性） |
| `skillTagFilter` | ✅ | 仅 function | player.js:12813, 12842 |
| `respondSha` | ✅（bool/string） | 常用 bool | player.js:12976（hasSkillTag 匹配） |
| `respondShan` | ✅（bool/string） | 常用 bool | player.js:12995 |
| `save` | ✅（bool/number） | 常用 | （hasSkillTag 匹配） |
| `noShan` | ✅（bool） | 常用 | （hasSkillTag 匹配） |
| `useShan` | ✅（bool） | 常用 | （hasSkillTag 匹配） |
| 各类 `maixie` 标签 | ✅（bool/string） | 常用 | 卖血系列 |
| `directHit_ai` | ✅（bool） | 偶尔 | player.js hasSkillTag 匹配 |

### 注意事项

1. **`expose` 仅接受数字**：`player.js:9437` 检查 `info.ai.expose != void 0`，用于身份暴露日志，不是决策函数。
2. **`modAttitudeFrom/To` 是 Player 的运行时属性**：不是 `lib.skill[name].ai.modAttitudeFrom`，而是动态挂载到 `player.ai.modAttitudeFrom`。在技能内容函数中临时赋值，如 `target.ai.modAttitudeFrom = function(from, to) { ... }`。
3. **响应标签（respondSha 等）虽然可以是 string**：但 string 值的语义是"仅在特定类型 (use/respond/all) 下生效"。配合 `skillTagFilter` 可实现条件化。
4. **`result` 整体也可以是 function**：`get.result()` (get/index.js:6353) 会调用 `result(item)` 并用返回值作为 result。但目前原版卡牌中极少使用此模式。

---

## 二、字段逐一详解

### 2.1 `order` — 出牌优先级

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.order(item, player)` → get/index.js:6322 |
| **调用时机** | 出牌阶段 chooseToUse（ai1 = get.cacheOrder） |
| **函数签名** | `order(item, player)` |
| **参数** | `item`: Card / vcard / {name} — 待评估的牌<br>`player`: Player — 出牌者 |
| **_status.event** | ✅ 可用（出牌阶段的 chooseToUse 事件） |
| **返回值** | number |
| **正负语义** | `> 0` = 值得主动使用（越大越优先）<br>`≤ 0` = 不应主动出这张牌 |
| **不写默认** | -1（不出） |

**调用流程（get/index.js:6338-6344）**：
```js
num = order;
if (typeof order == "function") {
  num = order(item, player);
}
// 然后 game.checkMod(player, item, num, "aiOrder") 做技能修正
```

**范例**：杀 order 函数（standard.js:366）
```js
order(item, player) {
  let res = 3.2;
  if (player.hasSkillTag("presha", true, null, true)) res = 10;
  // 属性杀：比较杀的基础 useValue 和此属性杀的 useValue
  let uv = player.getUseValue(item, true);
  if (uv <= 0) return res;
  let temp = player.getUseValue("sha", true) - uv;
  return temp < 0 ? res + 0.15 : temp > 0 ? res - 0.15 : res;
}
```
**为什么必须用 function**：属性杀（火杀/雷杀）的基础 order 应根据场上铁索人数微调优先级，静态数字做不到。

---

### 2.2 `value` — 牌固有价值

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.value(card, player, method)` → get/index.js:6181 |
| **调用时机** | 各种评估牌价值的地方：弃牌、顺手/过拆 button AI、装备替换、技能 check |
| **函数签名** | `value(card, player, index, method)` |
| **参数** | `card`: Card — 牌<br>`player`: Player — 持有者<br>`index`: number — 同名牌序号（第几张，0-based）<br>`method`: string — "raw" 取第一张的值 |
| **_status.event** | ✅ 可用 |
| **返回值** | number |
| **正负语义** | `> 0` = 好牌<br>`< 0` = 负面牌（如毒）<br>`0` = 无价值 |
| **不写默认** | -1 |

**调用流程（get/index.js:6197-6226）**：
```js
// 从 card.ai.value / card.ai.basic.value 读取
if (typeof value == "function") {
  result = value(card, player, geti(), method);  // geti() = 同名牌序号
} else if (typeof value == "number") {
  result = value;
} else if (Array.isArray(value)) {
  // method=="raw" → value[0]，否则取 value[index] 或最后一个
}
// game.checkMod(player, card, result, "aiValue")
```

**范例**：酒 value 函数（extra.js:131）
```js
value(card, player, i) {
  if (player.hp > 1) return i === 0 ? 5 : 1;
  return i === 0 ? 7.3 : 3;
}
```
**为什么必须用 function**：酒的价值取决于自身血量（高血 5，低血 7.3），还需要按同名牌递减。静态数组 `[5,1]` 或 `[7.3,3]` 无法自动根据血量切换。

---

### 2.3 `useful` — 留存有用度（弃牌/保留判断）

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.useful_raw(card, player)` → get/index.js:6111 |
| **调用时机** | 弃牌阶段（ai=unuseful）、响应阶段（ai=unuseful2）、顺手/过拆 button AI |
| **函数签名** | `useful(card, index)` |
| **参数** | `card`: Card<br>`index`: number — 同名牌序号（0-based） |
| **_status.event** | ✅ 可用（`_status.event.player` 通常是持有者） |
| **返回值** | number（越高越不愿弃） |
| **正负语义** | 正=愿意保留<br>负=愿意丢弃 |
| **不写默认** | -1（优先弃） |

**调用流程（get/index.js:6141-6160）**：
```js
// 从 card.ai.useful / card.ai.basic.useful 读取
if (typeof useful == "function") {
  result = useful(card, i);  // i = 同名牌序号
} else if (typeof useful == "number") {
  result = useful;
} else if (i < useful.length) {
  result = useful[i];  // 数组按序号取值
}
// game.checkMod(player, card, result, "aiUseful")
```

**范例**：闪 useful 函数（standard.js:545）
```js
useful(card, i) {
  let player = _status.event.player,
      basic = [7, 5.1, 2],
      num = basic[Math.min(2, i)];
  if (player.hp > 2 && player.hasSkillTag("maixie")) num *= 0.57;
  if (player.hasSkillTag("freeShan", false, null, true) || player.getEquip("rewrite_renwang")) num *= 0.8;
  return num;
}
```
**为什么必须用 function**：闪的价值取决于是否有卖血标签（减 43%）、是否有仁王盾（减 20%）。这些不能用静态数组表示。

---

### 2.4 `result.player` / `result.target` — 基本收益预设

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.result(card, skill)` → `get.effect()` / `get.effect_use()` |
| **调用时机** | 每次计算 effect 时（出牌选目标、判断无懈、响应评估等） |
| **函数签名** | `result.player(player, target, card, isLink)` |
| **参数** | `player`: Player — 使用者<br>`target`: Player — 目标<br>`card`: Card — 牌<br>`isLink`: object/undefined — 铁索传递 |
| **_status.event** | ✅ 可用 |
| **返回值** | number |
| **正负语义** | `> 0` = 对使用者/目标有**正**收益<br>`< 0` = 负收益（如伤害） |
| **不写默认** | 0（无收益） |

**注意**：`result.player_use` / `result.target_use` 与上面签名相同，但仅在 `get.effect_use`（主动出牌评估）中调用。若未定义 `player_use`/`target_use`，系统回退到 `result.player`/`result.target`。

**范例**：杀 result.target 函数（standard.js:389）
```js
target(player, target, card, isLink) {
  let eff = -1.5, odds = 1.35, num = 1;
  if (isLink) {
    eff = isLink.eff || -2;
    odds = isLink.odds || 0.65;
    num = isLink.num || 1;
    return odds * eff * num;
  }
  // 酒/加伤 → eff放大
  if (player.hasSkill("jiu") || player.hasSkillTag("damageBonus", ...)) {
    if (get.attitude(player, target) > 0) eff = -7;
    else eff = -4;
    num = 2;
  }
  // mayHaveShan 概率抵消
  odds -= 0.7 * target.mayHaveShan(player, "use", true, "odds");
  return odds * eff;
}
```
**为什么必须用 function**：
- 酒加伤改变伤害量
- mayHaveShan 改变命中概率（odds）
- 友方/敌方伤害权重不同
- 铁索传导改变参数
这些都不是一个静态数字能表达的。

---

### 2.5 `effect.player` / `effect.target` — 技能修改牌收益

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.effect()` 遍历 player 技能（effect.player）和 target 技能（effect.target） |
| **调用时机** | 每次 `get.effect()` 被调用时（影响出牌目标选择、无懈判断、响应评估...） |
| **函数签名** | `effect.player(card, player, target, current, isLink)` |
| **参数** | `card`: Card — 正在评估的牌<br>`player`: Player — 牌的使用者<br>`target`: Player — 牌的目标<br>`current`: number — 当前玩家端收益值<br>`isLink`: object/undefined |
| **_status.event** | ✅ 可用 |
| **返回值** | number / [mult,add] / [m1,a1,m2,a2] / "zeroplayer" / "zerotarget" / undefined |
| **不写默认** | undefined（无修正） |

**返回值规范**（get/index.js:6671-6689）：
- `number` → result1 *= number (乘以此数)
- `[mult, add]` → result1 = result1 * mult + add
- `[m1, a1, m2, a2]` → result1 = result1 * m1 + a1, result2 = result2 * m2 + a2
- `"zeroplayer"` → result1 = 0
- `"zerotarget"` → result2 = 0
- `"zeroplayertarget"` → 两边归零
- `undefined` → 不做修改

**范例 1**：反馈 effect.target（standard.js:547）
```js
// 反馈：受伤后可摸对手牌
effect: {
  target(card, player, target) {
    if (player.countCards("he") > 1 && get.tag(card, "damage")) {
      if (player.hasSkillTag("jueqing", false, target)) return [1, -1.5];
      if (get.attitude(target, player) < 0) return [1, 1];  // 敌人打你：伤害不变但额外+1
    }
  }
}
```
**为什么必须用 function**：只在"对方有牌可拿且是伤害牌"时生效，且效果取决于敌我态度和绝情标签。

**范例 2**：刚烈 effect.target（standard.js:667）
```js
effect: {
  target(card, player, target) {
    if (player.hasSkillTag("jueqing", false, target)) return [1, -1];
    return 0.8;  // 所有伤害 ×0.8 = 威慑
  }
}
```
**为什么必须用 function**：对绝情将反而更弱（-1）。

---

### 2.6 `effect.player_use` / `effect.target_use` — 主动出牌专用修正

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.effect_use()` 遍历 player/target 技能 |
| **调用时机** | 仅在 `chooseToUse` 阶段的 effect 计算时（主动出牌选目标） |
| **函数签名** | `effect.player_use(card, player, target, current, isLink)` |
| **参数** | 同 effect.player，但用 `player_use`/`target_use` 专属 result |
| **与 effect 的区别** | 只在"主动出牌选目标"时生效，不影响响应/被动场景的 effect 计算 |
| **不写默认** | undefined（不修正） |

**范例**：仁德 effect.target_use（standard.js:1125）
```js
// 刘备仁德给装备时避免浪费
effect: {
  target_use(card, player, target) {
    if (player == target && get.type(card) == "equip") {
      if (player.countCards("e", { subtype: get.subtype(card) })) {
        // 自己有同类装备，检查有没有队友需要
        const players = game.filterPlayer();
        for (let i = 0; i < players.length; i++) {
          if (players[i] != player && get.attitude(player, players[i]) > 0) {
            return 0;  // 有队友 → 不修正（允许自己装），无队友 → 默认也不修正
          }
        }
      }
    }
  }
}
```
**为什么必须用 function**：需要判断"自己在装装备时是否有队友需要这个装备"，这是完全动态的逻辑。

---

### 2.7 `threaten` — 威胁系数

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.threaten(target, player)` — get/index.js:6011<br>`get.effect()` / `get.effect_use()` 中遍历 target 技能 |
| **调用时机** | 计算 effect 时遍历 target 技能、评估目标威胁 |
| **函数签名** | `threaten(player, target)` |
| **参数** | `player`: Player — 威胁的评估者<br>`target`: Player — 被评估者 |
| **_status.event** | ✅ 可用 |
| **返回值** | number（≥1） |
| **正负语义** | `1.0` = 基准，`> 1` = 更威胁，`< 1` = 不太威胁 |
| **不写默认** | 不参与计算（即乘以 1.0） |

**调用方式**（get/index.js:6019-6027）：
```js
// 遍历 target 技能
if (typeof info.ai.threaten == "function" && player) {
  var tmp = info.ai.threaten(player, target);
  if (typeof tmp == "number") threaten *= tmp;
} else if (typeof info.ai.threaten == "number") {
  threaten *= info.ai.threaten;
}
```

**effect 中的用法**（get/index.js:6537-6542）：
```js
if (cache.get.attitude(player, target) < 0) {
  result2 *= Math.sqrt(threaten);        // 敌人：威胁修正开方
} else {
  result2 *= Math.sqrt(Math.sqrt(threaten));  // 友方：威胁修正开四次方
}
```

**范例**：屯田 threaten 函数（bingshi.js:1194）
```js
threaten(player, target) {
  if (target.countCards("h") == 0) return 2;   // 空城 → 威胁翻倍
  return 0.5;                                     // 有手牌 → 威胁减半
}
```
**为什么必须用 function**：威胁取决于动态条件（手牌数）。

---

### 2.8 `wuxie` — 无懈可击判断

| 属性 | 说明 |
|------|------|
| **被谁读取** | 无懈窗口内的 ai1 函数（standard.js:4438 等） |
| **调用时机** | 弹无懈窗口时，评估是否应该打无懈 |
| **函数签名** | `wuxie(target, card, sourcePlayer, viewerPlayer, state)` |
| **参数** | `target`: Player — 牌的目标（或 source 视情况）<br>`card`: Card — 正在使用的牌<br>`sourcePlayer`: Player — 牌的使用者<br>`viewerPlayer`: Player — AI 控制者（_status.event.player）<br>`state`: number — 无懈方向（+1 正无懈，-1 反无懈） |
| **_status.event** | ✅ 可用 |
| **返回值** | number<br>`> 0` = 应该无懈<br>`≤ 0` = 不无懈<br>`undefined` → 继续走默认判断 |
| **不写默认** | undefined → 走默认逻辑（基于 effect 和 attitude） |

**调用上下文**（standard.js:4432-4494）：
```js
// 判定牌无懈
ai1() {
  var info = lib.card[name];
  if (info && info.ai && info.ai.wuxie) {
    var aiii = info.ai.wuxie(source, card, source, _status.event.player, state);
    if (typeof aiii === "number") return aiii;  // 直接返回
  }
  // 否则走默认：基于 effect 和 attitude
}
```

**范例**：南蛮 wuxie（standard.js:1384）
```js
wuxie(target, card, player, viewer, status) {
  let att = get.attitude(viewer, target),
      eff = get.effect(target, card, player, target);
  if (Math.abs(att) < 1 || status * eff * att >= 0) return 0;  // 态度无关/方向不对
    
  // 目标有已知杀 → 不无懈
  if (canSha(target)) return 0;
  // 自己危险 → 无懈
  if ((viewer.hp <= damage || ...) && !canSha(viewer)) return status;
  // 遍历目标列表判断优先级
  // ...
}
```
**为什么必须用 function**：判断逻辑涉及态度、伤害数据、已知手牌、自身血量、后续目标优先级等。

---

### 2.9 `canLink` — 铁索传导判断

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.effect()` / `get.effect_use()` 中，牌有 natureDamage 标签时 |
| **调用时机** | effect 计算的最后，判断属性伤害是否应传导 |
| **函数签名** | `canLink(player, target, card)` |
| **参数** | `player`: Player — 牌使用者<br>`target`: Player — 首选目标<br>`card`: Card — 牌 |
| **_status.event** | ✅ 可用 |
| **返回值** | falsy → 不传导<br>object `{eff, odds, num}` → 传导参数<br>truthy非object → 默认参数 |
| **不写默认** | undefined → 不调用 canLink（默认全部已铁索的队友传导） |

**范例**：杀 canLink（standard.js:330）
```js
canLink(player, target, card) {
  if (!target.isLinked() && !player.hasSkill("wutiesuolian_skill")) return false;
  if (player.hasSkill("jueqing") || player.hasSkill("gangzhi") || target.hasSkill("gangzhi"))
    return false;
  let obj = {};
  if (get.attitude(player, target) > 0 && get.attitude(target, player) > 0) {
    if (player有酒/加伤 && target没减伤) obj.num = 2;
    if (target.hp > obj.num) obj.odds = 1;
  }
  if (!obj.odds) obj.odds = 1 - target.mayHaveShan(player, "use", true, "odds");
  return obj;
}
```
**为什么必须用 function**：判断涉及好感度、酒/加伤、绝情/刚直、护甲、是否有闪等。

---

### 2.10 `modAttitudeFrom` / `modAttitudeTo` — 态度修改

| 属性 | 说明 |
|------|------|
| **被谁读取** | `get.attitude()` — get/index.js:6098-6103 |
| **调用时机** | 每次 `get.attitude(from, to)` 被调用后 |
| **函数签名** | `modAttitudeFrom(from, to, att)` / `modAttitudeTo(from, to, att)` |
| **参数** | `from`: Player — 态度来源<br>`to`: Player — 态度目标<br>`att`: number — 当前 rawAttitude 结果 |
| **_status.event** | ✅ 可用 |
| **返回值** | number — 修正后的 attitude |
| **不写默认** | 无此属性 → 不修正 |

**重要**：这是 `player.ai` 的**运行时属性**，不在 `lib.skill[name].ai` 中定义。而是在技能内容执行时动态挂载。例如僵尸事变技能（offline/skill.js:3507）：
```js
target.ai.modAttitudeFrom = function(from, to) {
  if (to == from["zombieshibian"]) return 114514;
  return get.attitude(from["zombieshibian"] || from, to["zombieshibian"] || to);
};
```

---

### 2.11 `skillTagFilter` — 响应标签过滤器

| 属性 | 说明 |
|------|------|
| **被谁读取** | `hasSkillTag()` — player.js:12813, 12842 |
| **调用时机** | 任何代码调用 `hasSkillTag(tag, hidden, arg)` 时 |
| **函数签名** | `skillTagFilter(player, tag, arg)` |
| **参数** | `player`: Player — 技能持有者<br>`tag`: string — 正在查询的标签名<br>`arg`: 调用方传入的附加参数（可为对象） |
| **_status.event** | ✅ 可用 |
| **返回值** | `false` → 假装没这个标签<br>其他 → 正常判断 |
| **不写默认** | 无此属性 → 不做过滤 |

**用途**：一个技能虽然写了 `ai.respondSha: true`，但可以通过 `skillTagFilter` 在某些条件下返回 false 来临时禁用该标签。

**范例**：激将 respondSha（standard.js:1170）
```js
ai: {
  order() { return get.order({name:"sha"}) + 0.3; },
  respondSha: true,
  skillTagFilter(player) {
    if (!player.hasZhuSkill("jijiang") || !game.hasPlayer(cur => cur != player && cur.group == "shu"))
      return false;  // 无蜀将 → 相当于没有 respondSha
  }
}
```
**为什么必须用 function**：是否持有主公技取决于场上是否有蜀势力角色，这是动态条件。

**范例 2**：龙胆 respondSha 更精确（clan.js:638）
```js
ai: {
  respondSha: true,
  skillTagFilter(player2, tag, arg) {
    if (tag == "respond") return false;  // 通用"respond"标签 = false
    if (tag == "respondSha" && (player2.storage.clandongxu || !player2.countCards("e")))
      return false;  // 特定状态下不提供 respondSha
  }
}
```

---

### 2.12 重要辅助：`checkMod` 钩子

技能还可以通过 `mod` 协议修改 AI 字段，不需要直接写在 `ai` 里：

```js
// 技能定义
mod: {
  aiOrder(player, card, num) { return modifiedNum; },
  aiValue(player, card, num) { return modifiedNum; },
  aiUseful(player, card, num) { return modifiedNum; },
  selectTarget(card, player, range) { ... },
}
```

这些在 `game.checkMod()` 中被调用（game/index.js），最终修改 order/value/useful 的值。签名统一为 `(player, card, num)`，返回修改后的值。

---

## 三、10 个精选复杂 AI Function 范例

### 范例 1: 杀 result.target — 主动出牌类

**文件**：`card/standard.js:389`
**字段**：`result.target`
**代码**：见上文 §2.4
**解决的问题**：杀对目标的收益不是固定数，而是 = 基础伤害(-1.5) × 命中概率(odds) × 伤害量。命中概率受 mayHaveShan 影响（≈ 目标有闪的概率×0.7），伤害量受酒/加伤技能影响。对友方用杀额外惩罚（eff=-7）。
**为什么必须 function**：odds、伤害量、态度三方全动态。
**如何影响决策**：effect_use 用此结果 × attitude 算出 final score，score 越高越优先选该目标。

---

### 范例 2: 刘备仁德 effect.target_use + result.target — 主动+修正类

**文件**：`character/standard.js:1097`
**字段**：`result.target` (函数) + `effect.target_use` (函数) + `order` (函数) + `threaten` (数字)
```js
ai: {
  order(skill, player) {
    if (player.hp < player.maxHp && player.storage.rende < 2 && player.countCards("h") > 1)
      return 10;  // 受伤且未刷完 → 最高优先级
    return 1;
  },
  result: {
    target(player, target) {
      if (target.hasSkillTag("nogain")) return 0;
      if (ui.selected.cards.length && ui.selected.cards[0].name == "du") return -10;
      if (target.hasJudge("lebu")) return 0;  // 被乐的不给牌
      return Math.max(1, 5 - target.countCards("h"));  // 手牌越少的队友越优先
    }
  },
  effect: {
    target_use(card, player, target) {
      if (player == target && get.type(card) == "equip") {
        // 自己在装装备时检查是否有队友需要
        if (player.countCards("e", { subtype: get.subtype(card) })) {
          const players = game.filterPlayer();
          for (let i = 0; i < players.length; i++) {
            if (players[i] != player && get.attitude(player, players[i]) > 0) return 0;
          }
        }
      }
    }
  },
  threaten: 0.8
}
```
**解决的问题**：
1. result.target 根据目标手牌数动态计算收益
2. effect.target_use 阻止浪费装备
3. order 根据血量/技能使用次数动态调整优先级
**为什么必须 function**：纯数字无法表达"手牌越少越优先"和"受伤时优先发动"。

---

### 范例 3: 赵云龙胆（viewAs 杀/闪）— 主动+响应类

**文件**：`character/standard.js:1469`
**字段**：`order` (函数) + `effect.target` (函数) + `respondSha` (bool) + `skillTagFilter` (函数) + `useful` (数字) + `value` (数字)
```js
// 龙胆.杀（闪当杀）
ai: {
  effect: {
    target(card, player, target, current) {
      if (get.tag(card, "respondSha") && current < 0) return 0.6;  // 响应杀时伤害打8折
    }
  },
  respondSha: true,
  skillTagFilter(player) {
    if (!player.countCards("hs", "shan")) return false;  // 没闪时无此标签
  },
  order() { return get.order({name:"sha"}) + 0.1; },
  useful: -1,
  value: -1
}
```
**解决的问题**：
1. `effect.target` 让赵云用闪出杀时伤害略低（0.6×），反映"转化出杀不划算"
2. `skillTagFilter` 确保没闪时不骗系统说有 respondSha
3. `order` = 杀 order + 0.1 → 比普通杀更优先（避免浪费闪）
4. `useful: -1, value: -1` — 技能本身不占用牌，所以不参与弃牌/价值计算
**为什么必须 function**：effect 需要区分"主动出杀"和"响应出杀"（respondSha tag），不同场景修正不同。

---

### 范例 4: 反馈/刚烈 effect.target — 防御/卖血类

**文件**：`character/standard.js:546, 667`
**字段**：`effect.target` (函数) + `maixie_defend` (bool)
```js
// 反馈
effect: {
  target(card, player, target) {
    if (player.countCards("he") > 1 && get.tag(card, "damage")) {
      if (player.hasSkillTag("jueqing", false, target)) return [1, -1.5];  // 绝情反而弱
      if (get.attitude(target, player) < 0) return [1, 1];  // 敌人打你 = 威慑+1
    }
  }
}

// 刚烈
effect: {
  target(card, player, target) {
    if (player.hasSkillTag("jueqing", false, target)) return [1, -1];
    return 0.8;  // 全局伤害×0.8
  }
}
```
**解决的问题**：AI 在评估是否打这些角色时，通过 effect.target 自动降低伤害牌的预期收益。反馈需要对方有牌可拿才生效，刚烈无条件但系数不同。
**为什么必须 function**：条件判断（手牌、绝情标签、敌我态度）。

---

### 范例 5: 黄盖苦肉 — 暴露度类

**文件**：`character/standard.js:300`
**字段**：`threaten` (数字) + `expose` (数字)
```js
ai: { threaten: 0.8, expose: 0.1 }
```
**解决的问题**：黄盖掉血后会过牌，所以威胁略低（0.8）。expose=0.1 表示苦肉使用会暴露身份。
**数字足够吗**：是。这两个值不依赖动态条件。
**但如果是动态威胁**（如屯田: bingshi.js:1194），就必须用 function。

---

### 范例 6: 诸葛连弩对 order 的简化影响

**文件**：`card/standard.js:366`（杀 order）+ `card/extra.js:144`（酒 order）
**字段**：`order` (函数，间接)
**模式**：杀的 order 中调用 `player.getUseValue(item, true)`，酒的 order 中检查 `player.hasCard(i => get.name(i, player) == "zhuge")`。
**解决的问题**：连弩在手时酒的价值提升（因为多张杀可用）、属性杀微调。
**为什么必须 function**：order 需要实时查询其他手牌和场上状态。

---

### 范例 7: 火攻 result.player — 出牌劝阻类

**文件**：`card/extra.js:384`
**字段**：`result.player` (函数)
```js
result: {
  player(player) {
    var nh = player.countCards("h");
    if (nh <= player.hp && nh <= 4 && _status.event.name == "chooseToUse") {
      if (_status.event.filterCard(vcard_huogong, player, _status.event)) return -10;
    }
    return 0;
  },
  target(player, target) {
    if (target.hasSkill("huogong2") || target.countCards("h") == 0) return 0;
    if (player.countCards("h") <= 1) return 0;
    return -1.15;
  }
}
```
**解决的问题**：手牌少时不建议主动火攻（因为火攻需要弃同花色手牌）。result.player 在 chooseToUse 场景下返回 -10 强烈劝阻。
**为什么必须 function**：需要检查手牌数量、技能状态、事件类型。

---

### 范例 8: 决斗 result.player — 双端博弈类

**文件**：`card/standard.js:2276`
**字段**：`result.player` (函数)
```js
result: {
  player(player, target, card) {
    if (player.hasSkillTag("directHit_ai", true, {target,card}, true)) return 0;
    if (get.damageEffect(target, player, target) >= 0) return 0;
    let pd = get.damageEffect(player, target, player),
        att = get.attitude(player, target);
    if (att > 0 && get.damageEffect(target, player, player) > pd) return 0;
    let ts = target.mayHaveSha(player, "respond", null, "count"),
        ps = player.mayHaveSha(player, "respond", player.getCards("h",...), "count");
    if (ts < 1 && ts * 8 < Math.pow(player.hp, 2)) return 0;
    if (att > 0) return ts < 1 ? 0 : -2;
    if (pd >= 0) return pd / get.attitude(player, player);
    if (ts - ps + Math.exp(0.8 - player.hp) < 1) return -ts;
    return -2 - ts;
  }
}
```
**解决的问题**：决斗是双端博弈——需要比较双方 mayHaveSha 数量、damageEffect、甚至敌我态度。对友方放决斗几乎总是负收益(-2)。
**为什么必须 function**：博弈结果取决于大量动态参数。

---

### 范例 9: 南蛮/万箭 wuxie — 全局溢出影响

**文件**：`card/standard.js:1384, 1772`
**字段**：`wuxie` (函数)
```js
wuxie(target, card, player, viewer, status) {
  // 判断当前目标能否出杀/闪
  if (canSha(target)) return 0;  // 目标能出 → 不无懈
  // 判断自己是否需要被救
  if (viewer.hp <= damage && !canSha(viewer)) return status;  // 自己危险 → 无懈
  // 遍历后续目标判断全局收益
  // ...
}
```
**解决的问题**：南蛮/万箭是多目标牌，无懈判断需要遍历所有后续目标、计算全局收益。不是看单单一个目标。
**为什么必须 function**：多目标场景、自身血量阈值、已知手牌等因素。

---

### 范例 10: 连环 effect + canLink — 属性传导类

**文件**：`card/standard.js:330`（canLink）+ `card/standard.js:389`（result.target 处理 isLink）
**字段**：`canLink` (函数) × `result.target` (函数)
**解决的问题**：属性杀在铁索上的传导不是自动的——canLink 返回 `{eff, odds, num}` 描述传导参数，result.target 在 isLink 分支中使用这些参数。
**为什么必须 function**：传导判断涉及好感度、酒、绝情、刚直、目标是否有闪。

---

## 四、编写建议总表

### 4.1 什么情况只用数字就够了？

| 场景 | 示例 | 理由 |
|------|------|------|
| 固定威胁系数 | `threaten: 0.8`（黄盖苦肉） | 无动态条件 |
| 固定暴露度 | `expose: 0.1` | 只能是数字 |
| 固定 order | `order: 5`（决斗） | 该牌优先级恒定 |
| 固定 useful（无变化条件） | `useful: [5,3,1]`（杀） | 仅按同名牌序号递减 |
| viewAs 技能的 value/useful | `value: -1, useful: -1`（赵云龙胆） | 技能不占牌 |
| 布尔响应标签 | `respondSha: true` | 简单 bool |

### 4.2 什么情况必须用 function？

| 场景 | 用哪个字段 | 为什么 |
|------|-----------|--------|
| 价值取决于血量/手牌/局势 | `value` → function | 如酒：高血 5 / 低血 7.3 |
| 留存优先级受技能影响 | `useful` → function | 如闪：卖血×0.57 / 仁王×0.8 |
| 出牌顺序需查场况 | `order` → function | 如属性杀铁索微调、连弩影响酒 |
| 收益涉及命中概率 | `result.target` → function | 如杀：odds -= mayHaveShan |
| 收益涉及双方博弈 | `result.player` / `result.target` → function | 如决斗：比较双方杀数量 |
| 对某些牌/目标有特殊修正 | `effect.player` / `effect.target` → function | 如反馈：仅伤害牌生效 |
| 仅在主动使用时修正 | `effect.player_use` / `effect.target_use` → function | 如仁德装备修正 |
| 根据手牌动态是否可用 | `skillTagFilter` → function | 如激将：无蜀将→false |
| 全局多目标判断 | `wuxie` → function | 如南蛮：遍历所有目标 |
| 身份伪装/态度改变 | `modAttitudeFrom/To` → function（运行时挂载） | 如僵尸事变 |

### 4.3 各字段适用场景速查

| 想实现的效果 | 推荐字段 | 说明 |
|-------------|----------|------|
| 我的牌比别人更值钱/更不值钱 | `value` | 影响弃牌、顺手、过拆选择 |
| 我不想弃某类牌 | `useful` | 影响弃牌优先级 |
| 我应该优先/延后出某牌 | `order` | 影响出牌顺序 |
| 某牌对特定目标效果不同 | `result.player` / `result.target` | 影响目标选择排序 |
| 打我的牌效果打折 | `effect.target`（防御技能） | 全局威慑 |
| 我打别人的牌效果增强 | `effect.player`（进攻技能） | 全局收益 |
| 只在主动出牌时生效 | `effect.player_use` / `effect.target_use` | 不影响被动评估 |
| 我能在没杀的时候"出杀" | `respondSha: true` + `skillTagFilter` | hasSha/hasSkillTag 匹配 |
| 我的身份不被 AI 看穿 | `expose` | 身份暴露概率（仅数字） |
| 别人评估我时态度不同 | `modAttitudeFrom/To`（运行时） | 极少用，需在 content 中挂载 |
| 某牌是否该被无懈 | `wuxie`（牌 AI） | 极少数牌需要 |
| 属性伤害是否传导 | `canLink`（牌 AI） | 仅杀需要 |

### 4.4 常见误区

1. **❌ "value 影响出牌"** — value 只看牌本身价值（对持有者），不等同于出牌收益。出牌收益 = `effect(target, card, player)`
2. **❌ "order 影响弃牌"** — order 只影响出牌阶段的选牌优先级。弃牌只看 useful。
3. **❌ "effect 函数返回负数表示伤害"** — effect 返回的是**修正乘数/加数**。真正的收益方向由 `result.player/target` 的符号决定。
4. **❌ "useful 值越大越优先弃"** — 相反。`unuseful = -useful`，值越大的牌越**不**愿意弃。
5. **❌ "skillTagFilter 返回 true 才有效"** — 注意是 `=== false` 才跳过。返回非 false 值（包括 undefined）照常生效。
6. **❌ "modAttitudeFrom/To 写在 skill.ai 中"** — 这两个不在 skill.ai 里，而是运行时挂在 player.ai 上。需要在技能 content/effect 中动态赋值。

### 4.5 性能注意事项

1. **effect 函数调用频率极高**：每次 `get.effect()` 都会遍历场上所有相关角色的所有技能。effect 函数应尽量轻量。
2. **CacheContext**：如果 AI 计算结果可复用，系统通过 CacheContext 自动缓存。复杂的 result/effect 计算会被缓存，但 function 本身的执行不会被跳过。
3. **`_status.event` 在 AI 函数中可靠**：所有 AI 函数都在事件上下文中被调用，`_status.event` 总是指向当前正在处理的事件。

---

## 附录：字段 → 源码调用位置映射表

| 字段 | 核心读取位置 | 次级读取（checkMod） | 使用范围 |
|------|-------------|---------------------|---------|
| `order` | get/index.js:6339 | game.checkMod("aiOrder") | chooseToUse 选牌 |
| `value` | get/index.js:6209 | game.checkMod("aiValue") | 全局牌价值判断 |
| `useful` | get/index.js:6152 | game.checkMod("aiUseful") | 弃牌 + 响应 |
| `result.player` | get/index.js:6407, 6644 | — | effect 计算 |
| `result.target` | get/index.js:6410, 6647 | — | effect 计算 |
| `result.player_use` | get/index.js:6407 | — | effect_use 计算 |
| `result.target_use` | get/index.js:6410 | — | effect_use 计算 |
| `effect.player` | get/index.js:6666 | — | effect 遍历 |
| `effect.target` | get/index.js:6708 | — | effect 遍历 |
| `effect.player_use` | get/index.js:6430 | — | effect_use 遍历 |
| `effect.target_use` | get/index.js:6482,6492 | — | effect_use 遍历 |
| `threaten` | get/index.js:6020, 6466 | — | effect 威胁修正 |
| `expose` | player.js:9437 | — | 身份暴露日志 |
| `wuxie` | standard.js:4439 | — | 无懈窗口 |
| `canLink` | get/index.js:6601 | — | effect 铁索传导 |
| `modAttitudeFrom/To` | get/index.js:6098-6102 | — | attitude 修正 |
| `skillTagFilter` | player.js:12813, 12842 | — | hasSkillTag |
| 响应标签(respondSha等) | player.js:12976, 12995 | — | mayHaveSha/Shan |
| `result`(整体function) | get/index.js:6353 | — | result 获取 |
