# 无名杀引擎濒死机制完整流程分析报告

## 调查范围

在 resources/app 目录下搜索关键词 dying, die, 濒死, dieBefore, dieBegin, dieEnd, dieAfter, isDying, canSave, save, changeHp, damage, hp，重点分析核心引擎文件：

- noname/library/element/content.js — 事件内容定义
- noname/library/element/player.js — 玩家类方法
- noname/library/element/gameEvent.js — 事件循环与触发器系统

---

## 1. 濒死的完整事件链：从 hp<=0 到死亡/获救

### 1.1 触发入口

**入口 A：damage（伤害）** — content.js 行 11328-11517，damage 事件为 7 步数组：
- 第 5 步（行 11406-11411）：调用 player.changeHp(-num) 扣减体力
- 第 6 步（行 11448-11451）：扣血后检查 player.hp <= 0 && player.isAlive() && !event.nodying，若成立则调用 player.dying(event)，并通过 return next.forResult() 等待濒死事件全部完成

**入口 B：loseHp（体力流失）** — content.js 行 11547-11567：
- 行 11562：player.changeHp(-num) 扣减体力
- 行 11563-11566：扣血后检查 player.hp <= 0 && !event.nodying，若成立则 player.dying(event)

### 1.2 核心防范：player.dying() 的重入保护

player.js 行 8747-8764：

dying(reason) 先检查 this.nodying || this.hp > 0 || this.isDying()，若已濒死则直接 return。

关键结论：若玩家已处于濒死状态（isDying() 为 true），再次调用 dying() 不会创建嵌套的濒死事件。

### 1.3 濒死事件内容（dying 事件三步骤，content.js 11658-11711）

| 步骤 | 行为 |
|------|------|
| Step 1 | forceDie=true；检查 isDying() 或 hp>0；unshift 入 _status.dying 并广播；触发 "dying" 钩子 |
| Step 2 | 若 hp>0 或 nodying：移除濒死列表并结束；否则：创建 _save 子事件，轮流询问玩家是否救援 |
| Step 3 | 从 _status.dying 移除玩家；若 hp<=0 且无 nodying：调用 player.die(event.reason) 进入死亡 |

### 1.4 救援流程（_save 子事件，content.js 15-101）

1. 确定起始玩家（优先：当前回合玩家 -> 伤害来源 -> 濒死玩家本人 -> game.me -> 第一个玩家）
2. 按座位顺序遍历所有未离场玩家
3. 对每个玩家调用 chooseToUse({ type: "dying", dying, ... }) 询问是否使用可救牌/技能
4. 若使用成功且 dying.hp > 0：trigger.untrigger() 终止濒死事件
5. 若未使用：移动到下一位玩家
6. 全体轮完无人救：退出外层循环，濒死进入 Step 3（死亡）

### 1.5 死亡事件（die 事件六步骤，content.js 11712-11900）

| 步骤 | 行为 |
|------|------|
| Step 0 | 标记 dead class，从 game.players 移除加入 game.dead，从 _status.dying 移除，动画，hp 归零 |
| Step 1 | 若 player.dieAfter 存在：调用之（扩展钩子） |
| Step 2 | callHook("checkDie")；触发 "die" 钩子 |
| Step 3 | 清除 marks/tempSkills/手牌装备；记录角色 |
| Step 4 | 若 player.dieAfter2 存在：调用之 |
| Step 5 | UI 处理（复活/观战/再战按钮等） |

---

## 2. dieBefore / dieBegin / dieEnd / dieAfter 各阶段触发时机

### 2.1 触发机制（gameEvent.js 事件循环 212-256）

每个 GameEvent 的标准生命周期：
_triggered === 0 -> trigger(name + "Before") -> _triggered = 1
_triggered === 1 -> trigger(name + "Begin")  -> _triggered = 2
[否则]           -> 执行 content()           -> content 内可 event.trigger("xxx")

content 完成后：
_triggered === 1 -> trigger(name + "Omitted") -> _triggered = 4 (content 未执行)
_triggered === 2 -> trigger(name + "End")     -> _triggered = 3
_triggered === 3 -> trigger(name + "After")   -> _triggered = 4

### 2.2 die 事件完整触发器时序

1. dieBefore    — 事件循环自动 (_triggered=0)
2. dieBegin     — 事件循环自动 (_triggered=1)
3-8. die 内容 Step 0-5 — content() 执行
8. "die"        — 内容 Step 2 显式触发（行 11779）
9. dieEnd       — 事件循环自动 (_triggered=2)
10. dieAfter    — 事件循环自动 (_triggered=3)

注意区分：
- event.trigger("die")（内容中）— 技能监听 "die" 的钩子
- dieAfter（事件循环自动）— 技能监听 "dieAfter" 的钩子
- player.dieAfter(source)（内容 Step 1）— 可选方法调用，非事件触发器

### 2.3 damage 事件的完整触发器时序及与濒死的关系

1. damageBefore        — 事件循环自动
2. damageBegin         — 事件循环自动
3-6. damageBegin1~4    — 内容步骤 1-4
7. changeHp + "damage" — 内容步骤 5
8. >>> 濒死事件链在此展开 <<<  — 内容步骤 6（await dying）
9. damageSource        — 内容步骤 7
10. damageEnd          — 事件循环自动
11. damageAfter        — 事件循环自动

