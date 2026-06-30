# 探索报告：无名杀引擎「复制卡牌并强制使用」机制

## 调查问题

1. 如何创建一张与某牌"同名同属性"的虚拟卡(card copy / 印卡)
2. 如何让这张牌立即对目标使用(trigger useCard 或手动创建 useCard 事件)
3. "不可响应"(不能出闪/无懈)的实现方法 — directHit? customArgs?
4. "无法无效"的实现 — 让无懈不可选目标或 nowuxie 标记
5. 强制性一张牌的完整范例(如某些强制命中杀的技能)
6. 如果原来有多个目标，复制牌是否也打同一个目标

---

## 一、确认事实（有证据）

### 1.1 卡牌创建 / 印卡（同名同属性复制）

引擎提供三种主要方式创建虚拟卡/复制卡：

**方式A：+""+game.createCard(name, suit, number, nature)+""+**
文件：+""+
oname/game/index.js:6021-6059+""+
`+""+`js
game.createCard(name2, suit, number, nature) {
    if (typeof name2 == "object") {
        nature = name2.nature;
        number = name2.number;
        suit = name2.suit;
        name2 = name2.name;
    }
    return card.init([suit, number, name2, nature]);
}
`+""+`
实际用例（保留原牌花色点数，改牌名）：
+""+character/mobile/skill.js:17979+""+
`+""+`js
var card = game.createCard(ChangeName, get.suit(OriginCard, false), get.number(OriginCard, false));
`+""+`

**方式B：+""+
ew lib.element.VCard(card, cards, ...)+""+**
文件：+""+
oname/library/element/vcard.js:5-100+""+

从实体牌构建时自动复制 name/suit/number/nature/storage/cards：
`+""+`js
this.name = get.name(suitOrCard, owner);
this.suit = get.suit(suitOrCard, owner);
this.number = get.number(suitOrCard, owner);
this.nature = get.nature(suitOrCard, owner);
this.storage = get.copy(suitOrCard.storage);
`+""+`

简化写法：
`+""+`js
new lib.element.VCard({ name: "sha", isCard: true })
new lib.element.VCard({ name: trigger.card.name, nature: trigger.card.nature, isCard: true })
`+""+`
用例：+""+character/bingshi/skill.js:451,470,557+""+

**方式C：+""+get.copy(card)+""+ + 内联对象**
直接深拷贝一个 card-like 对象，保留所有属性。
用例：+""+character/tw/skill.js:19557-19562+""+
`+""+`js
trigger.getParent().twguoyi_reuse = {
    name: trigger.card.name,
    nature: trigger.card.nature,
    isCard: true,
    storage: { twguoyi: true },
};
var next = player.useCard(get.copy(card), trigger.targets, false);
`+""+`

**方式D：+""+get.autoViewAs(card, cards, owner)+""+**
文件：+""+
oname/get/index.js:1049-1054+""+
`+""+`js
autoViewAs(card, cards, owner) {
    if (arguments.length === 1 && card instanceof lib.element.VCard) return card;
    return new lib.element.VCard(card, cards, void 0, void 0, owner);
}
`+""+`
此函数将任意 card 对象统一转为 VCard。在 +""+player.useCard()+""+ 内部开始时被调用（+""+player.js:7176+""+）。

---

### 1.2 useCard 强制使用机制

**+""+player.useCard()+""+ 方法**
文件：+""+
oname/library/element/player.js:7083-7250+""+

参数解析规则（行 7087-7113）：

| 参数类型 | 含义 |
|---------|------|
| +""+get.itemtype(arg) == "cards"+""+ | +""+
ext.cards = arg+""+ |
| +""+get.itemtype(arg) == "players"+""+ | +""+
ext.targets = arg+""+ |
| +""+get.itemtype(arg) == "card"+""+ | +""+
ext.card = arg+""+ |
| +""+	ypeof arg == "object" && arg.name+""+ | +""+
ext.card = arg+""+ (内联虚拟卡) |
| +""+rg == "noai"+""+ | +""+
ext.noai = true+""+ |
| +""+rg == "nowuxie"+""+ | +""+
ext.nowuxie = true+""+ |
| 其他 +""+	ypeof arg == "string"+""+ | +""+
ext.skill = arg+""+ |
| +""+	ypeof arg == "boolean"+""+ | +""+
ext.addCount = arg+""+ |

**useCard 事件生命周期**
文件：+""+
oname/library/element/content.js:9029-9764+""+

关键步骤：
1. **useCard** — 解析参数、初始化 directHit/excluded/customArgs、处理牌归属(lose_map)、动画
2. **useCard0** — 触发阶段0
3. **useCard1** — 连线动画、log输出（**此时可拦截添加 directHit / nowuxie**）
4. **yingbian** — 应变结算
5. **useCard2** — 触发阶段2
6. **useCard** — 主触发阶段
7. 排序目标 → **useCardToPlayer** → **useCardToTarget** → **useCardToPlayered** → **useCardToTargeted**
8. **card.name content** — 执行牌本身的 content 函数（如杀的响应+伤害）
9. contentAfter → finish

