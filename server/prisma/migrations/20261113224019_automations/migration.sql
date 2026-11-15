-- CreateTable
CREATE TABLE "gw_automation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "days" INTEGER[],
    "time" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 1,
    "lines" JSONB NOT NULL,
    "allowSubstitutes" BOOLEAN NOT NULL DEFAULT true,
    "agentId" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gw_automation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gw_automation_organizationId_idx" ON "gw_automation"("organizationId");

-- CreateIndex
CREATE INDEX "gw_automation_enabled_nextRunAt_idx" ON "gw_automation"("enabled", "nextRunAt");
