# 普通 `content` 闭包丢失：StepCompiler 常见陷阱

> 适用版本：无名杀子琪懒人包 v1.11.3  
> 记录日期：2026-09-14  
> 典型症状：`ReferenceError: <模块局部函数> is not defined`

## 一句话结论

扩展模块中的普通同步 `content()` 不会按原函数直接执行。v1.11.3 会把它交给 StepCompiler，抽出函数体后用新的函数构造器重新编译；新函数只得到引擎显式注入的变量，无法访问原 IIFE/模块闭包。

如果 `content` 需要调用模块局部 helper、读取模块局部常量或使用闭包状态，优先写成 `async content()`。AsyncCompiler 会保留原始函数对象及其词法闭包。

## 典型故障

下面的写法在直接单元测试中可能通过，但进入真实游戏后会报错：

```js
(function () {
    function setCommander(player) {
        // 模块局部 helper
    }

    var skills = {
        my_skill: {
            content(event, trigger, player) {
                setCommander(player);
            },
        },
    };
})();
```

典型错误：

```text
ReferenceError: setCommander is not defined
    at GameEvent.eval (.../GameEvent/compilers/StepCompiler...)
```

堆栈中的 `StepCompiler` 行号通常指向重新生成的函数，而不是扩展源文件的真实出错行。先检查该技能的 `content` 是否为普通函数，以及它是否引用了模块局部符号。

## 根因证据

目标版本中的执行链如下：

1. `GameEvent.setContent()` 把技能内容交给统一编译器：`noname/library/element/gameEvent.js:54-60`。
2. ContentCompiler 按注册顺序选择 ArrayCompiler、AsyncCompiler 或 StepCompiler：`noname/library/element/GameEvent/compilers/ContentCompiler.js:55-82`。
3. StepCompiler 接受普通函数，但排除异步函数、生成器和异步生成器：`StepCompiler.js:14-24`。
4. StepCompiler 抽出原函数体，再通过新的函数构造器生成执行函数：`StepCompiler.js:79-96`。
5. 新函数只显式注入：
   - `event` 中的 `step/source/target/targets/card/cards/skill/forced/num/result`；
   - `_status/lib/game/ui/get/ai` 六个顶层对象。
6. 模块局部的 `setCommander`、常量、缓存或其他 helper 不在注入列表里，所以重编译后变为未定义标识符。

这不是调用时 `this` 丢失，也不是扩展加载顺序问题。只要标识符仅存在于原函数的词法闭包中，重新构造函数后就无法访问。

## 推荐修复

### 方案 A：改为异步 `content`（首选）

```js
(function () {
    function setCommander(player) {
        // 模块局部 helper
    }

    var skills = {
        my_skill: {
            async content(event, trigger, player) {
                setCommander(player);
            },
        },
    };
})();
```

即使内容里暂时没有 `await`，`async` 仍有意义：它让函数由 AsyncCompiler 处理。AsyncCompiler 把原函数放入数组，ArrayCompiler 再直接调用原始函数对象，因此闭包仍然存在：

- `AsyncCompiler.js:5-11`
- `ArrayCompiler.js:12-31`

适用条件：该 `content` 已经是单段逻辑，或能够用 `async/await` 表达。

### 方案 B：普通 `content` 只使用注入变量

若必须保留普通/旧式 step `content`，函数体必须自包含，只访问 `event` 解构变量、`player/trigger` 和 `_status/lib/game/ui/get/ai`。

需要共享 helper 时，可把它注册到引擎可访问对象，再通过注入的 `lib` 查找：

```js
var skills = {
    my_skill: {
        _setCommander(player) {
            // helper
        },
        content(event, trigger, player) {
            lib.skill.my_skill._setCommander(player);
        },
    },
};
```

前提是技能已合并进 `lib.skill`，且 helper 不再反向依赖不可见的模块闭包。此方案接口暴露更多，通常不如方案 A 简洁。

### 方案 C：彻底把逻辑内联

逻辑很短且只用注入变量时，可以内联。但不要为了绕过编译器复制一大段复杂规则；重复实现会制造新的不一致。

## 不能机械处理的情况

### 旧式 `"step 0"` 内容

若普通 `content` 使用：

```js
content() {
    "step 0";
    // ...
    "step 1";
    // ...
}
```

不要只加一个 `async`。应选择：

- 把完整流程改写为真正的 `async/await`；或
- 保留 StepCompiler，但移除对模块闭包的依赖。

否则 step 标签只会成为普通字符串，原来的分步暂停语义会改变。

### `filter`、`getIndex`、`logTarget` 与 AI 回调

不要因为 `content` 要改成异步，就把这些同步回调一起改成异步。

在 v1.11.3 中：

- `filter` 由引擎直接调用：`noname/library/index.js:10733-10735,10809-10810`；
- `getIndex` 由触发器直接调用：`noname/library/element/gameEvent.js:338-355`；
- `logTarget` 由技能结算直接调用：`noname/library/element/content.js:3577-3584,3643-3651`。

它们需要立即返回布尔值、索引、目标或评分。改成异步函数会返回 Promise，反而破坏接口契约。

由异步 `content` 创建的 `chooseTarget/chooseCard/chooseToRespond` 回调也不会因为 `content` 的编译方式自动变成异步；仍应按对应选择接口同步返回。

## 为什么普通单元测试会漏报

下面的测试无法发现此问题：

```js
await skills.my_skill.content({}, trigger, player);
```

它直接调用模块加载后保存的原函数，所以词法闭包完整。真实游戏则先执行 `compiler.compile(content)`，两条路径并不相同。

至少增加以下一道防线：

1. **静态约束**：凡是引用模块局部 helper 的技能 `content`，断言其构造器为 `AsyncFunction`。
2. **编译回归夹具**：模拟 v1.11.3 StepCompiler 的“抽取函数体 + 新构造器 + 只注入 topVars”，证明普通函数会丢闭包，修复后的技能走异步路径。
3. **真实加载验收**：游戏内实际触发技能一次；仅 `node --check` 和直接 VM 调用不等于加载成功。

本仓库的回归示例：

```text
tests/huojing_stepcompiler_regression.js
```

该测试在修复前稳定得到：

```text
ReferenceError: setCommander is not defined
```

修复后会检查霍旌所有带 `content` 的技能均为 `AsyncFunction`，再按 AsyncCompiler/ArrayCompiler 的参数顺序执行初始化技能。

## 提交前检查清单

- [ ] 搜索本模块的所有 `content(`，区分普通、异步和旧式 step 内容。
- [ ] 普通 `content` 是否引用了 IIFE/模块局部函数、常量或状态？
- [ ] 若改成 `async content`，是否仍残留依赖 step 标签的流程？
- [ ] `filter/getIndex/logTarget/AI` 是否仍同步返回？
- [ ] 测试是否覆盖真实的编译选择，而非只直接调用原函数？
- [ ] 是否在目标无名杀版本中实际触发过技能？

## 版本边界

本文结论锁定无名杀 v1.11.3。升级后应重新核对：

- ContentCompiler 的编译器注册顺序；
- StepCompiler 的函数筛选与注入变量；
- AsyncCompiler 是否仍保留原函数对象；
- filter/getIndex/logTarget 的调用方式。

不要把“加上 `async` 永远安全”外推到未核实的其他版本。
