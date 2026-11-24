module.exports = {
    character: {
        effect_plain_blank: ['male', 'qun', 4, []],
        effect_actor_blank: ['male', 'qun', 4, ['effect_actor_penalty']],
        effect_retaliation_blank: ['male', 'qun', 4, ['effect_target_retaliation']],
    },
    skill: {
        effect_actor_penalty: {ai:{effect:{player_use(card) { if(card.name === 'sha') return [1,-4]; }}}},
        effect_target_retaliation: {ai:{effect:{target_use(card) { if(card.name === 'sha') return [1,0,1,-4]; }}}},
    },
};
