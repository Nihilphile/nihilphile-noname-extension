# 无名杀 AI 决策逻辑工程侦察报告

> 时间：2026-06-27
> 任务：为"四血白板行为模型"做工程调研
> 原则：只读源码，不改代码，不做大而空的重构建议

---

## 一、AI 主链路调用图

```
phaseLoop (game/index.js:7486)
 │
 ├─ phaseUse (content.js:4348)  ─── 出牌阶段
 │    │
 │    ├─ 重置技能/牌使用次数（stat.skill/stat.card）
 │    ├─ trigger("phaseUseBefore") / trigger("phaseUseBegin")
 │    │
 │    └─ player.chooseToUse() ─── 核心入口 (content.js:4390)
 │         │  .set("type", "phase")
 │         │  ai1 = get.cacheOrder     ← 默认：用牌排序函数
 │         │  ai2 = get.cacheEffectUse ← 默认：用牌收益评估函数
 │         │
 │         └─ chooseToUse content (content.js:4443)
 │              │
 │              ├─ Step 1: 准备阶段 (content.js:4444)
 │              │   ├─ 调用所有技能的 onChooseToUse 钩子
 │              │   ├─ 非玩家控制 → 暂停/发往线上
 │              │   └─ AI 控制 → event.result = "ai" (content.js:4558)
 │              │
 │              ├─ Step 2: AI 决策核心 (content.js:4561-4608)
 │              │   │
 │              │   ├─ ① ai.basic.chooseCard(event.ai1)    ← 选牌
 │              │   │     │  调用 get.selectableCards() 枚举所有可用牌
 │              │   │     │  逐个调用 check(card) = get.cacheOrder(card)
 │              │   │     │  选出 check 值最高的牌
 │              │   │     │  若最高值 ≤0 → 取消（停止出牌）
 │              │   │     └─ 返回 false → ui.click.cancel()
 │              │   │
 │              │   ├─ ② ai.basic.chooseTarget(event.ai2)  ← 选目标
 │              │   │     │  调用 get.selectableTargets() 枚举可选目标
 │              │   │     │  逐个 check(target) = get.cacheEffectUse(target, selectedCard)
 │              │   │     │  选出 check 值最高的目标
 │              │   │     │  若最高值 ≤0 → 取消当前牌，重新选牌
 │              │   │     └─ 返回 false → 退选当前牌 / 换牌重试
 │              │   │
 │              │   └─ ③ ui.click.ok()  ← 确认出牌
 │              │        回到 ① 循环，直到 chooseCard 返回 false
 │              │
 │              └─ Step 3: 技能二级对话框 (chooseButton)
 │
 ├─ phaseDiscard (content.js:4415) ─── 弃牌阶段
 │    │
 │    └─ player.chooseToDiscard(num, true) (content.js:4433)
 │         │  .ai = get.unuseful   ← 默认：-get.useful(card)
 │         │
 │         └─ chooseToDiscard content (content.js:5225)
 │              │  ai.basic.chooseCard(event.ai)
 │              │  选出 unuseful 值最高（即 useful 最低）的牌
 │              └─ 循环直到满足弃牌数量
 │
 └─ phaseJieshu (略)
```

### 自主出牌结束的判定机制

AI 在 `chooseToUse` 的 Step 2 中执行 `ai.basic.chooseCard(event.ai1)`：
1. 调用 `get.selectableCards()` 获取所有当前可用的牌（含技能转化牌）
2. 对每张可选牌调用 `check(card) = get.cacheOrder(card)`
3. 选 check 值最大的牌
4. **若最大 check 值 ≤ 0** → `chooseCard` 返回 false → `ui.click.cancel()` → **出牌阶段结束**
5. **若最大 check 值 > 0** → 选中该牌 → 进入目标选择

即：**order 函数返回值 ≤ 0 时，AI 认为不应主动出该牌。**

---

## 二、核心函数索引表

### 2.1 get.value(card, player, method)
- **文件**：`noname/get/index.js:6181`
- **输入**：
  - card: Card / vcard / {name} — 要评估的牌
  - player: Player — 持牌者（默认 _status.event.player）
  - method: "raw" — 取原始值（第一张的值），否则按同名牌序号取
