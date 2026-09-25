-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "TenantKind" AS ENUM ('PERSONAL', 'BUSINESS');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "kind" "TenantKind" NOT NULL DEFAULT 'BUSINESS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "userRole" "UserRole" NOT NULL DEFAULT 'COMPANY';

-- CreateIndex
CREATE INDEX "User_userRole_createdAt_idx" ON "User"("userRole", "createdAt");

-- Backfill: contas existentes da plataforma (SUPER_ADMIN) passam a ser ADMIN; demais permanecem COMPANY.
UPDATE "User" u SET "userRole" = 'ADMIN'
FROM "Role" r
WHERE u."roleId" = r."id" AND r."key" = 'SUPER_ADMIN';
