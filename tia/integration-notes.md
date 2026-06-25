# 缇娅 正式合入指南 (Integration Notes)

**目标包**: `F:\AI_project\nameless_game\nihilphile\nihilphile武将包`
**合入前状态**: 本 staging 目录独立存在，不影响正式包

---

## 一、必须修改的文件

### 1. `character/character.js`

在 `characters` 对象中添加：

```javascript
tia_tiya: {
    sex: "female",
    group: "xi",
    hp: 3,
    skills: ["tia_qiangli", "tia_rongguang", "tia_daowu"],
},
```

头像路径由已有的 `for (let i in characters)` 循环自动生成，无需额外处理。

### 2. `character/skill.js`

将本目录 `skill.js` 中的所有技能定义合并到 `skills` 对象中（放在 `export default skills;` 之前）。

**注意**: 不要覆盖已有的 `ycc_*` 技能。

### 3. `character/translate.js`

将本目录 `translate.js` 中的所有翻译条目合并到 `translates` 对象中。

### 4. `character/index.js`

如果需要在选将界面显示称号，在 `characterTitle` 中添加：

```javascript
characterTitle: {
    // ... 已有条目 ...
    tia_tiya: "#g黑纱鸣礼",
},
```

其中 `#g` 为绿色，可改为其他颜色标签。

---

## 二、必须新增的文件

### 1. 头像文件

将剪辑版素材 `D:\下载\新UI..黑纱鸣礼.缇娅 (17).png` 复制为：

```
F:\AI_project\nameless_game\nihilphile\nihilphile武将包\image\character\tia_tiya.jpg
```

**注意**：
- 文件名必须是 `tia_tiya.jpg`（与武将 ID 一致）
- 若原图为 PNG，需转换为 JPG 或确保 `character.js` 中 img 路径使用正确的扩展名
- 头像路径 `extension/nihilphile/image/character/tia_tiya.jpg` 由 character.js 的 for 循环自动拼接

---

## 三、可能需要修改的文件

### 1. `main/precontent.js` — 注册 xi 势力

缇娅的势力为"西"。无名杀标准势力仅包含 `wei, shu, wu, qun, jin, god` 等。"xi" 是自定义势力。

**方案**: 在 `precontent.js` 中添加势力注册（参考已有 `fu` 势力的注册模式）：

```javascript
// 注册 xi 势力
if (!lib.group.includes("xi")) {
    lib.group.push("xi");
}
// 势力翻译
lib.translate.xi = "西";
lib.translate.xi_character_config = "西势力";
```

**若不想注册新势力**，可将 `group: "xi"` 改为 `group: "qun"`（群势力），但这会改变武将分类。

### 2. `character/sort.js` — 武将排序

若 nihilphile 包需要控制选将界面排序，在 `characterSort` 中添加 `tia_tiya` 的排序位置。

### 3. `character/intro.js` — 武将简介

添加缇娅的引言：
```javascript
tia_tiya: "一袭黑纱，半场礼仪；待荣光鸣响，余声尽作终幕。",
```

### 4. `info.json` — 更新 intro

若需更新包简介以反映双武将内容。

---

## 四、不需要修改的文件

- `extension.js` — 包级别入口，无需变更
- `main/content.js` — 空钩子
- `character/card.js` — 无自定义卡牌
- `character/characterFilter.js` — 无特殊筛选
- `character/dynamicTranslate.js` — 无动态翻译
- `character/pinyin.js` - 拼音自动生成
- `character/voices.js` — 暂无语音

---

## 五、势力注册详细说明

### 当前 nihilphile 包使用的势力

| 武将 | 势力 | 是否标准 |
|------|------|----------|
| 御承宸 (ycc_yuchengchen) | qun (群) | 标准 |
| 缇娅 (tia_tiya) | xi (西) | 自定义 |

### xi 势力注册步骤

在 `main/precontent.js` 中（在 game.import 之前或之中）：

```javascript
// 参考 fu 势力注册模式 (precontent.js:15-21)
lib.group.add("xi");
lib.translate["xi"] = "西";
lib.translate["xi_character_config"] = "西势力";
```

---

## 六、联机注意事项

- nihilphile 包已有三处 `connect: true`（extension.js, character/index.js, info.json），缇娅自动联机可用
- `_status.connectMode` 下缇娅的所有技能使用标准 API（trigger/enable/mod），无自定义 UI，联机安全
- 悼舞 chooseToRespond filter 依赖 `event.respondTo[0].countCards("h")`，联机中手牌数通过 `game.addVideo` 同步，可正常工作

---

## 七、风险清单（合入前需关注）

1. **势力注册**：xi 势力未注册会导致游戏加载失败或武将不可见
2. **头像缺失**：缺少头像文件不影响游戏，但选将界面无图
3. **position: "x"**：荣光从 expansion 选牌，如框架不支持需降级为 chooseButton 模式
4. **useCardToEnd 多目标去重**：荣光额外结算使用 useCardToEnd + 最后一目标去重，需 runtime smoke 验证多目标场景
5. **customArgs.default.unhurt 跨轮传播**：首轮在 useCard1 设置、额外轮次在 useCardToEnd 设置，需验证是否正确传播到 sha 子事件
6. **effectCount 循环**：在 useCardToEnd 中递增 effectCount 以触发额外结算循环，需验证框架在此时机递增后是否正常进入下一轮