- **输出**：number — 牌对持有者的**基础固有价值**
- **职责**：评估牌本身的优劣（不考虑具体目标）
- **流程**：
  1. 若 `card._modValue` 存在 → 调用（技能重写）
  2. 读牌定义的 `card.ai.value` 或 `card.ai.basic.value`
  3. 若为函数 → `value(card, player, geti(), method)` 其中 geti() = 同名牌序号
  4. 若为数组 → `value[Math.max(0, geti())]` 或 `value[last]`
  5. 若为数字 → 直接返回
  6. 最终 `game.checkMod(player, card, result, "aiValue")` 做技能修正

### 2.2 get.useful(card, player)
- **文件**：`noname/get/index.js:6163` → 调用 `useful_raw(card, player):6111`
- **输入**：card, player
- **输出**：number — 牌的**留存有用度**（越高越不愿弃置）
- **职责**：决定弃牌优先级、并影响响应时的保留判断
- **流程**：
  1. 判定区牌（position=="j"）→ 返回 -1
  2. 装备区牌（position=="e"）→ `get.equipValue(card)`
  3. 有 `_modUseful` → 调用之
  4. 读 `card.ai.useful` 或 `card.ai.basic.useful`
  5. 计算同名牌序号 `i = player.getCards("h", card.name).indexOf(card)`
  6. 若为函数 → `useful(card, i)`；数组 → `useful[i]`；数字 → 直接
  7. `game.checkMod(player, card, result, "aiUseful")` 修正

### 2.3 get.order(item, player)
- **文件**：`noname/get/index.js:6322`
- **输入**：item (Card/vcard/name), player
- **输出**：number — **出牌优先级**（≤0 = 不应主动使用）
- **职责**：决定出牌阶段"先出哪个牌"以及"是否出牌"
- **流程**：
  1. 读 `card.ai.order` 或 `card.ai.basic.order`
  2. 若为函数 → `order(item, player)`
  3. `game.checkMod(player, item, num, "aiOrder")` 修正

### 2.4 get.effect(target, card, player, player2, isLink)
- **文件**：`noname/get/index.js:6621`
- **输入**：
  - target: Player — 目标玩家
  - card: Card/name — 使用的牌
  - player: Player — 牌的使用者
  - player2: Player — 评估视角（默认 = player）
  - isLink: object — 铁索传递标记
- **输出**：number — 从 player2 视角看，牌对 target 的**净收益**
- **职责**：评估牌/技能对单个目标的综合效果
- **计算核心**（line 6803-6807）：
  ```js
  final = result1 * attitude(player2, player)    // player端收益
        + result2 * attitude(player2, target);   // target端收益（含威胁修正）
  ```
- **result2 修正因子**（line 6755-6788）：
  - 对敌人：result2 *= sqrt(threaten)
  - 对友方：result2 *= sqrt(sqrt(threaten))
  - hp=1 → ×3；hp=2 → ×1.8
  - target手牌=0 → ×2.1(杀/闪)/×1.5
  - target手牌=1 → ×1.3；手牌=2 → ×1.1；手牌>3 → ×0.5
  - hp=4 → ×0.9；hp=5 → ×0.8；hp>5 → ×0.6

### 2.5 get.effect_use(target, card, player, player2, isLink)
- **文件**：`noname/get/index.js:6374`
- **与 effect 的关键区别**：
  - effect_use 使用 `result.player_use` / `result.target_use`（主动使用专用）
  - effect 使用 `result.player` / `result.target`（通用视角）
  - effect_use 额外遍历 player/target 技能的 `effect.player_use` / `effect.target_use`
  - 其余计算逻辑一致
  - effect_use 中 `result2` 在 hp=1 时 ×2.5（vs effect 的 ×3）

