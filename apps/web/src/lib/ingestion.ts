import { prisma, EntityType, EvidenceType, Prisma } from "./db";
import { downloadEvidenceFile } from "./s3";
import { extractEntitiesFromText, ocrDocument } from "./ai-client";
import { getOrCreateEntity, findAndCreateEntityMatches } from "./entity-resolution";
import { syncEntityToNeo4j, syncRelationshipToNeo4j } from "./neo4j-sync";
import { normalizePhone } from "./normalize";
import { fuseCrossSourceIdentities } from "./data-fusion";
import { createCdrAlerts } from "./cdr-intelligence";
import { createFinancialAlerts } from "./financial-intelligence";
import { encryptPii } from "./pii-crypto";
import { runPostIngestionAlerts } from "./alert-engine";
import { csvToObjects, pickField } from "./csv-parser";

async function updateJobProgress(jobId: string, progress: number) {
  await prisma.ingestionJob.update({ where: { id: jobId }, data: { progress } });
}

const ENTITY_TYPE_MAP: Record<string, EntityType> = {
  PERSON: "PERSON",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
  UPI: "UPI",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  IFSC: "IFSC",
  VEHICLE: "VEHICLE",
  ADDRESS: "ADDRESS",
  LOCATION: "LOCATION",
  ORGANIZATION: "ORGANIZATION",
  SOCIAL_HANDLE: "SOCIAL_HANDLE",
  IP_ADDRESS: "IP_ADDRESS",
  DOMAIN: "DOMAIN",
  CRYPTO_WALLET: "CRYPTO_WALLET",
  AMOUNT: "AMOUNT",
  DATE: "DATE",
  CASE_ID: "CASE_ID",
  DEVICE: "DEVICE",
};

export async function processEvidence(evidenceId: string, jobId: string) {
  const existingJob = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (existingJob?.status === "COMPLETED") {
    return { skipped: true, reason: "already_completed" };
  }

  const claimed = await prisma.ingestionJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING", startedAt: new Date(), progress: 5 },
  });
  if (claimed.count === 0) {
    if (existingJob?.status === "PROCESSING") {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const current = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
        if (current?.status === "COMPLETED") return { skipped: true, reason: "already_completed" };
        if (current?.status === "FAILED") throw new Error(current.error ?? "Ingestion failed");
      }
      throw new Error("Ingestion timed out while waiting for worker");
    }
    // COMPLETED is already handled at the top of processEvidence; remaining
    // non-claimable states are PENDING/FAILED races or unknown.
    return { skipped: true, reason: "not_claimable" };
  }

  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: { case: true },
  });
  if (!evidence) throw new Error("Evidence not found");

  await prisma.evidence.update({
    where: { id: evidenceId },
    data: { ingestionStatus: "PROCESSING" },
  });

  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { progress: 10 },
  });

  try {
    const buffer = await downloadEvidenceFile(evidence.filePath);

    let result: Record<string, unknown> = {};

    switch (evidence.type) {
      case "FIR":
      case "SURVEILLANCE":
      case "OTHER":
        result = await processFirDocument(evidence, buffer);
        break;
      case "CDR":
        result = await processCdrCsv(evidence, buffer, jobId);
        break;
      case "BANK_TXN":
        result = await processTransactionCsv(evidence, buffer);
        break;
      case "VEHICLE":
        result = await processVehicleCsv(evidence, buffer);
        break;
      case "EMAIL":
        result = await processEmailCsv(evidence, buffer);
        break;
      case "TOWER":
        result = await processTowerCsv(evidence, buffer);
        break;
      default:
        result = await processFirDocument(evidence, buffer);
    }

    const matchCount = await findAndCreateEntityMatches(evidence.caseId);
    await detectCrossCaseLinks(evidence.caseId);
    await updateJobProgress(jobId, 90);
    const fusionLinks = await fuseCrossSourceIdentities(evidence.caseId);
    result = { ...result, entityMatchesFound: matchCount, fusionLinksCreated: fusionLinks };

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        completedAt: new Date(),
        result: result as Prisma.InputJsonValue,
      },
    });
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: { ingestionStatus: "COMPLETED", processedAt: new Date() },
    });

    try {
      const { indexCaseKnowledge } = await import("./copilot-rag");
      await indexCaseKnowledge(evidence.caseId);
    } catch {
      // RAG index optional on ingest failure
    }

    try {
      await runPostIngestionAlerts(evidence.caseId);
    } catch (err) {
      console.warn("Post-ingestion alerts:", err);
    }

    try {
      const { enrichLegalDocumentAfterIngest } = await import("./legal-automation");
      await enrichLegalDocumentAfterIngest(evidenceId, jobId);
    } catch (err) {
      console.warn("Legal document enrich:", err);
    }

    // Additive AI Autopilot — playbook extras; never fails the ingest job
    try {
      const { runInvestigationAutopilot } = await import("./investigation-autopilot");
      await runInvestigationAutopilot(evidence.caseId);
    } catch (err) {
      console.warn("Investigation autopilot:", err);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: { ingestionStatus: "FAILED", ingestionError: message },
    });
    throw error;
  }
}