每个目标循环传递 +""+directHit+""+, +""+customArgs+""+（行9428-9446）：
`+""+`js
next.directHit = event.directHit;
next.customArgs = event.customArgs;
`+""+`

---

### 1.3 "不可响应" 机制（directHit / customArgs / unhurt）

#### directHit 数组

+""+directHit+""+ 是 useCard 事件上的数组，包含在其中的目标跳过响应阶段。

**设置方式A：在 useCard1 触发器中追加**
+""+character/mobile/skill.js:6029+""+：
`+""+`js
trigger.directHit.addArray(targets);
`+""+`
+""+character/bingshi/skill.js:407+""+（全屏不可响应）：
`+""+`js
trigger.directHit.addArray(game.players);
`+""+`

**设置方式B：useCard 调用时 .set()**
+""+character/huicui/skill.js:1968+""+：
`+""+`js
await player.useCard({ name: "sha", isCard: true }, target, false)
    .set("directHit", directHit)
    .set("baseDamage", baseDamage);
`+""+`

**杀（sha）检查** — +""+card/standard.js:141+""+：
`+""+`js
if (event.directHit || event.directHit2 || ...) {
    event._result = { bool: false };  // 跳过出闪
}
`+""+`

**闪（shan）同理** — +""+card/standard.js:1709+""+：
`+""+`js
if (!event.directHit) {
    const next = target.chooseToRespond();
}
`+""+`

#### customArgs（每目标自定义参数）

文件：+""+
oname/library/element/content.js:9077-9081, 9674-9681+""+

结构：
- +""+customArgs.default+""+ — 所有目标共有
- +""+customArgs[target.playerid]+""+ — 针对特定目标

传递机制：
`+""+`js
for (let i in event.customArgs.default) {
    next[i] = event.customArgs.default[i];
}
if (next.target && event.customArgs[next.target.playerid]) {
    for (let i in customArgs) {
        next[i] = customArgs[i];
    }
}
`+""+`

**无双（wushuang）范例** — +""+character/standard/skill.js:2010-2018+""+：
`+""+`js
const id = trigger.target.playerid;
const map = trigger.getParent().customArgs;
if (!map[id]) map[id] = {};
map[id].shanRequired = 2;  // 需要两张闪
`+""+`

常用 customArgs 属性：
- +""+shanRequired+""+ — 需几张闪
- +""+shaRequired+""+ — 需几张杀（决斗）
- +""+xtraDamage+""+ — 额外伤害
- +""+aseDamage+""+ — 基础伤害

#### unhurt（响应失败也不受伤）

+""+card/standard.js:230+""+：
`+""+`js
if (... && !event.unhurt) {
    target.damage(get.nature(event.card));
}
`+""+`

#### directHit_ai 标签

技能设 +""+directHit_ai: true+""+ 通知 AI 此技能使牌不可被响应。

---

### 1.4 "无法无效" 机制（阻止无懈可击）

+""+_wuxie+""+ 事件定义：+""+card/standard.js:4303-4452+""+

**过滤器（行4309-4333）** — 任一条件满足即不可无懈：

| 条件 | 代码位置 | 说明 |
|------|---------|------|
| 牌 storage 禁止 | +""+vent.card.storage?.nowuxie+""+ (4310) | 牌对象 storage 上标记 |
| 使用事件禁止 | +""+vent.getParent().nowuxie+""+ (4322) | useCard 事件的 nowuxie=true |
| 使用者标签禁止 | +""+vent.player.hasSkillTag("playernowuxie")+""+ (4325) | 使用者有 playernowuxie |
| 非锦囊牌过滤 | +""+get.type(event.card) !== "trick"+""+ (4328) | 杀等基本牌天然不可被无懈 |
| 牌定义禁止 | +""+info.wuxieable === false+""+ (4318) | 卡牌定义中显式禁止 |

**设置方式：**

A. useCard 字符串参数 — +""+player.js:7105-7106+""+：
`+""+`js
player.useCard({ name: "juedou", isCard: true }, "nowuxie", target, "noai");
`+""+`
用例：+""+character/standard/skill.js:2139+""+（离间/决斗不可无懈）

B. card.storage 标记：
`+""+`js
card.storage.nowuxie = true;
`+""+`

C. 触发器中设置：
`+""+`js
trigger.nowuxie = true;
`+""+`
用例：+""+character/shenhua/skill.js:191+""+

---

### 1.5 完整范例