### 2.6 get.attitude(from, to)
- **文件**：`noname/get/index.js:6079`
- **输入**：from: Player, to: Player
- **输出**：number（正=友方，负=敌方，0=中立）
- **职责**：判断 from 对 to 的**阵营态度**
- **流程**：
  1. `from._trueMe` 校正
  2. 调用底层 `RawAttitude(from, to)`（各模式定义，如 `mode/identity.js:3581`）
  3. from 混乱 → att = -att
  4. to 混乱且 att>0 → 主公=1，其他=0
  5. 技能修改：`from.ai.modAttitudeFrom(from,to,att)` → `to.ai.modAttitudeTo(from,to,att)`

### 2.7 get.threaten(target, player)
- **文件**：`noname/get/index.js:6011`
- **输入**：target, player
- **输出**：number（≥1）
- **职责**：评估目标的**威胁程度**
- **流程**：
  1. 遍历 target 所有技能，乘上各技能的 `ai.threaten` 值
  2. 若 hp=true：hp=0→×1.5；hp=1→×1.2
  3. 若 hp=true：手牌=0→×1.5；手牌=1→×1.2

### 2.8 get.result(card, skill)
- **文件**：`noname/get/index.js:6347`
- **输入**：card/name, skill(可选叠加)
- **输出**：`{ player, target, player_use, target_use }` — 基础收益预设值

### 2.9 其他辅助函数

| 函数 | 文件:行号 | 作用 |
|------|-----------|------|
| `get.damageEffect(target, player, viewer, nature)` | get/index.js:6836 | 伤害收益评估 |
| `get.recoverEffect(target, player, viewer)` | get/index.js:6872 | 回复收益评估 |
| `get.equipValue(card, player)` | get/index.js:6254 | 装备价值评估 |
| `get.unuseful(card)` = `-get.useful(card)` | get/index.js:6169 | 弃牌 AI 默认函数 |
| `get.unuseful2(card)` = `10 - get.useful(card)` | get/index.js:6172 | 响应 AI 默认函数 |
| `get.unuseful3(card)` | get/index.js:6175 | 毒=20，其他同 unuseful2 |
| `get.sgnAttitude(...)` | get/index.js:6108 | attitude 的 sign 版本 |
| `get.skillthreaten(skill, player, target)` | get/index.js:6297 | 单技能威胁评估 |
| `player.getUseValue(card)` | player.js:10217 | 牌的最佳可能收益（枚举所有目标） |

---

## 三、基础牌 AI 表

### 牌 AI 定义位置 + 关键数据

