import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Tiny stack VM (ISA v1). For each <id> under the input dir it runs
// <id>/program.bin on <id>/input.bin, writing <id>/stdout.bin (the bytes
// the program wrote) and <id>/exit.txt (its exit code, 0-255).
const inDir = process.env.MAKEFUN_INPUT_DIR || "/input";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

function runVM(prog, input) {
  const mem = new Int32Array(256);
  const stack = new Int32Array(256);
  const calls = new Int32Array(64);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, ip = 0, olen = 0, steps = 0;
  const plen = prog.length;
  const done = (c) => ({ out: out.subarray(0, olen), exit: c });
  for (;;) {
    if (steps >= 1000000) return done(10);
    if (pc < 0 || pc >= plen) return done(9);
    const op = prog[pc];
    switch (op) {
      case 0x00: return done(0);
      case 0x01:
        if (pc + 1 >= plen) return done(9);
        if (sp >= 256) return done(3);
        stack[sp++] = (prog[pc + 1] << 24) >> 24;
        pc += 2;
        break;
      case 0x02:
        if (pc + 4 >= plen) return done(9);
        if (sp >= 256) return done(3);
        stack[sp++] = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24);
        pc += 5;
        break;
      case 0x03:
        if (sp < 1) return done(2);
        sp--; pc++;
        break;
      case 0x04:
        if (sp < 1) return done(2);
        if (sp >= 256) return done(3);
        stack[sp] = stack[sp - 1]; sp++; pc++;
        break;
      case 0x05: {
        if (sp < 2) return done(2);
        const t = stack[sp - 1];
        stack[sp - 1] = stack[sp - 2]; stack[sp - 2] = t;
        pc++;
        break;
      }
      case 0x06:
        if (sp < 2) return done(2);
        if (sp >= 256) return done(3);
        stack[sp] = stack[sp - 2]; sp++; pc++;
        break;
      case 0x07: {
        if (sp < 3) return done(2);
        const a = stack[sp - 3], b = stack[sp - 2], c = stack[sp - 1];
        stack[sp - 3] = b; stack[sp - 2] = c; stack[sp - 1] = a;
        pc++;
        break;
      }
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        if (sp < 2) return done(2);
        const b = stack[--sp], a = stack[sp - 1];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) return done(4); r = (a / b) | 0; }
        else if (op === 0x14) { if (!b) return done(4); r = a % b; }
        else if (op === 0x15) { if (!b) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (!b) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        stack[sp - 1] = r;
        pc++;
        break;
      }
      case 0x17:
        if (sp < 1) return done(2);
        stack[sp - 1] = (-stack[sp - 1]) | 0; pc++;
        break;
      case 0x1b:
        if (sp < 1) return done(2);
        stack[sp - 1] = ~stack[sp - 1]; pc++;
        break;
      case 0x30: {
        if (pc + 2 >= plen) return done(9);
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = pc + 3 + off;
        break;
      }
      case 0x31: {
        if (pc + 2 >= plen) return done(9);
        if (sp < 1) return done(2);
        const v = stack[--sp];
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = v === 0 ? pc + 3 + off : pc + 3;
        break;
      }
      case 0x32: {
        if (pc + 2 >= plen) return done(9);
        if (sp < 1) return done(2);
        const v = stack[--sp];
        const off = ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16;
        pc = v !== 0 ? pc + 3 + off : pc + 3;
        break;
      }
      case 0x33:
        if (pc + 2 >= plen) return done(9);
        if (cp >= 64) return done(7);
        calls[cp++] = pc + 3;
        pc = prog[pc + 1] | (prog[pc + 2] << 8);
        break;
      case 0x34:
        if (cp === 0) return done(8);
        pc = calls[--cp];
        break;
      case 0x40: {
        if (sp < 1) return done(2);
        const a = stack[sp - 1];
        if (a < 0 || a > 255) return done(6);
        stack[sp - 1] = mem[a];
        pc++;
        break;
      }
      case 0x41: {
        if (sp < 2) return done(2);
        const a = stack[sp - 1], v = stack[sp - 2];
        if (a < 0 || a > 255) return done(6);
        mem[a] = v; sp -= 2;
        pc++;
        break;
      }
      case 0x50: {
        if (sp < 1) return done(2);
        const s = String(stack[--sp]);
        if (olen + s.length > 65536) return done(11);
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        pc++;
        break;
      }
      case 0x51:
        if (sp < 1) return done(2);
        if (olen >= 65536) return done(11);
        out[olen++] = stack[--sp] & 255;
        pc++;
        break;
      case 0x52:
        if (sp >= 256) return done(3);
        stack[sp++] = ip < input.length ? input[ip++] : -1;
        pc++;
        break;
      case 0x53:
        if (sp < 1) return done(2);
        return done(stack[--sp] & 255);
      default:
        return done(5);
    }
    steps++;
  }
}

const ids = readdirSync(inDir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

for (const id of ids) {
  let prog, input;
  try {
    prog = new Uint8Array(readFileSync(join(inDir, id, "program.bin")));
    input = new Uint8Array(readFileSync(join(inDir, id, "input.bin")));
  } catch {
    prog = new Uint8Array(0);
    input = new Uint8Array(0);
  }
  let result;
  try {
    result = runVM(prog, input);
  } catch {
    result = { out: new Uint8Array(0), exit: 9 };
  }
  const od = join(outDir, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, "stdout.bin"), result.out);
  writeFileSync(join(od, "exit.txt"), result.exit + "\n");
}
