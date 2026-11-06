(function () {
    var MARK = "nihil_longyou";
    var QIANLIN = "zus_qianlin_bonus";

    window.nihilLongyouHp = {
        install: function (lib, game, ui, get, ai, _status) {
            if (lib.nihilLongyouHp) return lib.nihilLongyouHp;
            var proto = lib.element.Player.prototype;
            var creditOnly = new WeakSet();
            var rendering = new WeakSet();

            function count(player) { return player.countMark(MARK); }
            function temporary(player) { return player.storage[QIANLIN] || 0; }
            function ceiling(player) { return player.maxHp + count(player) + temporary(player); }
            function active(player) {
                return !player.storage.nohp && game.hasPlayer(function (owner) { return owner.hasSkill("nihil_shengyu"); });
            }
            function credits(player, action) {
                var nested = creditOnly.has(player);
                creditOnly.add(player);
                try { action(); }
                finally { if (!nested) creditOnly.delete(player); }
            }
            function beforeChange(player, num, parent) {
                if (num < 0 && count(player) > 0) {
                    credits(player, function () { player.removeMark(MARK, Math.min(-num, count(player))); });
                } else if (num > 0 && parent.name === "recover" && active(player)) {
                    var excess = num - Math.max(0, player.maxHp - player.hp);
                    if (excess > 0) {
                        player.addSkill(MARK);
                        credits(player, function () { player.addMark(MARK, excess); });
                    }
                }
            }
            function render(player) {
                var hp = player.node && player.node.hp;
                if (!hp || typeof hp.querySelectorAll !== "function") return;
                hp.querySelectorAll(".nihil-longyou-jade, .nihil-longyou-total").forEach(function (node) { node.remove(); });
                if (window.ZusQianlinUI) window.ZusQianlinUI.render(player);
                var amount = count(player);
                var hidden = player.classList && (player.classList.contains("unseen_show") || player.classList.contains("unseen2_show"));
                if (!amount || player.storage.nohp || hidden) {
                    if (hp.dataset.nihilLongyou) {
                        delete hp.dataset.nihilLongyou;
                        hp.removeAttribute("title");
                    }
                    return;
                }
                var base = player.hp - amount - temporary(player);
                hp.dataset.nihilLongyou = String(amount);
                hp.title = "当前体力 " + player.hp + " / 体力上限 " + player.maxHp +
                    "；基础体力 " + base + "；龙佑 +" + amount + (temporary(player) ? "；潜鳞 +" + temporary(player) : "");
                if (player.maxHp > 5) {
                    var label = hp.ownerDocument.createElement("span");
                    label.className = "nihil-longyou-total";
                    label.textContent = "+" + amount + "佑";
                    label.style.cssText = "display:block;color:#85ffdc;font-size:12px;text-shadow:0 0 4px #006b54";
                    hp.appendChild(label);
                    return;
                }
                var native = Array.from(hp.children).filter(function (node) { return !node.classList.contains("zus-temp-jade"); });
                native.slice(0, Math.max(0, player.maxHp)).forEach(function (node, index) {
                    var position = get.is.newLayout() ? player.maxHp - index - 1 : index;
                    node.classList.toggle("lost", position >= Math.max(0, base));
                });
                for (var index = 0; index < Math.min(amount, 8); index++) {
                    var jade = hp.ownerDocument.createElement("div");
                    jade.className = "nihil-longyou-jade";
                    jade.title = "龙佑体力：参与当前体力计算，不增加体力上限";
                    jade.style.cssText = "background:linear-gradient(135deg,#e6fff5,#75edc5 50%,#14866b)!important;border:1px solid #d2ffec;box-shadow:0 0 5px #5bffd1;border-radius:70% 30% 65% 35%;transform:rotate(-25deg)";
                    hp.appendChild(jade);
                }
                if (amount > 8) {
                    var more = hp.ownerDocument.createElement("span");
                    more.className = "nihil-longyou-total";
                    more.textContent = "佑×" + amount;
                    more.style.cssText = "color:#85ffdc;font-size:12px;text-shadow:0 0 4px #006b54";
                    hp.appendChild(more);
                }
            }
            function compile(source) {
                if (!/^\s*(async\s+)?function\b/.test(source)) source = source.replace(/^(async\s+)?/, "$1function ");
                return Function("lib", "game", "ui", "get", "ai", "_status", "return (" + source + ");")(lib, game, ui, get, ai, _status);
            }
            function rewrite(name, changes) {
                var source = lib.element.content[name].toString();
                changes.forEach(function (change) {
                    if (!change[0].test(source)) throw new Error("龙佑：不兼容的体力处理函数 " + name);
                    source = source.replace(change[0], change[1]);
                });
                return compile(source);
            }
            var hpGuard = /if\s*\(player\.hp\s*>\s*player\.maxHp(?:\s*\+\s*\(player\.storage\.zus_qianlin_bonus\s*\|\|\s*0\))?\)\s*\{\s*player\.hp\s*=\s*player\.maxHp(?:\s*\+\s*\(player\.storage\.zus_qianlin_bonus\s*\|\|\s*0\))?;\s*\}/;
            var recoverGuard = /if\s*\(num\s*>\s*player\.maxHp\s*-\s*player\.hp\)\s*\{\s*num\s*=\s*player\.maxHp\s*-\s*player\.hp;\s*event\.num\s*=\s*num;\s*\}/;
            var changeHp = rewrite("changeHp", [
                [hpGuard, "if (player.hp > lib.nihilLongyouHp.ceiling(player)) { player.hp = lib.nihilLongyouHp.ceiling(player); }"],
                [/num\s*=\s*event\.num;\s*player\.hp\s*\+=\s*num;/, "num = event.num; lib.nihilLongyouHp.beforeChange(player, num, event.getParent()); player.hp += num;"],
            ]);
            var recover = rewrite("recover", [[recoverGuard, "if (!lib.nihilLongyouHp.active(player)) { $& }"]]);
            var loseMaxHp = rewrite("loseMaxHp", [[/event\.loseHp\s*=\s*Math\.max\(0,\s*player\.hp\s*-\s*player\.maxHp\);/,
                "event.loseHp = Math.max(0, player.hp - lib.nihilLongyouHp.ceiling(player));"]]);
            lib.nihilLongyouHp = { ceiling: ceiling, active: active, beforeChange: beforeChange, render: render };
            lib.element.content.changeHp = changeHp;
            lib.element.content.recover = recover;
            lib.element.content.loseMaxHp = loseMaxHp;

            ["addMark", "removeMark"].forEach(function (name) {
                var original = proto[name];
                proto[name] = function (key) {
                    var before = key === MARK ? count(this) : 0;
                    var result = original.apply(this, arguments);
                    if (key === MARK && !creditOnly.has(this)) {
                        var delta = count(this) - before;
                        this.hp += delta;
                        this.update();
                        if (delta < 0 && this.isIn() && this.hp <= 0) this.dying();
                    }
                    return result;
                };
            });
            ["update", "$update"].forEach(function (name) {
                var original = proto[name];
                proto[name] = function () {
                    if (rendering.has(this)) return original.apply(this, arguments);
                    var bonus = count(this) + temporary(this);
                    if (!bonus || this.hp <= this.maxHp) {
                        var result = original.apply(this, arguments);
                        render(this);
                        return result;
                    }
                    var descriptor = Object.getOwnPropertyDescriptor(this, "hp");
                    var effective = Math.min(this.hp, ceiling(this));
                    var observed = effective;
                    rendering.add(this);
                    Object.defineProperty(this, "hp", { configurable: true, enumerable: true,
                        get: function () { return effective; },
                        set: function (value) { if (!(value === this.maxHp && effective > this.maxHp)) effective = value; },
                    });
                    try {
                        var result = original.apply(this, arguments);
                        observed = this.hp;
                        return result;
                    } finally {
                        rendering.delete(this);
                        Object.defineProperty(this, "hp", descriptor && "value" in descriptor ?
                            Object.assign({}, descriptor, { value: effective }) : { configurable: true, enumerable: true, writable: true, value: effective });
                        if (name === "update" && observed !== effective) {
                            game.broadcast(function (player, hp) { player.hp = hp; player.$update(); }, this, effective);
                        }
                        render(this);
                    }
                };
            });
            // This shared ceiling also supplies Qianlin's HP support when Zus loads later.
            lib.zusQianlinHpSupport = true;
            return lib.nihilLongyouHp;
        },
    };
})();