| 牌名 | 文件:行号 | order | value | useful | result.player | result.target | 特殊逻辑 |
|------|-----------|-------|-------|--------|---------------|---------------|----------|
| **杀** sha | standard.js:275 | 3.2 (函数) | [5,3,1] | [5,3,1] | (函数) | (函数) -1.5×odds | result.target 通过 mayHaveShan 概率修正 odds；考虑酒(+2伤)、铁索传导 |
| **闪** shan | standard.js:542 | 3 | [7,5.1,2] | (函数) ≈[7,5.1,2]±卖血修正 | 1 | — | 卖血标签→useful×0.57；仁王盾/freeShan→useful×0.8 |
| **桃** tao | standard.js:582 | 2 (函数) | (函数) | (函数) | — | — | pretao→order=9；useful 遍历友方 hp≤2: needs(1血)=5分, damaged(2血)=3分 |
| **酒** jiu | extra.js:117 | (函数) | (函数) | (函数) | — | (函数) | order: 无杀或杀已用完→0，否则杀的order+0.2；濒死→9；result.target 遍历手牌中杀的最优目标 |
| **无中** wuzhong | standard.js:2101 | 7 | (函数) 9.2-0.7×手牌 | 4.5 | — | 2 | value: hp>2→9.2 否则递减 |
| **顺手** shunshou | standard.js:2401 | 7.5 | (函数) 0.53×maxEffect | 8/(3+i) | — | (函数) | 专有 button AI: 评估每张可获牌的价值×态度方向；延时牌特判(乐翻倍,闪电/釜底抽薪/2) |
| **过拆** guohe | standard.js:2732 | 9 | (函数) 0.42×maxEffect | 10/(3+i) | — | (函数) 复杂 | 专有 button AI: 敌友不同逻辑；敌方评估剩余牌量×优先级；友方优先拆判定区负面牌 |
| **决斗** juedou | standard.js:2261 | 5 | 5.5 | 1 | (函数) | (函数) | result 双方比较: mayHaveSha数量 × damageEffect × 血量 |
| **南蛮** nanman | standard.js:1383 | 7.2 | 5 | [5,1] | (函数) | (函数) | result.player: 考虑已知杀、未知手牌; result.target: 无杀→-99(1血主)/-2；有杀→-1.2 |
| **万箭** wanjian | standard.js:1771 | 7.2 | 5 | 1 | (函数) | (函数) | 逻辑同南蛮但评估闪 |
| **桃园** taoyuan | standard.js:1275 | 10 (函数) | 0 | [3,1] | — | 2 (满血=0) | order: 有1血敌人且对ta恢复负收益→1，否则10（极优先） |
| **五谷** wugu | standard.js:1225 | 3 | — | 0.5 | — | (函数) | result.target 基于座位距离计算得分 (6+0.75×(人数-2×距离))/6; 有未知≥2→0 |
| **无懈** wuxie | standard.js:3144 | — | [6,4,3] | [6,4,3] | 1 | — | 无 order（被动），各牌有 wuxie() 特殊函数判断是否打无懈 |
| **火攻** huogong | extra.js:367 | 9.2 | [3,1] | 0.6 | 0 (函数) | -1.15 (函数) | result.player: 手牌≤hp且≤4→-10(劝阻用火攻)；result.target: 已知手牌无同花色→0 |
| **铁索** tiesuo | extra.js:461 | 7.3 | 4 | 1.2 | — | (函数) | result.target 复杂: 考虑敌友数量、属性免伤标签、藤甲；敌<2且不全已锁→可能返回0 |
| **借刀** jiedao | standard.js:3064 | 8 | 2 | 1 | (函数) | (函数) | result.player: 获得武器价值×态度修正；result.target: 模拟目标出杀的最优收益 |
| **乐** lebu | standard.js:3238 | 1 | 8 | (函数) | — | (函数) | order=1最低，优先出；result.target 基于需弃牌数×威胁²/距离 |
| **闪电** shandian | standard.js:3286 | — | — | — | — | — | 详见源码 |

### 装备牌 AI 概览

| 装备 | standard.js 行号 | equipValue | 备注 |
|------|-----------------|------------|------|
| 八卦阵 bagua | 802 | 7.5 | |
| 诸葛连弩 zhuge | 867 | 见源码 | |
| 武器类（寒冰、雌雄等） | 913+ | 各有值 | subtype: equip1 |
| 防御马（+1） | 918 | 有 equipValue | subtype: equip3 |
| 进攻马（-1） | 931 | 有 equipValue | subtype: equip4 |
| 仁王盾 renwang | 944 | 见源码 | subtype: equip2 |

装备的 `ai.basic.equipValue` 参与 `get.equipValue()` 计算（get/index.js:6254），用于决定是否替换已有装备。

### 牌 order 排序总览（出牌优先级从高到低）

```
乐不思蜀:   1.0  (最低，优先出)
桃:         2.0
闪:         3.0
五谷:       3.0
杀:         3.2
决斗:       5.0
无中:       7.0
南蛮:       7.2
万箭:       7.2
铁索:       7.3
顺手:       7.5
借刀:       8.0
过拆:       9.0
火攻:       9.2
桃园:      10.0  (最高，优先出)
```

---

## 四、响应逻辑

### 4.1 被杀出闪（respondShan）

**入口**：杀 content（standard.js:146 step 1）
```js
next = target.chooseToUse("请使用一张闪响应杀")
next.set("type", "respondShan")
next.set("filterCard", 只接受"shan")
next.set("ai1", function(card) {
  if (get.event().toUse) return get.order(card);  // order(闪)=3
  return 0;  // toUse=false 不出
})
```

**toUse 决策逻辑**（standard.js:167-210，关键判断链）：
1. `noShan` 标签 → false
2. `useShan` 标签 → true
3. 目标在铁索上 + 有队友也铁索 + 目标对你态度>0 → false（不闪让传导）
4. 伤害≤0 且非冰杀 → false
5. `damageEffect(target, player, target) >= 0` → false（伤害正收益不闪）
6. 伤害 ≥ hp + 护甲 → true（必死必须闪）
7. 需多张闪但 `mayHaveShan("count") < required` → false
8. 否则 → true