async function processFirDocument(
  evidence: { id: string; caseId: string; mimeType: string },
  buffer: Buffer
) {
  let text: string;
  if (
    evidence.mimeType === "application/pdf" ||
    evidence.mimeType.startsWith("image/")
  ) {
    text = await ocrDocument(buffer, evidence.mimeType);
  } else {
    text = buffer.toString("utf-8");
  }

  const extracted = await extractEntitiesFromText(text);
  const createdEntities = [];

  for (const item of extracted) {
    const type = ENTITY_TYPE_MAP[item.type];
    if (!type) continue;

    const entity = await getOrCreateEntity(
      evidence.caseId,
      type,
      item.value,
      evidence.id,
      [item.value],
      item.confidence
    );
    createdEntities.push(entity);
    await syncEntityToNeo4j(entity.id);
  }

  for (let i = 0; i < createdEntities.length; i++) {
    for (let j = i + 1; j < createdEntities.length; j++) {
      const rel = await prisma.relationship.create({
        data: {
          sourceEntityId: createdEntities[i].id,
          targetEntityId: createdEntities[j].id,
          relationType: "MENTIONED_IN",
          confidence: 0.8,
          evidenceId: evidence.id,
          recordRef: `FIR co-mention`,
        },
      });
      await syncRelationshipToNeo4j(rel.id);
    }
  }

  return {
    type: "FIR",
    entitiesExtracted: createdEntities.length,
    textLength: text.length,
    extractedText: text.slice(0, 4000),
  };
}

async function processCdrCsv(
  evidence: { id: string; caseId: string },
  buffer: Buffer,
  jobId?: string
) {
  const text = buffer.toString("utf-8");
  const rows = csvToObjects(text);
  if (rows.length === 0) throw new Error("CDR CSV is empty or invalid");

  let recordsCreated = 0;
  const total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const caller = pickField(row, "caller", "a_number", "from", "calling", "a_party");
    const receiver = pickField(row, "receiver", "b_number", "to", "called", "b_party");
    if (!caller || !receiver) continue;

    const timeStr = pickField(row, "time", "timestamp", "datetime", "date_time", "call_date");
    const timestamp = timeStr ? new Date(timeStr) : new Date();
    const duration = parseInt(pickField(row, "duration", "duration_sec", "secs", "call_duration") || "0", 10);
    const location = pickField(row, "location", "tower", "cell_id", "tower_id", "cell_location") || undefined;
    const imei = pickField(row, "imei", "device_imei") || undefined;

    await prisma.cdrRecord.create({
      data: {
        caseId: evidence.caseId,
        evidenceId: evidence.id,
        caller: encryptPii(caller),
        receiver: encryptPii(receiver),
        timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
        duration,
        location,
        towerId: location,
        imei,
      },
    });
    recordsCreated++;

    const callerEntity = await getOrCreateEntity(evidence.caseId, "PHONE", caller, evidence.id);
    const receiverEntity = await getOrCreateEntity(evidence.caseId, "PHONE", receiver, evidence.id);

    await syncEntityToNeo4j(callerEntity.id);
    await syncEntityToNeo4j(receiverEntity.id);

    if (imei) {
      const device = await getOrCreateEntity(evidence.caseId, "DEVICE", imei, evidence.id, [imei]);
      await syncEntityToNeo4j(device.id);
      const ownsRel = await prisma.relationship.create({
        data: {
          sourceEntityId: callerEntity.id,
          targetEntityId: device.id,
          relationType: "USES_DEVICE",
          confidence: 0.9,
          evidenceId: evidence.id,
          approved: true,
        },
      });
      await syncRelationshipToNeo4j(ownsRel.id);
    }

    const rel = await prisma.relationship.create({
      data: {
        sourceEntityId: callerEntity.id,
        targetEntityId: receiverEntity.id,
        relationType: "CALLED",
        confidence: 1.0,
        evidenceId: evidence.id,
        recordRef: `CDR row ${i + 2}`,
        approved: true,
        metadata: { duration, timestamp: timestamp.toISOString() },
      },
    });
    await syncRelationshipToNeo4j(rel.id);

    if (jobId && i % 5 === 0) {
      await updateJobProgress(jobId, 10 + Math.floor((i / total) * 70));
    }
  }

  try {
    await createCdrAlerts(evidence.caseId);
  } catch (err) {
    console.warn("CDR alert analysis after ingest:", err);
  }

  return { type: "CDR", recordsCreated };
}