---

## 3. 濒死期间 damage 和 loseHp 的事件插入规则

### 3.1 同玩家：濒死中额外伤害不会嵌套

保护：player.dying() 检查 isDying()，已濒死则 return

场景：玩家 A 在 damage->dying->_save 过程中又被造成额外伤害：
1. 嵌套 damage 正常执行（damageBegin1-4 -> changeHp -> "damage" 触发）
2. changeHp 使 hp 进一步降低
3. 嵌套 damage 的 Step 6 调用 player.dying(event)
4. player.dying() 检测 isDying() 为 true -> 直接 return
5. 嵌套 damage 正常走完 damageSource -> damageEnd -> damageAfter
6. 控制流回到 _save 继续救援

嵌套伤害不产生嵌套濒死，但伤害事件本身及所有子触发器均正常触发。

### 3.2 跨玩家：濒死中可以触发其他玩家的濒死

在 _save 过程中造成伤害导致另一玩家 hp<=0：该玩家 isDying() 为 false，正常创建其 dying 事件。

### 3.3 changeHp 中的濒死直接终止（content.js 11620-11633）

当 changeHp 使 hp>0：
1. 从 _status.dying 移除
2. getParent("_save") -> finish()
3. getParent("dying") -> finish()

直接终止 _save 和 dying 父事件，不等待 filterStop。

---

## 4. isDying() 方法的返回条件

player.js 行 12133-12134：

isDying() = _status.dying.includes(this) && this.hp <= 0 && this.isAlive()

三个条件：
1. _status.dying.includes(this) — 在濒死数组中
2. this.hp <= 0 — 体力 <= 0
3. this.isAlive() — 还活着

关键时序：
- dying Step 1 执行 _status.dying.unshift(player) 之后，isDying() 才返回 true
- dying Step 3 执行 _status.dying.remove(player) 之后，isDying() 返回 false
- changeHp 检测 hp>0 时也会提前移除

---

## 5. 濒死中 changeHp(+1) 回复体力后濒死如何结束

四重保险：

机制一：changeHp 直接 finish _save 和 dying 父事件（content.js 11625-11632）
机制二：_save 中每次救援后检查 hp>0 -> trigger.untrigger()（content.js 82-85）
机制三：dying 事件 filterStop 返回 true 跳过触发（player.js 11758-11763）
机制四：dying Step 2 显式检查 hp>0 -> finish()（content.js 11674-11679）

实际流程（桃 -> recover -> changeHp(+1)）：
1. changeHp 将 hp 0->1
2. 从 dying 列表移除
3. getParent("_save")->finish()
4. getParent("dying")->finish()
5. 返回 damage 事件 -> damageSource -> damageEnd -> damageAfter

---

## 6. 濒死与 damageEnd / loseHpEnd 的顺序关系

关键发现：濒死事件嵌入在 damage/loseHp 事件内部

damage 时间线（致死伤害）：
damageBefore -> damageBegin -> Begin1~4 -> changeHp(-N) -> trigger("damage")
  -> [dyingBefore -> dyingBegin -> "dying" -> _save -> dieBefore -> dieBegin -> die -> dieEnd -> dieAfter -> dyingEnd -> dyingAfter]
  -> damageSource -> damageEnd -> damageAfter

damageEnd/damageAfter 的触发晚于 dieEnd/dieAfter。

对于技能开发者：
- 监听 damageAfter/damageEnd 时目标可能已死亡
- 监听 dieAfter 是在目标死亡后触发
- 监听 dying 是在濒死声明时触发（尚未死亡）

---

## 证据来源

| 文件 | 行号 | 内容 |
|------|------|------|
| noname/library/element/content.js | 11328-11517 | damage 事件 7 步数组 |
| noname/library/element/content.js | 11547-11567 | loseHp 事件 |
| noname/library/element/content.js | 11599-11634 | changeHp 事件（含濒死终止逻辑） |
| noname/library/element/content.js | 11658-11711 | dying 事件 3 步数组 |
| noname/library/element/content.js | 11712-11900 | die 事件 6 步数组 |
| noname/library/element/content.js | 15-101 | _save 救援流程 |
| noname/library/element/player.js | 8747-8764 | player.dying() 方法 |
| noname/library/element/player.js | 12133-12134 | isDying() 方法 |
| noname/library/element/player.js | 2391-2406 | canSave() 方法 |
| noname/library/element/gameEvent.js | 212-256 | 事件循环核心 |
| noname/library/element/gameEvent.js | 419-594 | trigger() 方法 |

## 未决项与推断

1. player.dieAfter / player.dieAfter2 方法：核心引擎未定义体，仅以 if (player.dieAfter) 形式调用，推断为扩展/角色动态注入的可选钩子
2. _status.dying 数组并发：使用 unshift 添加、remove 移除，LIFO 顺序
3. 护甲（hujia）交互：changeHp 行 11602-11606 处理护甲抵扣，在 hp 实际变化之前，不影响濒死判断
4. unreal/notrigger/nodying 标记可跳过部分流程
