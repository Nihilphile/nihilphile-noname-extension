# Exploration Report: tia_daowu 悼舞 AI不响应伤害牌根因分析

## 1. 问题

tia_daowu 技能：黑色手牌视为杀/闪响应伤害牌。AI 实测不响应。

## 2. 参考技能定位

### 2.1 赵云·龙胆 (jdlongdan)

- **文件**: `resources\app\character\offline\skill.js` 行 32711-32873
- **模式**: `enable: ["chooseToUse", "chooseToRespond"]` + `hiddenCard` + `chooseButton.dialog/check/backup` + `viewAs`（backup内）
- **backup filterCard**: `{ name: "shan" }`（当转换为杀时），与事件 `filterCard`（shan-only）**兼容**
- **backup position**: `"he"`
- **AI**: `respondSha/respondShan: true` + `skillTagFilter` + `order: 9` + **`ai.result.player: 1`**
- **无** `onChooseToUse` / `onChooseToRespond` hooks

### 2.2 翊赞·赵统赵广 (zj_yizan)

- **文件**: `resources\app\character\offline\skill.js` 行 11873-11987
- **模式**: 同上选择按钮+viewAs
- **backup filterCard**: `true`（所有牌通过），与事件 filterCard **部分兼容**
- **AI**: `respondSha/respondShan: true` + `skillTagFilter` + `order` + **`ai.result.player: 1`**
- **无** hooks

### 2.3 核心发现

龙胆/翊赞的 backup.filterCard 与原事件 filterCard **兼容**（都找杀/闪类牌），自然通过。悼舞的 backup.filterCard 是 **`card => get.color(card) === "black"`**，与原事件 filterCard（仅杀/闪）**冲突**——黑装备/黑锦囊通过 backup 但被原 filterCard 拒绝。

## 3. 悼舞当前代码关键路径

**文件**: `nihilphile武将包\module\tia.js`

| 属性 | 值 | 问题 |
|-------|-----|------|
| `enable` (行757) | `["chooseToUse", "chooseToRespond"]` | 正常 |
| `hiddenCard` (行759) | 黑牌时返 true | 正常 |
| `filter` (行768) | `isDaowuResponseWindow` + 黑牌 + filterCard 测试 | 对 sha(chooseToUse+respondShan) OK；对 nanman等(chooseToRespond) 依赖 parent 链 OK |
| `onChooseToUse` (行762) | 调 `tiaPatchDaowuBackupFilter` | 首次运行时 event.skill≠backup → 无效 |
| `onChooseToRespond` (行765) | 同上 | 同上 |
| `chooseButton.dialog` (行773) | 生成杀/闪选项 | 正常 |
| **`chooseButton.check`** | **缺失** | 默认返回1，无上下文评估 |
| `chooseButton.backup.filterCard` (行783) | 黑色牌 | **与原事件filterCard冲突** |
| `chooseButton.backup.viewAs` (行782) | `{ name, isCard: true }` | `isCard: true` 可能影响后续处理 |
| `chooseButton.backup.check` (行796) | `tiaDaowuResponseScore` | 可能返回负值导致AI不选 |
| `chooseButton.backup.ai1` (行799) | 同上 | 同上 |
| `ai.respondSha/respondShan` (行809) | true | 正常 |
| `ai.skillTagFilter` (行811) | 检查黑牌 | 正常 |
| `ai.order` (行814) | 2.5 / -1 | 用 `_status.event` 可能不是当前事件 |
| **`ai.result`** | **缺失** | 龙胆/翊赞都有 `result.player: 1` |

## 4. 失败链路分析

### 4.1 filterOk 冲突（主因推测）

`event.backup("tia_daowu_backup")` 在 `gameEvent.js:769-783` 创建新的 `filterOk`：

```javascript
this.filterOk = function() {
    const filter = evt._backup.filterCard;  // ← 原始 shan-only filterCard
    if (info.viewAs && filter && !filter(card, player, evt)) {
        return false;  // ← 黑非闪牌在此被挡
    }
    // ...
};
```

此 `filterOk` 在 `chooseToRespond` content step2 (行4846) 被调用：
```javascript
if ((ai.basic.chooseTarget(event.ai2) || forced) && (!event.filterOk || event.filterOk()))
```

`tiaPatchDaowuBackupFilter` 试图修复：通过 `onChooseToUse/onChooseToRespond` hook 把 `event.filterOk` 覆写为 `() => true`。

**问题**: `onChooseToUse` 首次运行时 `event.skill ≠ "tia_daowu_backup"`，补丁无效。之后 `event.backup()` 创建新 filterOk 覆盖补丁。然后 `event.goto(0)` 重跑 content steps，step0 再次调用 `onChooseToUse`，此时 `event.skill === "tia_daowu_backup"`，补丁生效。理论上此机制应工作。若仍不工作，需检查 `event.goto(0)` 后 step0 是否确实重新执行。

