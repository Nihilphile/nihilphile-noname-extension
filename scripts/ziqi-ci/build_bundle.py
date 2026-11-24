"""Adapt a legacy extension to a room-loadable browser module."""
import json


def build_bundle(directory, name, target, asset_name=None):
    source = (directory / "extension.js").read_text()
    if asset_name:
        # The native launcher passes an extension directory to its factory.
        declaration = 'const EXT_NAME = (_status && _status.extension) || EXT_DISPLAY_NAME;'
        if source.count(declaration) != 1:
            raise ValueError("Cannot pin Nihil asset directory")
        source = source.replace(declaration, 'const EXT_NAME = ' + json.dumps(asset_name) + ';')
    source = source.replace('game.import("extension",', 'defineExtension(')
    source = source.replace('lib.init.jsSync', 'loadScript')
    parts = ['export function install(env, loadCharacter) {',
             'const {lib, game, ui, get, ai, _status} = env;',
             'const args = [lib, game, ui, get, ai, _status];',
             'let extension, pack;',
             'const defineExtension = factory => { extension = factory(...args); };',
             'const defineCharacter = factory => { pack = factory(...args); };',
             'const scripts = new Map();']
    for subdir in ["core", "ai", "module", "character"]:
        for file in sorted((directory / subdir).rglob("*.js")):
            key = file.relative_to(directory).with_suffix('').as_posix()
            code = file.read_text()
            if key == 'character/index':
                code = code.replace('game.import("character",', 'defineCharacter(')
            parts.extend([f'scripts.set({json.dumps(key)}, function () {{', code, '});'])
    parts.extend([
        'function loadScript(dir, file) {',
        f' const key = dir.slice((lib.assetURL + "extension/{asset_name or name}/").length) + "/" + file;',
        ' scripts.get(key)();',
        '}', source, 'extension.precontent();',
        'loadCharacter(pack);',
        'extension.arenaReady?.();',
        'return pack;',
        '}',
    ])
    target.write_text('\n'.join(parts))
