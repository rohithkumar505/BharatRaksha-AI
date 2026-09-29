import PDFDocument from "pdfkit";

export async function buildLegalCompliancePdf(input: {
  caseNumber: string;
  generatedAt: string;
  readinessScore: number;
  documentCount: number;
  integrityPassed: number;
  integrityTotal: number;
  steps: Array<{ label: string; done: boolean }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Bharat Raksha AI — Legal Compliance Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`SIH26190 · Case ${input.caseNumber}`);
    doc.text(`Generated: ${input.generatedAt}`);
    doc.moveDown();
    doc.text(`Court readiness score: ${input.readinessScore}%`);
    doc.text(`Documents on register: ${input.documentCount}`);
    doc.text(`Integrity verified: ${input.integrityPassed}/${input.integrityTotal}`);
    doc.moveDown();
    doc.fontSize(13).text("Checklist");
    doc.moveDown(0.5);
    for (const s of input.steps) {
      doc.fontSize(10).text(`${s.done ? "[x]" : "[ ]"} ${s.label}`);
    }
    doc.moveDown();
    doc.fontSize(9).fillColor("#444").text(
      "BSA 2023 §63 electronic records — SHA-256 fingerprints and hash-chained custody. Assistive system output.",
      { align: "left" }
    );
    doc.end();
  });
}
