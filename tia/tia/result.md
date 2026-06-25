# 缇娅独立拓展包 — 结果

**日期**: 2026-06-22 19:58
**操作**: coder 诊断修复 — 目录名不匹配导致加载 Not Found
**状态**: 完成（已创建正确命名的 tia/ 目录，验证通过）

---

## 根因分析

用户遇到「扩展加载失败：Error: Not Found」的原因是**目录名不匹配**：

| 组件 | 期望 | 实际 |
|------|------|------|
| `extension.js:5` | `extension/tia/info.json` | — |
| 用户复制的目录 | 必须是 `tia` | `tia扩展包` |

无名杀框架按目录名拼接资源路径：`extension/<目录名>/info.json`。
目录名 `tia扩展包` 导致框架请求 `extension/tia扩展包/info.json` → 404 Not Found。

---

## 修复内容

### 1. 创建正确命名的可加载目录

```
F:\AI_project\nameless_game\nihilphile\tia\tia\
```

该目录名严格等于 `extensionPackage.name`（`"tia"`），包含完整的 17 个文件。

### 2. 更新 README 安装说明

- **`tia/README.md`**: 新增醒目警告框，解释目录名必须为 `tia` 的原因和错误示例；安装方式清晰列出复制 `tia` 目录和 ZIP 打包的正确方法。
- **`tia扩展包/README.md`**: 顶部添加废弃警告，标注「仅用于源码管理，不可直接安装」，并指向 `../tia/README.md`。

### 3. 目录关系

```
nihilphile/tia/
├── character.js          ← staging 源文件（未改）
├── skill.js              ← staging 源文件（未改）
├── translate.js          ← staging 源文件（未改）
├── ...                   ← 其他 staging 文件
├── tia扩展包/            ← 包装目录（源码管理，不可直接安装）
│   └── README.md         → 已标废弃，指向 ../tia/
└── tia/                  ← ✅ 用户安装用的正确目录
    ├── extension.js      → name="tia", info.json路径=extension/tia/info.json
    ├── info.json         → connect:true
    ├── README.md         → 含诊断说明 + 正确安装步骤
    ├── main/...
    ├── character/...
    └── image/...
```

---

## 验证

| 检查项 | 结果 |
|--------|:---:|
| `node --check tia/extension.js` | ✅ |
| `node --check tia/main/precontent.js` | ✅ |
| `node --check tia/main/content.js` | ✅ |
| `node --check tia/character/index.js` | ✅ |
| `node --check tia/character/skill.js` | ✅ |
| `extension.js` 中 info.json 路径为 `extension/tia/info.json` | ✅ |
| `tia/info.json` 存在 | ✅ |
| `tia/image/character/tia_tiya.png` 存在 | ✅ |
| 正式包 nihilphile武将包 未修改 | ✅ |
| 游戏 game/noname 未修改 | ✅ |

---

## 用户下一步

**复制这个目录到无名杀：**

```
F:\AI_project\nameless_game\nihilphile\tia\tia
      ↓ 复制到
<无名杀根目录>/resources/app/extension/tia
```

**不要**复制 `tia扩展包/`，那个目录名不匹配。

或进入 `tia/` 目录内，将内容打包为 ZIP 导入。

---

## 本轮修改 (2026-06-22 19:56)

### 修改文件

**`main/precontent.js`** — 3 处修复：

| # | 修改 | 旧 | 新 |
|---|------|-----|-----|
| 1 | push → add | `lib.group.push("xi")` | `lib.group.add("xi")` |
| 2 | key 名修正 | `lib.translate.xi_character_config` | `lib.translate.xi_config` |
| 3 | 新增 short | (无) | `lib.translate.xi_short = "西"` |

### 验证

- ✅ `node --check` 通过：precontent.js, extension.js, character/index.js, character/skill.js
- ✅ `grep -rn "lib.group.push"` — 无残留
- ✅ `grep -rn "xi_character_config"` — 无残留
- ✅ 技能逻辑未修改
- ✅ 正式包 / staging 未修改

### README.md

未涉及需更新内容。README 中关于 xi 势力的描述已为概括性声明，不引用具体 API 调用方式。

---

## 前轮创建 (2026-06-22 19:49)

### 创建的目录结构

```
F:\AI_project\nameless_game\nihilphile\tia\tia扩展包\
├── extension.js                    ✅ 扩展入口 (connect: true)
├── info.json                       ✅ 扩展元信息 (connect: true, valid JSON)
├── README.md                       ✅ 用户安装与风险说明
├── result.md                       ✅ 本文件
├── main/
│   ├── precontent.js               ✅ 注册 xi 势力 + import character
│   └── content.js                  ✅ 空钩子
├── character/
│   ├── index.js                    ✅ game.import("character") (connect: true)
│   ├── character.js                ✅ 武将数据 (tia_tiya, img: extension/tia/...)
│   ├── skill.js                    ✅ 枪礼/荣光/悼舞 完整实现
│   ├── translate.js                ✅ 武将/技能翻译
│   ├── sort.js                     ✅ 空模块
│   ├── card.js                     ✅ 空模块
│   ├── characterFilter.js          ✅ 空模块
│   ├── dynamicTranslate.js         ✅ 空模块
│   ├── intro.js                    ✅ 空模块
│   ├── pinyin.js                   ✅ 空模块
│   └── voices.js                   ✅ 空模块
└── image/
    └── character/
        └── tia_tiya.png            ✅ 头像 (3,007 KB, 从源文件复制)
```