async function processTransactionCsv(
  evidence: { id: string; caseId: string },
  buffer: Buffer
) {
  const text = buffer.toString("utf-8");
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());

  const senderIdx = header.findIndex((h) =>
    ["sender", "from", "from_account", "debit"].includes(h)
  );
  const receiverIdx = header.findIndex((h) =>
    ["receiver", "to", "to_account", "credit"].includes(h)
  );
  const amountIdx = header.findIndex((h) => ["amount", "value", "sum"].includes(h));
  const timeIdx = header.findIndex((h) =>
    ["time", "timestamp", "datetime", "date"].includes(h)
  );
  const bankIdx = header.findIndex((h) => h === "bank");
  const upiIdx = header.findIndex((h) => ["upi", "upi_id", "vpa"].includes(h));

  let recordsCreated = 0;
  const txns: Array<{ sender: string; receiver: string; amount: number; timestamp: Date }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) continue;

    const sender = cols[senderIdx] ?? cols[0];
    const receiver = cols[receiverIdx] ?? cols[1];
    const amount = parseFloat((cols[amountIdx] ?? cols[2]).replace(/[₹,]/g, "")) || 0;
    const timestamp = timeIdx >= 0 ? new Date(cols[timeIdx]) : new Date();

    await prisma.transaction.create({
      data: {
        caseId: evidence.caseId,
        evidenceId: evidence.id,
        sender: encryptPii(sender),
        receiver: encryptPii(receiver),
        amount,
        timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
        bank: bankIdx >= 0 ? cols[bankIdx] : undefined,
        upiId: upiIdx >= 0 ? cols[upiIdx] : undefined,
      },
    });
    recordsCreated++;
    txns.push({ sender, receiver, amount, timestamp });

    const senderEntity = await getOrCreateEntity(
      evidence.caseId,
      upiIdx >= 0 && cols[upiIdx]?.includes("@") ? "UPI" : "BANK_ACCOUNT",
      sender,
      evidence.id
    );
    const receiverEntity = await getOrCreateEntity(
      evidence.caseId,
      "BANK_ACCOUNT",
      receiver,
      evidence.id
    );

    await syncEntityToNeo4j(senderEntity.id);
    await syncEntityToNeo4j(receiverEntity.id);

    const rel = await prisma.relationship.create({
      data: {
        sourceEntityId: senderEntity.id,
        targetEntityId: receiverEntity.id,
        relationType: "TRANSFERRED",
        confidence: 1.0,
        evidenceId: evidence.id,
        recordRef: `TXN row ${i}`,
        approved: true,
        metadata: { amount, timestamp: timestamp.toISOString() },
      },
    });
    await syncRelationshipToNeo4j(rel.id);

    if (amount >= 100000) {
      await prisma.alert.create({
        data: {
          type: "TRANSACTION_ANOMALY",
          title: "High-value transaction detected",
          message: `₹${amount.toLocaleString("en-IN")} transferred from ${sender} to ${receiver}. Review recommended.`,
          confidence: 0.85,
          caseId: evidence.caseId,
          metadata: { sender, receiver, amount },
        },
      });
    }
  }

  try {
    await createFinancialAlerts(evidence.caseId);
  } catch (err) {
    console.warn("Financial alert analysis after ingest:", err);
  }

  return { type: "BANK_TXN", recordsCreated };
}

async function processVehicleCsv(
  evidence: { id: string; caseId: string },
  buffer: Buffer
) {
  const text = buffer.toString("utf-8");
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  let recordsCreated = 0;

  const plateIdx = header.findIndex((h) =>
    ["plate", "registration", "vehicle", "vehicle_number"].includes(h)
  );
  const ownerIdx = header.findIndex((h) => ["owner", "owner_name", "person"].includes(h));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const plate = cols[plateIdx] ?? cols[0];
    const owner = ownerIdx >= 0 ? cols[ownerIdx] : undefined;

    const vehicleEntity = await getOrCreateEntity(
      evidence.caseId,
      "VEHICLE",
      plate,
      evidence.id
    );
    await syncEntityToNeo4j(vehicleEntity.id);

    if (owner) {
      const personEntity = await getOrCreateEntity(
        evidence.caseId,
        "PERSON",
        owner,
        evidence.id
      );
      await syncEntityToNeo4j(personEntity.id);
      const rel = await prisma.relationship.create({
        data: {
          sourceEntityId: personEntity.id,
          targetEntityId: vehicleEntity.id,
          relationType: "OWNS",
          confidence: 0.95,
          evidenceId: evidence.id,
          recordRef: `Vehicle row ${i}`,
          approved: true,
        },
      });
      await syncRelationshipToNeo4j(rel.id);
    }
    recordsCreated++;
  }

  return { type: "VEHICLE", recordsCreated };
}

