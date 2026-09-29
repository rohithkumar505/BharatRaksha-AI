/**
 * Integration test — run with: npx tsx scripts/test-flow.ts
 * Requires Docker services running and db seeded.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { uploadEvidenceFile } from "../apps/web/src/lib/s3";
import { processEvidence } from "../apps/web/src/lib/ingestion";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Bharat Raksha AI Integration Test ===\n");

  const investigator = await prisma.user.findUnique({
    where: { email: "investigator@bharatraksha.gov.in" },
  });
  if (!investigator) throw new Error("Run npm run db:seed first");

  const year = new Date().getFullYear();
  const count = await prisma.case.count();
  const caseNumber = `CASE-${year}-TEST-${count + 1}`;

  const testCase = await prisma.case.create({
    data: {
      caseNumber,
      crimeType: "Cyber Financial Fraud",
      location: "Bengaluru",
      priority: "HIGH",
      status: "UNDER_INVESTIGATION",
      investigatingOfficerId: investigator.id,
      description: "Integration test case",
    },
  });
  console.log(`✓ Created case: ${testCase.caseNumber}`);

  const testdataDir = join(process.cwd(), "testdata");
  const files = [
    { name: "sample_fir.txt", type: "FIR" as const },
    { name: "sample_cdr.csv", type: "CDR" as const },
    { name: "sample_transactions.csv", type: "BANK_TXN" as const },
  ];

  for (const file of files) {
    const buffer = readFileSync(join(testdataDir, file.name));
    const key = `${testCase.id}/${uuidv4()}-${file.name}`;
    const { path, sha256 } = await uploadEvidenceFile(key, buffer, "text/plain");

    const evidence = await prisma.evidence.create({
      data: {
        caseId: testCase.id,
        type: file.type,
        fileName: file.name,
        filePath: path,
        fileSize: buffer.length,
        mimeType: "text/plain",
        sha256Hash: sha256,
        uploadedById: investigator.id,
        ingestionStatus: "PENDING",
      },
    });

    const job = await prisma.ingestionJob.create({
      data: { evidenceId: evidence.id, status: "PENDING" },
    });

    console.log(`  Processing ${file.name}...`);
    await processEvidence(evidence.id, job.id);
    console.log(`✓ Processed ${file.name}`);
  }

  const entities = await prisma.entity.count({ where: { caseId: testCase.id } });
  const relationships = await prisma.relationship.count({
    where: { sourceEntity: { caseId: testCase.id } },
  });
  const cdr = await prisma.cdrRecord.count({ where: { caseId: testCase.id } });
  const txns = await prisma.transaction.count({ where: { caseId: testCase.id } });
  const alerts = await prisma.alert.count({ where: { caseId: testCase.id } });

  console.log("\n=== Results ===");
  console.log(`Entities extracted: ${entities}`);
  console.log(`Relationships created: ${relationships}`);
  console.log(`CDR records: ${cdr}`);
  console.log(`Transactions: ${txns}`);
  console.log(`Alerts generated: ${alerts}`);
  console.log(`\nCase ID: ${testCase.id}`);
  console.log(`Open: http://localhost:3000/cases/${testCase.id}`);
  console.log("\n✓ Integration test PASSED");
}

main()
  .catch((e) => {
    console.error("✗ Test FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