### 4.2 ai.order 使用 _status.event（次因）

行814-817：
```javascript
order(item, player) {
    if (!isDaowuResponseWindow(_status.event, player)) return -1;
```

`_status.event` 在 AI 多步骤评估中可能不是当前 `chooseToUse` 事件，而是父事件。若 `isDaowuResponseWindow` 对错误事件返回 false，`order` 返 -1，AI 跳过此技能。

对比龙胆：`order: 9`（常数，不使用 _status.event）。

### 4.3 缺失 ai.result.player（次因）

龙胆（行32826-32832）和翊赞（行11980-11982）均有 `ai.result.player` 返回正值。悼舞缺失此属性。`get.effect()` 中 `result.player` 为 undefined → 按0处理。虽不直接阻止响应决策，但可能使 AI 低估响应价值。

### 4.4 ai1/check 得分可能为负（边缘情况）

`tiaDaowuResponseScore` 对所有黑牌可能返回负值（取决于弹药槽位和点数），导致 `chooseCard` 不选任何牌。

## 5. 最小修复方案

### 5.1 最优先：添加 `chooseButton.check`

参照龙胆行32767-32777，在 `chooseButton` 层级添加：

```javascript
check(button) {
    if (_status.event.getParent().type != "phase") return 1;
    var player = _status.event.player;
    var card = { name: button.link[2], isCard: true };
    return player.getUseValue(card, null, true);
},
```

### 5.2 最优先：添加 `ai.result.player`

```javascript
ai: {
    // ... 保持现有属性 ...
    result: {
        player: 1,  // ← 添加，基础响应价值
    },
},
```

### 5.3 修改 `ai.order` 不依赖 `_status.event`

将行814的 `_status.event` 替换为 `get.event()` 或从 item 获取上下文，确保 order 评估使用正确的当前事件。

### 5.4 加固 filterOk 补丁（如果#5.1-5.3后仍不工作）

选项A：在 backup 对象中直接添加 `filterOk: () => true`：
```javascript
backup(links, player) {
    return {
        viewAs: { name, isCard: true, storage: { tia_daowu: true } },
        filterCard(card, player) { return get.color(card, player) === "black"; },
        filterOk: function() { return true; },  // ← 添加
        position: "h",
        // ...
    };
},
```

选项B：修改 `tiaPatchDaowuBackupFilter`，不检查 `event.skill === "tia_daowu_backup"`，改为：
```javascript
function tiaPatchDaowuBackupFilter(event) {
    if (!event || !event._backup) return;
    if (event.skill) {
        const info = get.info(event.skill);
        if (info && info.sourceSkill === "tia_daowu") {
            event.filterOk = function() { return true; };
        }
    }
}
```

### 5.5 备选：参考龙胆模式重写

龙胆的 backup.filterCard 使用 `{ name: "shan" }`（与事件 filterCard 兼容），且不依赖 filterOk 补丁。悼舞可改为：只允许"黑杀"/"黑闪"实体牌通过 filterCard，而非"任意黑色牌"。这减少了 filterCard 冲突但限制了可用牌范围（如黑装备/黑锦囊将不可用）。

## 6. 潜在风险

- **添加 `ai.result.player: 1`**：可能影响 `get.effect` 对其他场景的计算（如 evaluate 使用价值），需测试。
- **修改 `ai.order`**：若 `get.event()` 也不正确，可能仍需 `_status.event`。
- **放宽 filterOk 补丁条件**：可能影响其他技能的 filterOk 行为（虽概率低）。
- **龙胆模式重写**：改变技能设计初衷（原设计允许黑装备/锦囊转化），需产品决策。
- **添加 backup.filterOk**：若 backup 对象的 filterOk 被 `event.backup()` 函数覆盖（见 gameEvent.js:828），可能无效。需验证 backup 对象中的 filterOk 是否被正确传递。

## 7. 证据清单

| 证据 | 路径 | 关键行 |
|------|------|--------|
| 龙胆完整定义 | `resources\app\character\offline\skill.js` | 32711-32873 |
| 翊赞完整定义 | `resources\app\character\offline\skill.js` | 11873-11987 |
| backup() 创建 filterOk | `resources\app\noname\library\element\gameEvent.js` | 704-837 |
| chooseToRespond content step2 (AI) | `resources\app\noname\library\element\content.js` | 4837-4885 |
| filterEnable 判断 | `resources\app\noname\library\index.js` | 10774-10833 |
| get.effect 使用 result.player | `resources\app\noname\get\index.js` | 6642-6689 |
| sha卡 chooseToUse(type=respondShan) | `resources\app\card\standard.js` | 146-165 |
| nanman chooseToRespond | `resources\app\card\standard.js` | 1316-1355 |
| 悼舞完整定义 | `nihilphile武将包\module\tia.js` | 756-821 |
| tiaPatchDaowuBackupFilter | `nihilphile武将包\module\tia.js` | 108-115 |
