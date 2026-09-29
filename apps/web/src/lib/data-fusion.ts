import { prisma } from "./db";
import { syncRelationshipToNeo4j } from "./neo4j-sync";
import { normalizePhone } from "./normalize";

/**
 * Cross-source identity fusion (TATVA / GraphAware pattern):
 * Link phone (CDR) ↔ UPI/bank account ↔ email ↔ vehicle owner within a case.
 */
export async function fuseCrossSourceIdentities(caseId: string): Promise<number> {
  const entities = await prisma.entity.findMany({
    where: { caseId, mergedIntoId: null },
  });

  const byType = new Map<string, typeof entities>();
  for (const e of entities) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }

  let linksCreated = 0;

  const phones = byType.get("PHONE") ?? [];
  const persons = byType.get("PERSON") ?? [];
  const vehicles = byType.get("VEHICLE") ?? [];
  const emails = byType.get("EMAIL") ?? [];
  const bankAccounts = [...(byType.get("BANK_ACCOUNT") ?? []), ...(byType.get("UPI") ?? [])];

  for (const person of persons) {
    const nameLower = person.normalizedValue.toLowerCase();

    for (const vehicle of vehicles) {
      if (vehicle.rawValues.some((v) => v.toLowerCase().includes(nameLower))) {
        linksCreated += await linkEntities(caseId, person.id, vehicle.id, "OWNS", 0.75);
      }
    }

    for (const email of emails) {
      const localPart = email.normalizedValue.split("@")[0]?.toLowerCase() ?? "";
      if (localPart && nameLower.includes(localPart.replace(/[._]/g, " "))) {
        linksCreated += await linkEntities(caseId, person.id, email.id, "COMMUNICATED", 0.7);
      }
    }
  }

  for (const phone of phones) {
    const phoneNorm = normalizePhone(phone.normalizedValue);
    for (const bank of bankAccounts) {
      if (bank.rawValues.some((v) => normalizePhone(v) === phoneNorm || v.includes(phoneNorm.slice(-10)))) {
        linksCreated += await linkEntities(caseId, phone.id, bank.id, "LINKED_TO", 0.8);
      }
    }
  }

  const cdrRecords = await prisma.cdrRecord.findMany({ where: { caseId }, take: 500 });
  for (const cdr of cdrRecords) {
    const callerPhone = phones.find((p) => normalizePhone(p.normalizedValue) === normalizePhone(cdr.caller));
    const receiverPhone = phones.find((p) => normalizePhone(p.normalizedValue) === normalizePhone(cdr.receiver));
    if (callerPhone && receiverPhone && callerPhone.id !== receiverPhone.id) {
      linksCreated += await linkEntities(caseId, callerPhone.id, receiverPhone.id, "CALLED", 0.95, cdr.evidenceId ?? undefined);
    }
  }

  return linksCreated;
}

async function linkEntities(
  caseId: string,
  sourceId: string,
  targetId: string,
  relationType: string,
  confidence: number,
  evidenceId?: string
): Promise<number> {
  const existing = await prisma.relationship.findFirst({
    where: {
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationType,
    },
  });
  if (existing) return 0;

  const rel = await prisma.relationship.create({
    data: {
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationType,
      confidence,
      evidenceId,
      approved: true,
      metadata: { source: "data_fusion" },
    },
    include: { sourceEntity: true, targetEntity: true },
  });

  await syncRelationshipToNeo4j(rel.id);
  return 1;
}
