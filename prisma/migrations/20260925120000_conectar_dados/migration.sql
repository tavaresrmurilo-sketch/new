-- Conectar Dados: fontes externas (PostgreSQL, MySQL, SQL Server, API REST), tabelas autorizadas,
-- erros de sincronização e modelos normalizados de faturas e pedidos. Não remove dados.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportTarget" ADD VALUE 'INVOICES';
ALTER TYPE "ImportTarget" ADD VALUE 'ORDERS';

-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationStatus_new" AS ENUM ('PENDING', 'CONNECTED', 'SYNCING', 'ERROR', 'DISABLED', 'NOT_IMPLEMENTED');
ALTER TABLE "public"."Integration" ALTER COLUMN "status" DROP DEFAULT;
-- Conversão preservando dados: ACTIVE -> CONNECTED, PAUSED -> DISABLED, PENDING_CREDENTIALS -> PENDING
ALTER TABLE "Integration" ALTER COLUMN "status" TYPE "IntegrationStatus_new" USING (
  CASE "status"::text
    WHEN 'ACTIVE' THEN 'CONNECTED'
    WHEN 'PAUSED' THEN 'DISABLED'
    WHEN 'PENDING_CREDENTIALS' THEN 'PENDING'
    ELSE "status"::text
  END
)::"IntegrationStatus_new";
ALTER TYPE "IntegrationStatus" RENAME TO "IntegrationStatus_old";
ALTER TYPE "IntegrationStatus_new" RENAME TO "IntegrationStatus";
DROP TYPE "public"."IntegrationStatus_old";
ALTER TABLE "Integration" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "recordsSynced" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "SyncJob" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "errorMessage" TEXT;

-- CreateTable
CREATE TABLE "IntegrationTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL DEFAULT '',
    "tableName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "entity" "ImportTarget",
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "columns" JSONB NOT NULL DEFAULT '[]',
    "incrementalColumn" TEXT,
    "lastCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "rowsSynced" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "syncJobId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" TEXT,
    "customerId" TEXT,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "TitleStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" TEXT,
    "date" DATE NOT NULL,
    "customerId" TEXT,
    "sellerName" TEXT,
    "status" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationTable_tenantId_idx" ON "IntegrationTable"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationTable_integrationId_schemaName_tableName_key" ON "IntegrationTable"("integrationId", "schemaName", "tableName");

-- CreateIndex
CREATE INDEX "SyncError_syncJobId_idx" ON "SyncError"("syncJobId");

-- CreateIndex
CREATE INDEX "SyncError_tenantId_createdAt_idx" ON "SyncError"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_issueDate_idx" ON "Invoice"("tenantId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_dataSourceId_externalId_key" ON "Invoice"("tenantId", "dataSourceId", "externalId");

-- CreateIndex
CREATE INDEX "Order_tenantId_date_idx" ON "Order"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_dataSourceId_externalId_key" ON "Order"("tenantId", "dataSourceId", "externalId");

-- AddForeignKey
ALTER TABLE "IntegrationTable" ADD CONSTRAINT "IntegrationTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTable" ADD CONSTRAINT "IntegrationTable_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "SyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

