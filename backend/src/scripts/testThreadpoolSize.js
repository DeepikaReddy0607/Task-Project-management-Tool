import { spawn } from "node:child_process";
import path from "node:path";

const sizes = [4, 16, 32, 64];

async function testSize(size) {
    const code = `
        import bcrypt from "bcrypt";
        const t0 = process.hrtime.bigint();
        const promises = Array.from({ length: 24 }, (_, i) => 
            bcrypt.hash("Password123!", 10)
        );
        await Promise.all(promises);
        const t1 = process.hrtime.bigint();
        const ms = Number(t1 - t0) / 1_000_000;
        console.log(ms.toFixed(2));
    `;

    return new Promise((resolve) => {
        const proc = spawn("node", ["--input-type=module", "-e", code], {
            cwd: path.resolve(process.cwd().endsWith("backend") ? process.cwd() : "backend"),
            env: { ...process.env, UV_THREADPOOL_SIZE: String(size) }
        });
        let out = "";
        let err = "";
        proc.stdout.on("data", (d) => { out += d.toString(); });
        proc.stderr.on("data", (d) => { err += d.toString(); });
        proc.on("close", (code) => {
            if (code !== 0) console.error("Error for size " + size + ": " + err);
            resolve(parseFloat(out.trim()) || 0);
        });
    });
}

async function main() {
    console.log("================================================================================");
    console.log("EVALUATION OF UV_THREADPOOL_SIZE ON 12-THREAD CPU (24 concurrent bcrypt hashes)");
    console.log("================================================================================");
    for (const size of sizes) {
        // Run 2 iterations and average
        const r1 = await testSize(size);
        const r2 = await testSize(size);
        const avg = ((r1 + r2) / 2).toFixed(2);
        console.log(`  - UV_THREADPOOL_SIZE = ${String(size).padEnd(2)}: Run 1: ${r1}ms | Run 2: ${r2}ms | Avg: ${avg}ms`);
    }
}

main().catch(console.error);
