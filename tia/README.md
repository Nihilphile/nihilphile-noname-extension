# 黑纱鸣礼 缇娅 — Staging 实现稿

**日期**: 2026-06-22
**状态**: staging（未合入 nihilphile 武将包）
**位置**: `nihilphile/tia/`

---

## 1. Staging 内容

本目录包含新武将"黑纱鸣礼 缇娅"(ID: `tia_tiya`) 的独立实现草稿，供正式合入 `nihilphile武将包` 前独立评审与 smoke 验证。

### 产出文件

| 文件 | 说明 |
|------|------|
| `character.js` | 武将数据：性别女、势力 xi、体力3、技能列表 |
| `skill.js` | 三个技能完整实现：枪礼、荣光、悼舞（含子技能） |
| `translate.js` | 武将名、技能名、技能描述翻译 |
| `README.md` | 本文件 |
| `integration-notes.md` | 正式合入指南 |

---

## 2. 技能实现概要

### 枪礼 (tia_qiangli) — 锁定技

- **Part A 装弹**: trigger `useCardAfter`/`respondAfter`，排除荣光杀，`get.cards(1)` → `addToExpansion`(暗置, gaintag="tia_qiangli_ammo")，上限6
- **Part B 杀/酒改摸牌**: trigger `useCard2`，出牌阶段实体手牌杀/酒 → `targets=[]` + `addCount=false` + `stat[name]--` + `draw(1)`
- **mod**: `cardUsable` 返回 Infinity，`cardEnabled` 返回 true（出牌阶段杀/酒）
- **弹药顺序**: `player.storage.tia_ammo_order` (FIFO 数组)

### 荣光 (tia_rongguang) — 视为杀 + 额外结算

- **初次击发**: `enable:"chooseToUse"` + `position:"x"` + `viewAs`；悼舞明置弹药 → 火杀
- **首轮抵消**: 子技能 `tia_rongguang_track` 在 `useCard1` 初始化点数状态并判首轮抵消（X=1, threshold=12）
- **额外结算**: 子技能 `tia_rongguang_extra` 在 `useCardToEnd` 触发（而非 useCardAfter），`chooseBool` 询问 → `effectCount++`
- **抵消**: 累计弹药点数 > 16-4X → `customArgs.default.unhurt=true`（不阻断结算循环）；每轮显式清理/覆盖上一轮的 unhurt
- **去重**: 仅在当前轮次最后一目标时询问，单目标/多目标均正常工作

### 悼舞 (tia_daowu) — 响应转化 + 明置弹药

- **响应**: `enable:["chooseToUse","chooseToRespond"]` + `viewAs` 动态杀/闪
- **门控**: `filter` 检查伤害牌 + 使用者手牌数 >= 缇娅手牌数 + 黑色牌素材
- **明置弹药**: 子技能 `tia_daowu_track` 追踪转化牌 → `tia_daowu_collect` 拦截进弃牌堆 → `addToExpansion`(gaintag="tia_daowu_ammo")

---

## 3. 正式合入文件清单

详见 `integration-notes.md`。最小修改：

1. **nihilphile武将包/character/character.js** — 添加 `tia_tiya` 条目
2. **nihilphile武将包/character/skill.js** — 合并本 staging skill.js
3. **nihilphile武将包/character/translate.js** — 合并本 staging translate.js
4. **nihilphile武将包/image/character/tia_tiya.jpg** — 复制头像
5. **nihilphile武将包/main/precontent.js** — 可能需要注册 `xi` 势力

---

## 4. 已知风险与待验证项

### 高风险 (需要 runtime 验证)

1. **`position: "x"` 在 chooseToUse 中是否生效**
   - 备选：若 `position:"x"` 在 chooseToUse 中无法让玩家从 expansion 选牌，改用 `enable:"phaseUse"` + `chooseButton` + `chooseUseTarget` 手动流程
   
2. **`useCard2` trigger 中修改 `trigger.targets` 的副作用**
   - 理论上 `targets=[]` 可安全跳过所有目标处理（content.js:9412 getTriggerTarget 返回 null）
   - 需验证与 yingbian 等技能交互

3. **`useCardToEnd` 轮次去重与 effectCount 循环兼容性**
   - 已修复：trigger 从 `useCardAfter` 改为 `useCardToEnd`，确保在 effectCount 循环体内生效
   - 去重逻辑：仅在最后一目标时询问，单/多目标均正常工作
   - 需 runtime smoke 验证多目标场景（如方天画戟）下去重正确

4. **`customArgs.default.unhurt` 的跨轮传播**
   - 已修复：首轮在 useCard1（tia_rongguang_track）中设置；额外轮次在 useCardToEnd 中设置
   - 每轮显式 delete/覆盖 unhurt，避免污染
   - 需 runtime 验证 customArgs 从 useCard 父事件传播到子 sha 事件

5. **悼舞 `loseAfter` / `cardsDiscardAfter` 时机**
   - 牌从手牌失去→进弃牌堆；需要 `gain` 取回再 `addToExpansion`
   - 若牌已被其他技能收走（如曹操），addToExpansion 会失败

### 中风险

6. **荣光弹药移除后 `loseToDiscardpile` 不会触发枪礼装弹**
   - 因为枪礼 trigger filter 检查 card.name 为 "sha"/"shan"，弹药移除不匹配

7. **FIFO 数组与 expansion 牌一致性**
   - 若弹药被其他技能直接移除（如顺手牵羊），storage 数组会残留失效的 cardid
   - 当前实现通过运行时过滤（`allAmmo.find(c => c.cardid === cid)`）缓解

### 低风险 / 设计确认项

9. **势力 `xi` 未注册** — 正式合入需在 precontent.js 注册 `lib.group` 和 `lib.translate`
10. **头像路径格式** — `extension/nihilphile/image/character/tia_tiya.jpg`，需确认扩展名为 `.jpg`
11. **联机兼容** — 未使用 `game.online` 受限 API，但悼舞的 `chooseToUse` 可能在联机中受 `_status.connectMode` 影响
12. **AI 评分** — 当前为基本实现，建议 smoke 后调整

---

## 5. 建议 Smoke 场景

1. **枪礼装弹**: 缇娅使用/打出【杀】或【闪】后，牌堆顶牌移至武将牌（暗置）；超过6张时不再装填
2. **枪礼杀/酒改摸牌**: 出牌阶段，缇娅使用实体手牌【杀】或【酒】，不选目标，摸1张牌，不计使用次数
3. **荣光击发**: 有弹药时，出牌阶段可选荣光，火杀（若为悼舞弹药）对目标生效
4. **荣光额外结算**: 第一轮结算后询问是否继续；点数累计 > 16-4X 时抵消（不造成伤害仍结算结束）
5. **悼舞响应**: 被伤害牌指定时，若使用者手牌≥自己，可用黑色牌当【闪】/【杀】响应
6. **悼舞明置弹药**: 悼舞转化牌进弃牌堆时，改为明置于武将牌上（计入弹药总量，上限6）