**闪的选择**：`ai1 = get.order(card)` → order(闪)=3；如果 toUse=false → 0（不出）。

### 4.2 南蛮出杀

**入口**：nanman content（standard.js:1319-1372）
```js
next = target.chooseToRespond()
next.set("filterCard", 只接受"sha")
next.set("ai", function(card) {
  if (get.event().toRespond) return get.order(card);  // order(杀)=3.2
  return -1;  // toRespond=false 不出
})
```

**toRespond 决策逻辑**（standard.js:1337-1369）：
- 同 toUse 逻辑，考虑 noSha/useSha/伤害阈值/mayHaveSha

### 4.3 万箭出闪

**入口**：wanjian content（standard.js:1710-1758）
- 与南蛮结构完全相同，但过滤"shan"，使用 mayHaveShan

### 4.4 决斗出杀

**入口**：juedou content（standard.js:2173-2188）
- 结构同上，过滤"sha"，使用 mayHaveSha("respond")

### 4.5 濒死桃酒

**入口**：桃有 `savable: true`（standard.js:571），酒有 `tag.save: 1`（extra.js:246）
- 桃 useful 函数（standard.js:590-626）：遍历友方低血量玩家计算需求度
- 酒 useful 函数（extra.js:119-130）：濒死场景首张7.3/非首张3；非濒死首张4/非首张1
- 具体救人由 `lib.filter.cardSavable` 判定

### 4.6 无懈响应

**流程**：
1. 各牌定义 `ai.wuxie(target, card, player, viewer, status)` 函数
2. 系统弹出 `type="wuxie"` 的无懈窗口
3. AI 通过 wuxie 函数返回非0值决定是否无懈
4. 无懈自身无 order（被动牌），有 basic useful/value

**各牌 wuxie 判断逻辑摘要**：

| 牌 | wuxie 主要逻辑 |
|----|---------------|
| 无中 | 国战非大国+手牌多→不无懈 |
| 顺手 | 目标无牌或友方→不无懈 |
| 过拆 | hp>2 且无高价值装备 且手牌多→不无懈 |
| 决斗 | 自己或友方是使用者→不无懈 |
| 南蛮/万箭 | 目标有杀/闪→不无懈；自己危险且无力响应→无懈 |
| 火攻 | 友方使用者→不无懈；伤害方向对+手牌少→无懈 |
| 铁索 | 目标无属性伤害威胁→不无懈 |
| 桃园 | 依态度和时机 |
| 借刀 | 自己/友方是使用者→不无懈 |

### 4.7 响应时是否考虑保留价值？

| 响应类型 | AI 函数 | 保留价值考虑 |
|----------|---------|------------|
| 被杀出闪 | `ai1 = get.order(card)` 或 0 | ❌ 仅用 order(闪)=3 排序，不比较 useful；但 toUse 决定是否出 |
| 南蛮/万箭/决斗 | `ai = get.order(card)` 或 -1 | ❌ 同上 |
| 濒死桃酒 | 取决于 useful 函数 | ✅ useful 内置了血量/队友判断 |
| 无懈 | wuxie() 专用函数 | ✅ 各牌 wuxie 函数综合考虑多维度 |

---

## 五、弃牌逻辑

### 5.1 启动链路

```
phaseDiscard (content.js:4415)
  → player.needsToDiscard()  = max(0, cards("h").length - hp)
  → player.chooseToDiscard(num, true)
    .set("useCache", true)
    .set("allowChooseAll", true)
  → chooseToDiscard content (content.js:5225)
    → ai.basic.chooseCard(event.ai)
```

### 5.2 AI 函数默认值

```js
// player.js:5628
if (next.ai == void 0) {
  next.ai = get.unuseful;  // = -get.useful(card)
}
```

### 5.3 弃置优先级计算

```
ai.basic.chooseCard(event.ai)
  → 枚举所有可选牌，每张调用 get.unuseful(card)
  → 按 unuseful 从高到低排序（即 useful 从低到高）
  → 选中 unuseful 最高的一张 → 循环直到数量满足
```

