-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('AR_CONDICIONADO', 'OFICINA_MECANICA', 'BARBEARIA_SALAO', 'MANUTENCAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'ANY');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'CONTACTED', 'CONVERTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReminderEventType" AS ENUM ('CREATED', 'WHATSAPP_OPENED', 'CONTACTED', 'SNOOZED', 'CONVERTED', 'DISMISSED', 'REOPENED', 'RESCHEDULED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactOutcome" AS ENUM ('MESSAGE_SENT', 'TALKED', 'SCHEDULED', 'NO_ANSWER', 'DECLINED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('INICIAL', 'PROFISSIONAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('NONE', 'MERCADO_PAGO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "defaultReturnIntervalDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "registeredAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactPreference" "ContactPreference" NOT NULL DEFAULT 'WHATSAPP',
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentUpdatedAt" TIMESTAMP(3),
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPriceCents" INTEGER,
    "returnIntervalDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER,
    "notes" TEXT,
    "nextReturnDate" DATE,
    "nextReturnManual" BOOLEAN NOT NULL DEFAULT false,
    "returnOfReminderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_reminders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "remindAt" DATE NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "contactCount" INTEGER NOT NULL DEFAULT 0,
    "contactedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "type" "ReminderEventType" NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reminderId" TEXT,
    "userId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "outcome" "ContactOutcome" NOT NULL,
    "message" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "customerLimit" INTEGER,
    "advancedReports" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planCode" "PlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "provider" "BillingProvider" NOT NULL DEFAULT 'NONE',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "memberships_companyId_idx" ON "memberships"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_companyId_key" ON "memberships"("userId", "companyId");

-- CreateIndex
CREATE INDEX "customers_companyId_name_idx" ON "customers"("companyId", "name");

-- CreateIndex
CREATE INDEX "customers_companyId_createdAt_idx" ON "customers"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_companyId_key" ON "customers"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_phoneNormalized_key" ON "customers"("companyId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "services_companyId_active_idx" ON "services"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "services_id_companyId_key" ON "services"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "services_companyId_name_key" ON "services"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_returnOfReminderId_key" ON "appointments"("returnOfReminderId");

-- CreateIndex
CREATE INDEX "appointments_companyId_date_idx" ON "appointments"("companyId", "date");

-- CreateIndex
CREATE INDEX "appointments_companyId_customerId_date_idx" ON "appointments"("companyId", "customerId", "date");

-- CreateIndex
CREATE INDEX "appointments_companyId_serviceId_date_idx" ON "appointments"("companyId", "serviceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_companyId_key" ON "appointments"("id", "companyId");

-- CreateIndex
CREATE INDEX "return_reminders_companyId_status_remindAt_idx" ON "return_reminders"("companyId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "return_reminders_companyId_customerId_status_idx" ON "return_reminders"("companyId", "customerId", "status");

-- CreateIndex
CREATE INDEX "return_reminders_companyId_convertedAt_idx" ON "return_reminders"("companyId", "convertedAt");

-- CreateIndex
CREATE INDEX "return_reminders_companyId_contactedAt_idx" ON "return_reminders"("companyId", "contactedAt");

-- CreateIndex
CREATE UNIQUE INDEX "return_reminders_id_companyId_key" ON "return_reminders"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "return_reminders_appointmentId_companyId_key" ON "return_reminders"("appointmentId", "companyId");

-- CreateIndex
CREATE INDEX "reminder_events_companyId_reminderId_createdAt_idx" ON "reminder_events"("companyId", "reminderId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_logs_companyId_createdAt_idx" ON "contact_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_logs_companyId_customerId_createdAt_idx" ON "contact_logs"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_logs_reminderId_idx" ON "contact_logs"("reminderId");

-- CreateIndex
CREATE INDEX "message_templates_companyId_serviceId_idx" ON "message_templates"("companyId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_companyId_name_key" ON "message_templates"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_companyId_key" ON "subscriptions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_companyId_fkey" FOREIGN KEY ("serviceId", "companyId") REFERENCES "services"("id", "companyId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_returnOfReminderId_fkey" FOREIGN KEY ("returnOfReminderId") REFERENCES "return_reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_reminders" ADD CONSTRAINT "return_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_reminders" ADD CONSTRAINT "return_reminders_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_reminders" ADD CONSTRAINT "return_reminders_serviceId_companyId_fkey" FOREIGN KEY ("serviceId", "companyId") REFERENCES "services"("id", "companyId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_reminders" ADD CONSTRAINT "return_reminders_appointmentId_companyId_fkey" FOREIGN KEY ("appointmentId", "companyId") REFERENCES "appointments"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_reminderId_companyId_fkey" FOREIGN KEY ("reminderId", "companyId") REFERENCES "return_reminders"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "return_reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Restrições de integridade adicionais (não representáveis no schema Prisma)
-- ---------------------------------------------------------------------------
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_interval_check"
  CHECK ("defaultReturnIntervalDays" BETWEEN 1 AND 3650);
ALTER TABLE "services" ADD CONSTRAINT "services_interval_check"
  CHECK ("returnIntervalDays" IS NULL OR "returnIntervalDays" BETWEEN 1 AND 3650);
ALTER TABLE "services" ADD CONSTRAINT "services_price_check"
  CHECK ("defaultPriceCents" IS NULL OR "defaultPriceCents" >= 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_amount_check"
  CHECK ("amountCents" IS NULL OR "amountCents" >= 0);
ALTER TABLE "return_reminders" ADD CONSTRAINT "return_reminders_contact_count_check"
  CHECK ("contactCount" >= 0);

-- ---------------------------------------------------------------------------
-- Planos comerciais (preços de lançamento, sujeitos a confirmação)
-- ---------------------------------------------------------------------------
INSERT INTO "plans" ("code", "name", "priceCents", "customerLimit", "advancedReports", "sortOrder", "active") VALUES
  ('INICIAL', 'Inicial', 3900, 100, false, 1, true),
  ('PROFISSIONAL', 'Profissional', 7900, 500, true, 2, true),
  ('BUSINESS', 'Business', 14900, NULL, true, 3, true);
