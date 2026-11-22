# tiny-stack-vm

A tiny stack VM for make.fun's tiny-stack-vm-01 bounty. Run `node main.ts`:
it reads each `<id>/program.bin` + `<id>/input.bin` under `$MAKEFUN_INPUT_DIR`
(default `/input`) and writes `<id>/stdout.bin` + `<id>/exit.txt` under
`$MAKEFUN_OUTPUT_DIR` (default `/output`). ISA v1, 1,000,000 on the practice set.