async function processEmailCsv(
  evidence: { id: string; caseId: string },
  buffer: Buffer
) {
  const text = buffer.toString("utf-8");
  const lines = text.trim().split("\n");
  let recordsCreated = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 2) continue;
    const [from, to, timestamp] = cols;

    const fromEntity = await getOrCreateEntity(evidence.caseId, "EMAIL", from, evidence.id);
    const toEntity = await getOrCreateEntity(evidence.caseId, "EMAIL", to, evidence.id);
    await syncEntityToNeo4j(fromEntity.id);
    await syncEntityToNeo4j(toEntity.id);

    const rel = await prisma.relationship.create({
      data: {
        sourceEntityId: fromEntity.id,
        targetEntityId: toEntity.id,
        relationType: "COMMUNICATED",
        confidence: 1.0,
        evidenceId: evidence.id,
        recordRef: `Email row ${i}`,
        approved: true,
        metadata: { timestamp },
      },
    });
    await syncRelationshipToNeo4j(rel.id);
    recordsCreated++;
  }

  return { type: "EMAIL", recordsCreated };
}

async function processTowerCsv(
  evidence: { id: string; caseId: string },
  buffer: Buffer
) {
  const text = buffer.toString("utf-8");
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  let recordsCreated = 0;

  const phoneIdx = header.findIndex((h) => ["entity_ref", "phone", "number", "msisdn"].includes(h));
  const towerIdx = header.findIndex((h) => ["tower", "tower_id", "cell_id"].includes(h));
  const latIdx = header.findIndex((h) => h === "latitude");
  const lngIdx = header.findIndex((h) => h === "longitude");
  const timeIdx = header.findIndex((h) => ["time", "timestamp"].includes(h));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const phone = cols[phoneIdx] ?? cols[0];
    const tower = cols[towerIdx];
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : undefined;
    const lng = lngIdx >= 0 ? parseFloat(cols[lngIdx]) : undefined;
    const timestamp = timeIdx >= 0 ? new Date(cols[timeIdx]) : new Date();

    await prisma.locationEvent.create({
      data: {
        caseId: evidence.caseId,
        entityRef: phone,
        latitude: lat,
        longitude: lng,
        towerId: tower,
        timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
        source: "TOWER",
      },
    });

    const phoneEntity = await getOrCreateEntity(evidence.caseId, "PHONE", phone, evidence.id);
    await syncEntityToNeo4j(phoneEntity.id);
    recordsCreated++;
  }

  const { createGeoAlerts } = await import("./geo-intelligence");
  await createGeoAlerts(evidence.caseId);
  return { type: "TOWER", recordsCreated };
}

async function detectCrossCaseLinks(caseId: string) {
  const entities = await prisma.entity.findMany({
    where: { caseId, mergedIntoId: null },
  });

  for (const entity of entities) {
    const crossCase = await prisma.entity.findFirst({
      where: {
        normalizedValue: entity.normalizedValue,
        type: entity.type,
        caseId: { not: caseId },
        mergedIntoId: null,
      },
      include: { case: true },
    });

    if (crossCase) {
      const existing = await prisma.alert.findFirst({
        where: {
          type: "CROSS_CASE_LINK",
          caseId,
          metadata: { path: ["crossCaseId"], equals: crossCase.caseId },
        },
      });
      if (!existing) {
        await prisma.alert.create({
          data: {
            type: "CROSS_CASE_LINK",
            title: "Cross-case connection detected",
            message: `${entity.type} "${entity.normalizedValue}" also appears in case ${crossCase.case.caseNumber}. Review recommended.`,
            confidence: 0.94,
            caseId,
            entityId: entity.id,
            metadata: {
              crossCaseId: crossCase.caseId,
              crossCaseNumber: crossCase.case.caseNumber,
              entityValue: entity.normalizedValue,
            },
          },
        });
      }
    }
  }
}

export function evidenceTypeFromMime(
  mimeType: string,
  fileName: string
): EvidenceType {
  const lower = fileName.toLowerCase();
  if (lower.includes("cdr") || lower.includes("call")) return "CDR";
  if (lower.includes("transaction") || lower.includes("bank") || lower.includes("txn"))
    return "BANK_TXN";
  if (lower.includes("vehicle")) return "VEHICLE";
  if (lower.includes("email")) return "EMAIL";
  if (lower.includes("tower") || lower.includes("location")) return "TOWER";
  if (lower.includes("surveillance")) return "SURVEILLANCE";
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("document") ||
    lower.endsWith(".txt")
  )
    return "FIR";
  if (mimeType === "text/csv" || lower.endsWith(".csv")) return "CDR";
  return "OTHER";
}