#### 范例A：强制不可响应杀（jinzu 机制）
+""+character/mobile/skill.js:6027-6048+""+
`+""+`js
trigger.directHit.addArray(targets);  // 指定目标无法出闪
for (const [target, num] of player.storage[event.name]) {
    const id = target.playerid;
    const map = trigger.customArgs;
    map[id] ??= {};
    map[id].extraDamage += num;  // 带额外伤害
}
`+""+`

#### 范例B：复制牌+强制使用（保留原目标+额外目标）
+""+character/tw/skill.js:19557-19611+""+
`+""+`js
// ①存储牌副本
trigger.getParent().twguoyi_reuse = {
    name: trigger.card.name,
    nature: trigger.card.nature,
    isCard: true,
    storage: { twguoyi: true },
};
// ②在 useCardAfter 强制再次使用
var card = trigger.twguoyi_reuse;
for (var i of trigger.targets) {
    if (!i.isIn() || !player.canUse(card, i, false)) return;
}
var next = player.useCard(get.copy(card), trigger.targets, false);
if (trigger.addedTarget) next.addedTarget = trigger.addedTarget;
if (trigger.addedTargets && trigger.addedTargets.length) {
    next.addedTargets = trigger.addedTargets.slice(0);
}
`+""+`

#### 范例C：不可响应+不可无效组合范式
`+""+`js
// 在 useCard1 触发器中：
trigger.directHit.addArray(targets);     // 不可响应
trigger.nowuxie = true;                   // 不可无效
// 或直接对 useCard 事件的 .set() 链式调用：
player.useCard(card, targets, "mySkill")
    .set("directHit", targetArray)
    .set("nowuxie", true);
`+""+`

---

### 1.6 多目标复制：确认打同一目标

**确认：复制牌默认打同一个目标数组。**

+""+character/tw/skill.js:19605+""+：
`+""+`js
var next = player.useCard(get.copy(card), trigger.targets, false);
`+""+`
+""+	rigger.targets+""+ 是原始牌的完整目标数组。

额外目标需保留 addedTarget/addedTargets（行19606-19611）。

---

## 二、推断与剩余未知

### 高置信度推断

1. +""+get.copy()+""+ 深拷贝包括 storage、cards、skills 等，不仅是 name/nature/suit/number。
2. +""+cardPrompt+""+ 仅为 UI 描述函数，不影响强制使用机制。
3. +""+ddToExpansion+""+ 是将牌加入扩展区的独立操���，与 useCard 无关。
4. +""+get.cardPile2+""+ 是从牌堆获取实体牌（+""+
oname/get/index.js:4550+""+），用于获取牌对象，不直接涉及虚拟卡创建。

### 剩余未知

1. +""+vent.forceDie+""+ 在 damage 和 card content 中的确切行为需进一步追踪。
2. +""+xcluded+""+ 与 +""+directHit+""+ 同时存在时的优先级未完全验证。

---

## 三、关键决策输入

| 决策点 | 说明 |
|--------|------|
| 响应抑制粒度 | +""+directHit+""+ 是数组，可按目标控制；nowuxie 是布尔值，全有或全无 |
| 牌属性复制深度 | 若 storage 影响 content，需用 +""+get.copy()+""+ 而非字面量 |
| 目标继承 | 复制牌默认打同批 target，需手动复制 addedTarget/addedTargets |
| 不可无效范围 | 杀等基本牌天然不可被无懈；锦囊牌才需要显式 nowuxie |

---

## 四、证据来源索引

| 证据 | 文件 | 行号 |
|------|------|------|
| game.createCard | noname/game/index.js | 6021-6059 |
| player.useCard | noname/library/element/player.js | 7083-7250 |
| useCard 事件 content | noname/library/element/content.js | 9029-9764 |
| directHit 传递 | noname/library/element/content.js | 9683-9684 |
| customArgs 机制 | noname/library/element/content.js | 9077-9081, 9674-9681 |
| VCard 类 | noname/library/element/vcard.js | 5-100 |
| get.autoViewAs | noname/get/index.js | 1049-1054 |
| 杀 directHit 检查 | card/standard.js | 141 |
| 闪 directHit 检查 | card/standard.js | 1709 |
| _wuxie 事件过滤 | card/standard.js | 4309-4333 |
| nowuxie 参数解析 | noname/library/element/player.js | 7105-7106 |
| 无双 customArgs | character/standard/skill.js | 2010-2018 |
| directHit.addArray 范例 | character/mobile/skill.js | 6029 |
| useCard+nowuxie 范例 | character/standard/skill.js | 2139 |
| useCard+directHit .set() | character/huicui/skill.js | 1968 |
| get.copy+useCard 复用 | character/tw/skill.js | 19557-19611 |
| 多目标守卫代码 | character/huicui/skill.js | 15761-15773 |