**实际效果**：useful 最低的牌最先被扔。

### 5.4 useful 值速查表（"留存价值"→"弃牌顺序"）

| 牌 | useful 值 | 弃牌优先级 |
|----|----------|-----------|
| 五谷 | 0.5 | 🔴 最优先弃 |
| 火攻 | 0.6 | 🔴 |
| 决斗 | 1 | 🟠 |
| 借刀 | 1 | 🟠 |
| 万箭 | 1 | 🟠 |
| 铁索 | 1.2 | 🟠 |
| 顺手 #1 | 8/(3+0)=2.7 | 🟡 |
| 桃园 | 3 | 🟡 |
| 过拆 #1 | 10/(3+0)=3.3 | 🟡 |
| 闪 #3+ | 2 | 🟡 |
| 无懈 #3+ | 3 | 🟡 |
| 酒(非濒死#2+) | 1 | 🟠 |
| 酒(非濒死#1) | 4 | 🟡 |
| 杀 #3+ | 1 | 🟠 |
| 杀 #2 | 3 | 🟡 |
| 杀 #1 | 5 | 🟢 |
| 无懈 #1 | 6 | 🟢 |
| 闪 #1 | 7 | 🟢 最后弃 |
| 桃(有队友需求) | 5~8 | 🟢 |
| 桃(无用) | 1~3 | 🟠🟡 |

### 5.5 弃牌考虑维度总结

| 维度 | 是否考虑 | 如何体现 |
|------|----------|----------|
| 牌固有价值 | ✅ | 复用 `get.useful`（即 `get.value` 的变体） |
| 同名多张递减 | ✅ | useful 通过 index 参数区分第几张 |
| 血量 | ✅ | 桃/酒的 useful 函数内部判断 hp |
| 防御需求 | ✅ | 闪 useful 很高，确保保留 |
| 队友需求 | ✅ | 桃 useful 遍历友方低血量 |
| 装备价值 | ✅ | `get.equipValue` 映射装备 useful |
| 丢牌后的 effect | ❌ | 不重新评估"丢了会怎样" |

---

## 六、技能 AI 接入方式

### 6.1 技能添加主动可用动作

技能通过 `lib.skill[name].ai` 协议接入 AI 系统：

**a) viewAs 类技能（主动使用）**
```js
// 技能定义
skill: {
  enable: "phaseUse",
  viewAs: { name: "sha" },
  ai: {
    order: 3.2,           // 出牌优先级
    value: 5,             // 转化牌的价值
    useful: 5,            // 留存价值
    result: { player: ..., target: ... },
    threaten: 1.5,        // 威胁修正
  }
}
```

**b) 触发/修改类技能**
```js
ai: {
  threaten: 0.8,          // 持有该技能者的威胁系数修正
  expose: 0.1,            // 身份暴露概率
  effect: {               // 修改 effect 计算结果
    player(card, player, target, current, isLink) { ... },
    target(card, player, target, current, isLink) { ... },
    player_use(card, player, target, ...) { ... }, // chooseToUse 专用
    target_use(card, player, target, ...) { ... },
  },
  canLink(player, target, card) { ... },  // 铁索传导判断
  wuxie(target, card, player, viewer, status) { ... }, // 无懈判断
  modAttitudeFrom(from, to, att) { ... }, // 修改态度
  modAttitudeTo(from, to, att) { ... },
}
```

### 6.2 技能如何修改各维度

| 修改维度 | 接入机制 | 代码位置 |
|----------|----------|----------|
| 牌价值 | `skill.ai.value` 或 `card._modValue()` | get/index.js:6194-6195 |
| 用牌收益 | `skill.ai.effect.player / player_use` | get/index.js:6429-6434, 6665-6669 |
| 目标收益 | `skill.ai.effect.target / target_use` | get/index.js:6470-6505, 6708-6721 |
| 出牌顺序 | `skill.ai.order` 或 `checkMod("aiOrder")` | get/index.js:6330-6344 |
| 弃牌策略 | `skill.ai.useful` 或 `checkMod("aiUseful")` | get/index.js:6118-6160 |
| 敌我态度 | `player.ai.modAttitudeFrom/To` | get/index.js:6098-6103 |
| 威胁系数 | `skill.ai.threaten` (number/function) | get/index.js:6019-6027, 6465-6533 |
| 无懈判断 | `skill.ai.wuxie` | 各牌 wuxie 调用 |
| 铁索传导 | `skill.ai.canLink` | get/index.js:6591-6613 |

