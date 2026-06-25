# 黑纱鸣礼·缇娅 — 独立拓展包

**日期**: 2026-06-22
**版本**: 1.0
**状态**: staging（静态审查 PASS，未 runtime smoke）
**扩展名**: `tia`

---

## 1. 简介

本扩展包包含新武将"黑纱鸣礼 缇娅"(ID: `tia_tiya`) 的完整实现，可作为无名杀独立 extension 加载。

### 武将信息

| 属性 | 值 |
|------|-----|
| 武将名 | 缇娅 |
| 称号 | 黑纱鸣礼 |
| 性别 | 女 |
| 体力 | 3 |
| 势力 | 西 (xi) |
| 技能 | 枪礼、荣光、悼舞 |

---

## 2. 安装方式

> ⚠️ **重要：目录名必须严格为 `tia`**
> 
> `extension.js` 中通过 `extension/tia/info.json` 读取扩展信息。
> 无名杀框架按扩展目录名构造该路径。如果目录名不是 `tia`（例如 `tia扩展包`、`tia_v1` 等），
> 框架会请求 `extension/<目录名>/info.json`，导致 404 Not Found 错误：
> 
> ```
> 扩展《黑纱鸣礼·缇娅》加载失败。错误信息：Error: Not Found
> at XMLHttpRequest... /noname/library/init/index.js:300
> ```
> 
> **本目录已经名为 `tia`，直接复制即可，无需重命名。**

### 方式 A：复制目录到 extensions

将本目录（`tia`）整体复制到无名杀的扩展目录：

```
<无名杀根目录>/resources/app/extension/tia/
```

即最终路径为：
```
<无名杀根目录>/resources/app/extension/tia/extension.js
<无名杀根目录>/resources/app/extension/tia/info.json
...
```

然后在游戏内扩展管理中启用"黑纱鸣礼·缇娅"。

### 方式 B：ZIP 导入

将 `tia` 目录**内的内容**（不是外层目录）打包为 ZIP：

```powershell
# 方法1：进入tia目录，打包其内容
cd tia
zip -r ../tia.zip *

# 方法2：打包目录本身（确保解压后目录名是tia）
cd ..
zip -r tia.zip tia/
```

在无名杀扩展管理界面导入 ZIP。确保导入后扩展列表中显示 name 为 `tia`。

---

## 3. 当前状态与风险

### 已完成

- [x] 静态语法检查（通过 node --check）
- [x] 头像文件已包含（`image/character/tia_tiya.png`）
- [x] 三个技能完整实现（枪礼、荣光、悼舞，含子技能）
- [x] xi 势力注册（precontent.js）
- [x] connect: true 三处齐全（extension.js、info.json、character/index.js）
- [x] 翻译完整

### ⚠️ 仍需 Runtime Smoke 验证

本拓展包**尚未进行实际游戏运行测试**。以下为已知需要 runtime 验证的关键点：

1. **`position: "x"` 在 chooseToUse 中是否生效**
   - 荣光技能使用 `position: "x"` 从 expansion 选牌。若框架在 chooseToUse 上下文中不支持此 position，技能将无法正常使用。
   - 备选方案：改为 `enable: "phaseUse"` + `chooseButton` + `chooseUseTarget` 手动流程。

2. **`useCard2` trigger 中修改 `trigger.targets` 的副作用**
   - 枪礼 Part B 在 useCard2 中设置 `trigger.targets = []` 以跳过目标处理。需验证与 yingbian 等技能的交互。

3. **`useCardToEnd` 轮次去重与 effectCount 循环兼容性**
   - 荣光额外结算使用 useCardToEnd + 最后一目标去重 + effectCount++ 实现循环。需验证多目标场景（如方天画戟）。

4. **`customArgs.default.unhurt` 的跨轮传播**
   - 荣光抵消通过 customArgs 传递 unhurt。需验证从 useCard 父事件正确传播到子 sha 事件。

5. **悼舞 `loseAfter` / `cardsDiscardAfter` 时机**
   - 转化牌被其他技能收走（如曹操）时，addToExpansion 可能失败。

6. **联机兼容**
   - 悼舞的 chooseToUse/chooseToRespond 在联机中受 `_status.connectMode` 影响，需实测。

### 低风险 / 设计确认项

7. **势力 `xi` 颜色未设置** — 当前仅注册 `lib.translate.xi = "西"`，未设置 `lib.groupnature.xi`（颜色）。如需要颜色区分，可在 precontent.js 中添加 `lib.groupnature.xi = "soil"` 或类似设置。

8. **头像格式为 PNG** — 当前 `character.js` 中 img 路径使用 `.png` 扩展名。如游戏要求 `.jpg`，需转换格式并更新路径。

---

## 4. 技能简述

### 枪礼（锁定技）
- **Part A**: 使用/打出【杀】或【闪】后，从牌堆顶暗置一张为"弹药"（上限6张）
- **Part B**: 出牌阶段，实体手牌【杀】/【酒】改为摸一张牌，不记次数、不受次数限制

### 荣光
- 移去最底端"弹药"，视为使用一张【杀】
- 每次结算结束，可移去最底端弹药追加一轮（累计点数 > 16-4X 则该轮被抵消）
- 悼舞明置弹药 → 荣光【杀】视为火【杀】

### 悼舞
- 被伤害牌指定时（使用者手牌 ≥ 自己），可用黑色牌当【闪】/【杀】响应
- 转化牌进弃牌堆时，改为明置于武将牌上作为"弹药"（受6上限）

---

## 5. 文件清单

| 文件 | 说明 |
|------|------|
| `extension.js` | 扩展入口，`connect: true` |
| `info.json` | 扩展元信息，`connect: true` |
| `main/precontent.js` | 注册 xi 势力，import character |
| `main/content.js` | 空钩子 |
| `character/index.js` | `game.import("character")` 注册，`connect: true` |
| `character/character.js` | 武将数据（3血女，xi势力） |
| `character/skill.js` | 枪礼/荣光/悼舞 完整实现 |
| `character/translate.js` | 武将/技能翻译 |
| `character/sort.js` | 排序（空） |
| `character/card.js` | 卡牌（空） |
| `character/characterFilter.js` | 筛选（空） |
| `character/dynamicTranslate.js` | 动态翻译（空） |
| `character/intro.js` | 简介（空） |
| `character/pinyin.js` | 拼音（空） |
| `character/voices.js` | 语音（空） |
| `image/character/tia_tiya.png` | 武将头像 |
| `README.md` | 本文件 |

---

## 6. 建议 Smoke 场景

1. **枪礼装弹**: 缇娅使用/打出【杀】或【闪】后，牌堆顶牌移至武将牌（暗置）；超过6张不再装填
2. **枪礼杀/酒改摸牌**: 出牌阶段，缇娅使用实体手牌【杀】或【酒】，不选目标，摸1张牌
3. **荣光击发**: 有弹药时可选荣光，火杀（若为悼舞弹药）对目标生效
4. **荣光额外结算**: 第一轮结算后询问是否继续；点数累计 > 16-4X 时抵消
5. **悼舞响应**: 被伤害牌指定时，用黑色牌当【闪】/【杀】响应
6. **悼舞明置弹药**: 悼舞转化牌进弃牌堆时，改为明置为弹药
