-- Step 5: Blockchain Chain of Custody — LedgerBlock + CustodyLog enhancements
-- AlterTable
ALTER TABLE "CustodyLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "CustodyLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "CustodyLog" ADD COLUMN IF NOT EXISTS "transferredToId" TEXT;
ALTER TABLE "CustodyLog" ADD COLUMN IF NOT EXISTS "ledgerBlockId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LedgerBlock" (
    "id" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "evidenceId" TEXT,
    "event" "CustodyEvent" NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousHash" TEXT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "onChainTxId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerBlock_blockIndex_key" ON "LedgerBlock"("blockIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerBlock_blockHash_key" ON "LedgerBlock"("blockHash");
CREATE UNIQUE INDEX IF NOT EXISTS "CustodyLog_ledgerBlockId_key" ON "CustodyLog"("ledgerBlockId");
CREATE INDEX IF NOT EXISTS "LedgerBlock_evidenceId_idx" ON "LedgerBlock"("evidenceId");
CREATE INDEX IF NOT EXISTS "LedgerBlock_createdAt_idx" ON "LedgerBlock"("createdAt");
CREATE INDEX IF NOT EXISTS "CustodyLog_evidenceId_createdAt_idx" ON "CustodyLog"("evidenceId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LedgerBlock" ADD CONSTRAINT "LedgerBlock_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LedgerBlock" ADD CONSTRAINT "LedgerBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustodyLog" ADD CONSTRAINT "CustodyLog_ledgerBlockId_fkey" FOREIGN KEY ("ledgerBlockId") REFERENCES "LedgerBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