**effect 函数返回值规范**：
- `number` → result *= number
- `[mult, add]` → result = result * mult + add
- `[mult1, add1, mult2, add2]` → player端用前两个 + target端追加后两个
- `"zeroplayer"` → result.player = 0
- `"zerotarget"` → result.target = 0

### 6.3 技能 AI 代码分布

```
三类文件：
├─ ① 角色包技能文件（通常写在这里）
│   character/standard.js     → 标准包
│   character/extra.js        → 风林火山
│   character/sp/skill.js     → SP包
│   character/mobile/skill.js → 手杀包
│   extension/xxx/skill.js    → 扩展包
│
├─ ② 牌定义文件
│   card/standard.js → 标准牌AI（杀闪桃等）
│   card/extra.js    → 军争牌AI（火攻铁索等）
│
└─ ③ 全局引擎文件（不改动）
    noname/ai/index.js + basic.js
    noname/get/index.js
    noname/library/element/player.js + content.js
```

---

## 七、对四血白板行为模型设计的建议

### 7.1 白板可忽略的维度

四血白板 = 无技能角色。因此以下系统组件可完全忽略：

| 可忽略的组件 | 理由 |
|-------------|------|
| `game.checkMod(..., "aiXxx")` | 白板无技能，不会被 mod |
| `card._modValue / _modUseful` | 白板无技能修改 |
| `skill.ai.effect.*` | 无技能，effect 不做额外修正 |
| `skill.ai.threaten` | 威胁系数统一=1.0 |
| `player.ai.modAttitudeFrom/To` | 态度不做修正 |
| `hasSkillTag(...)` | 返回 false 或默认 |
| `CacheContext` 缓存 | 白板场景简单，可跳过缓存层 |

### 7.2 需要保留的核心 6 维度

| 维度 | 对应函数 | 白板实现思路 |
|------|----------|------------|
| **牌价值** | value | 直接复用各牌的 `ai.basic.value` 数据 |
| **留存优先级** | useful | 直接复用各牌的 `ai.basic.useful` 数据 |
| **出牌优先级** | order | 直接复用各牌的 `ai.basic.order` 数据 |
| **目标收益** | effect | 简化版：`result.player + result.target × attitude` |
| **敌我态度** | attitude | 取最简身份模式（identity.js）的 rawAttitude 逻辑 |
| **威胁系数** | threaten | 白板固定=1.0，跳过技能遍历 |

### 7.3 白板出牌决策算法（伪代码）

```
function 白板出牌决策(手牌, 血量, 所有玩家, 身份) {
  phaseUsable = 手牌.filter(canUseInPhase);
  if (phaseUsable.length === 0) return "不出牌";

  候选列表 = [];
  for each card in phaseUsable:
    order = getOrder(card);
    if (order <= 0) continue;  // 不应主动出
    
    可选目标 = filterTargets(card, 所有玩家);
    for each target in 可选目标:
      score = getEffect_simple(target, card, 自己, 身份);
      候选列表.push({card, target, score});
  
  候选列表.sort(by score desc);
  if (候选列表[0].score > 0):
    return 候选列表[0];  // card, target
  else:
    return "不出牌";
}
```

### 7.4 白板弃牌决策算法（伪代码）

```
function 白板弃牌决策(手牌, 体力上限) {
  需弃数 = max(0, 手牌.length - 体力上限);
  if (需弃数 === 0) return [];

  评分列表 = 手牌.map(card => ({
    card,
    discardScore: getUnuseful(card)  // = -getUseful(card)
  }));
  评分列表.sort(by discardScore desc); // 分数越高越先弃
  return 评分列表.slice(0, 需弃数).map(c => c.card);
}
```

