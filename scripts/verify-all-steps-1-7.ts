#!/usr/bin/env npx tsx
/**
 * Master verification — Steps 1 through 7
 * Run: APP_URL=http://localhost:3001 AI_SERVICE_URL=http://localhost:8001 npx tsx scripts/verify-all-steps-1-7.ts
 */
import { execSync } from "child_process";
import { join } from "path";

const BASE = process.env.APP_URL ?? "http://localhost:3001";
const AI = process.env.AI_SERVICE_URL ?? "http://localhost:8001";
const root = join(__dirname, "..");

const scripts = [
  { step: "1-2", file: "verify-step1-step2.ts" },
  { step: "3-4", file: "verify-step3-step4.ts" },
  { step: "5", file: "verify-step5-blockchain.ts" },
  { step: "6-7", file: "verify-step6-step7.ts" },
];

console.log(`\n╔══════════════════════════════════════════════════╗`);
console.log(`║  Bharat Raksha AI — Steps 1-7 Full Verification  ║`);
console.log(`╚══════════════════════════════════════════════════╝`);
console.log(`App: ${BASE} | AI: ${AI}\n`);

let totalPass = 0;
let totalFail = 0;

for (const { step, file } of scripts) {
  console.log(`\n─── Running Step ${step} ───\n`);
  try {
    const out = execSync(`npx tsx scripts/${file}`, {
      cwd: root,
      env: { ...process.env, APP_URL: BASE, AI_SERVICE_URL: AI },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(out);
    const passMatch = out.match(/(\d+)\/(\d+) passed/);
    if (passMatch) {
      totalPass += parseInt(passMatch[1], 10);
      const total = parseInt(passMatch[2], 10);
      if (passMatch[1] !== passMatch[2]) totalFail += total - parseInt(passMatch[1], 10);
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    console.error(`✗ Step ${step} FAILED`);
    process.exit(1);
  }
}

console.log(`\n╔══════════════════════════════════════════════════╗`);
console.log(`║  ALL STEPS 1-7 PASSED — ${totalPass} checks total${" ".repeat(Math.max(0, 15 - String(totalPass).length))}║`);
console.log(`╚══════════════════════════════════════════════════╝\n`);
