const fs = require('fs');
const path = require('path');

async function testFix() {
    console.log("🚀 Starting verification of Handoff Timing Fix...");

    // Mock handoff object
    const handoff = {
        id: 'test_handoff_' + Date.now(),
        toAgent: 'chroma',
        fromAgent: 'system',
        task: 'Verification task'
    };

    const DEFAULT_OUTPUT_DIR = '/Volumes/MiDRIVE/Chroma-Team/output';
    const outputPath = path.join(DEFAULT_OUTPUT_DIR, 'handoffs', handoff.id);

    // Mock the verification function from server.js
    async function ensureDeliverablesReady(handoff, maxRetries = 3) {
        console.log(`🔍 Verifying deliverables in ${outputPath}...`);
        for (let i = 0; i < maxRetries; i++) {
            if (fs.existsSync(outputPath)) {
                const files = fs.readdirSync(outputPath).filter(f => !f.startsWith('.'));
                if (files.length > 0) {
                    console.log(`   ✅ Verified: Found ${files.length} file(s) in output directory.`);
                    return true;
                }
            }
            console.log(`   ⏳ Attempt ${i + 1}/${maxRetries}: No files found yet, waiting...`);
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`   ⚠️ Verification timed out.`);
        return false;
    }

    // Scenario 1: Files arrive after a delay
    console.log("\n--- Scenario 1: Delayed File Arrival ---");
    setTimeout(() => {
        if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        fs.writeFileSync(path.join(outputPath, 'test.md'), '# Test Deliverable');
        console.log("   (Background: File created on disk)");
    }, 3000);

    const result = await ensureDeliverablesReady(handoff);
    console.log(`Result: ${result ? "PASS" : "FAIL"}`);

    // Cleanup
    if (fs.existsSync(outputPath)) {
        fs.readdirSync(outputPath).forEach(f => fs.unlinkSync(path.join(outputPath, f)));
        fs.rmdirSync(outputPath);
    }

    // Scenario 2: Verification times out
    console.log("\n--- Scenario 2: No Files Appear (Timeout) ---");
    const result2 = await ensureDeliverablesReady(handoff, 2);
    console.log(`Result (Expect false/warning): ${result2 ? "FAIL (should have timed out)" : "PASS (timed out as expected)"}`);

    console.log("\n✅ Verification script complete.");
}

testFix().catch(console.error);