---

## 2. 语法验证结果

所有 14 个 JavaScript 文件通过 `node --check`：

| 文件 | node --check |
|------|:---:|
| extension.js | ✅ |
| main/precontent.js | ✅ |
| main/content.js | ✅ |
| character/index.js | ✅ |
| character/character.js | ✅ |
| character/skill.js | ✅ |
| character/translate.js | ✅ |
| character/sort.js | ✅ |
| character/card.js | ✅ |
| character/characterFilter.js | ✅ |
| character/dynamicTranslate.js | ✅ |
| character/intro.js | ✅ |
| character/pinyin.js | ✅ |
| character/voices.js | ✅ |

`info.json` 通过 `JSON.parse` 验证。

---

## 3. 头像复制结果

- **源文件**: `D:\下载\新UI..黑纱鸣礼.缇娅 (17).png` — **未修改**
- **目标文件**: `F:\AI_project\nameless_game\nihilphile\tia\tia扩展包\image\character\tia_tiya.png` — **复制成功** (3,007,118 bytes)
- **character.js img 路径**: `extension/tia/image/character/tia_tiya.png`
- **注意**: 使用 `.png` 格式。若游戏框架要求 `.jpg`，需转换并更新 character.js。

---

## 4. Import/Export 路径检查

| 文件 | import 来源 | 相对路径 |
|------|-----------|---------|
| extension.js | `./main/content.js` | ✅ |
| extension.js | `./main/precontent.js` | ✅ |
| main/precontent.js | `../character/index.js` | ✅ |
| character/index.js | `./character.js` | ✅ |
| character/index.js | `./card.js` | ✅ |
| character/index.js | `./pinyin.js` | ✅ |
| character/index.js | `./skill.js` | ✅ |
| character/index.js | `./translate.js` | ✅ |
| character/index.js | `./intro.js` | ✅ |
| character/index.js | `./characterFilter.js` | ✅ |
| character/index.js | `./dynamicTranslate.js` | ✅ |
| character/index.js | `./voices.js` | ✅ |
| character/index.js | `./sort.js` | ✅ |

所有 import 均使用正确的相对路径。

---

## 5. connect: true 检查

| 文件 | 位置 | 状态 |
|------|------|:---:|
| extension.js | `extensionPackage.connect = true` | ✅ |
| info.json | `"connect": true` | ✅ |
| character/index.js | `game.import("character", fn)` 返回 `connect: true` | ✅ |

三处 connect: true 齐全。

---

## 6. 用户实测注意事项

### 安装

将 `tia扩展包` 目录**重命名为 `tia`**，放入：
```
<无名杀根目录>/resources/app/extension/tia/
```

或打 ZIP 导入。

### 启动前确认

1. 在游戏内扩展管理中启用"黑纱鸣礼·缇娅"
2. 检查选将界面是否出现缇娅（xi 势力，3 血女）
3. 检查头像是否正常显示

### 关键 Runtime 验证项（HIGH RISK）

1. **荣光 position: "x"** — 出牌阶段从 expansion 选弹药是否生效
2. **枪礼 useCard2 targets=[]** — 杀/酒改摸牌是否正常，不触发目标相关技能副作用
3. **荣光 useCardToEnd 循环** — 额外结算 effectCount++ 是否正确进入下一轮
4. **荣光 customArgs.unhurt** — 累计点数超限时是否正确抵消伤害
5. **悼舞 loseAfter 收集** — 转化牌被其他技能收走时的行为

### 已知设计保留项

- **xi 势力颜色未设置**: 仅注册 `lib.translate.xi = "西"`，未设置 `lib.groupnature.xi`（颜色）。可在 precontent.js 中按需添加。
- **intro.js 空**: 未填写武将引言。
- **pinyin.js 空**: 拼音由游戏自动生成，一般不需要手动填写。
- **头像 PNG 格式**: 如游戏要求 JPG，需转换。

---

## 7. 与 Staging 源文件的关系

- **Staging 文件**（`tia/character.js`, `tia/skill.js`, `tia/translate.js`）**未修改**
- **拓展包内** `character/skill.js` 与 staging `skill.js` 内容一致（仅文件头 import 保持）
- **拓展包内** `character/character.js` 修改了 img 路径（`extension/nihilphile/...` → `extension/tia/...`）
- **正式包**（`nihilphile武将包/`）**未修改**

---

## 8. 修改范围

仅限 `F:\AI_project\nameless_game\nihilphile\tia\tia扩展包\` 目录内。
未修改：
- `F:\AI_project\nameless_game\nihilphile\nihilphile武将包\`
- `F:\AI_project\nameless_game\game\noname\`
- Staging 源文件
