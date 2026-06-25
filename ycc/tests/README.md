# Tests

This directory stores 御承宸-specific test plans, wrappers, and notes.

Prefer using `tools/noname-test-cli` as the game control layer. Keep reusable test
logic here only when it is specific to this custom general.

Initial focus:

1. Baseline load: both clients or local online mode see `ycc_yuchengchen`.
2. 【皇命】 runtime: forced fixed target, no cancel path, distance ignored.
3. 【皇命】 remote interaction: guest-side choices and synchronization.
4. 【龙殛】 card show, expansion custody, and phase-end return.
5. 【御策】 and 【亲征】 state transitions.