### 7.5 白板响应决策算法（伪代码）

```
function 白板响应决策(响应类型, 伤害量, 血量):
  // toRespond 判断（无技能标签，最简逻辑）
  shouldRespond = (
    伤害量 > 0 AND
    伤害量 < 血量 + 护甲 AND
    damageEffect(自己) < 0  // 受伤是坏事
  );
  
  if not shouldRespond: return "不响应";
  
  // 选牌：按 order 排序同名牌
  candidates = 手牌.filter(matches 响应类型);
  candidates.sort(by order desc);
  return candidates[0]; // order 最高的牌
```

### 7.6 建议的直接复用数据

| 数据 | 来源文件 | 说明 |
|------|----------|------|
| 各牌 order | `card/standard.js`, `card/extra.js` | 出牌优先级数字 |
| 各牌 value | 同上 | 牌固有价值（数字/数组/函数） |
| 各牌 useful | 同上 | 留存优先级（数字/数组/函数） |
| 各牌 result | 同上 | `{player, target, player_use, target_use}` |
| 各牌 tag | 同上 | 伤害/回复/响应标签 |
| 身份态度逻辑 | `mode/identity.js:3581` | rawAttitude（可摘抄简化版） |
| 距离计算 | `player.inRange()` | 攻击范围判断 |

### 7.7 需要白板自行简化的部分

| 原系统组件 | 白板简化方案 |
|-----------|-------------|
| `get.effect` 的技能遍历（遍历 player/target 技能） | 跳过，白板无技能 |
| `get.attitude` 的技能修正（modAttitudeFrom/To） | 跳过 |
| `get.threaten` 的技能威胁累积 | 固定返回 1.0 |
| `game.checkMod` 链 | 直接返回原值 |
| `CacheContext` 缓存层 | 可选：直接计算不缓存 |
| `ai.wuxie` 专项判断 | 按默认规则：敌方的负面牌才无懈 |
| `yingbian`（应变） | 白板不使用应变机制 |
| 铁索传导（natureDamage + isLinked） | 可暂不实现，白板场景简化为单体伤害 |

### 7.8 关键注意事项

1. **order 是"是否出牌"的第一道闸**：order≤0 直接跳过，不需要算 effect。
2. **effect 结果的正负号方向**：
   - 对敌人使用伤害牌 → result.target 应为**负** × 负 attitude = **正** final
   - 使用无中 → result.player 应为**正** × 正 attitude = **正** final
3. **弃牌只看 useful，不看 effect**：不需要在弃牌时重新模拟"丢了会影响后续出牌吗"。
4. **useful 的 index 参数很重要**：同名第1张和第3张的值差距大（如杀: 5→3→1）。
5. **闪的高 useful（7→5.1→2）确保了防御保留**，白板不用额外写防御逻辑。

---

## 附录：关键文件清单

| 文件路径（相对于 `resources/app`） | 核心内容 | 行数 |
|-----------------------------------|----------|------|
| `noname/ai/index.js` | AI 主类、CacheKey、guessTargetPoints | 111 |
| `noname/ai/basic.js` | Basic.chooseCard/chooseTarget/chooseButton | 237 |
| `noname/get/index.js` | value, useful, order, effect, effect_use, attitude, threaten, result 等全评分函数 | 7287 |
| `noname/library/element/player.js` | chooseToUse, chooseToRespond, chooseToDiscard, getUseValue | ~16000 |
| `noname/library/element/content.js` | phaseUse, phaseDiscard, chooseToUse/chooseToRespond/chooseToDiscard 内容函数, useCard | ~10500 |
| `noname/game/index.js` | phaseLoop, checkMod | 10274 |
| `card/standard.js` | 杀闪桃 无中 顺手 过拆 决斗 南蛮 万箭 桃园 五谷 无懈 借刀 乐 闪电 + 装备 AI | 5339 |
| `card/extra.js` | 酒 火攻 铁索 兵粮 AI | ~2000 |
| `mode/identity.js` | rawAttitude（身份模式敌我判断） | ~9000 |
| `noname/library/index.js` | autoRespondSha/Shan, filter 系列 | ~12000 |
