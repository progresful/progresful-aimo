-- CreateTable
CREATE TABLE "gw_policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "plainLanguage" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "summary" TEXT,
    "signedBy" TEXT,
    "signedRole" TEXT,
    "signedAt" TIMESTAMP(3),
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gw_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gw_quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT,
    "agentId" TEXT,
    "requestedDate" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,

    CONSTRAINT "gw_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gw_order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "agentId" TEXT,
    "quoteId" TEXT,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "committedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryDate" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "candidates" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gw_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gw_approval" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "fallback" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decidedRole" TEXT,
    "comment" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gw_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gw_audit_entry" (
    "seq" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gw_audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gw_agent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gw_agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gw_policy_organizationId_key_idx" ON "gw_policy"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "gw_policy_organizationId_key_version_key" ON "gw_policy"("organizationId", "key", "version");

-- CreateIndex
CREATE INDEX "gw_quote_organizationId_idx" ON "gw_quote"("organizationId");

-- CreateIndex
CREATE INDEX "gw_order_organizationId_createdAt_idx" ON "gw_order"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gw_order_organizationId_idempotencyKey_key" ON "gw_order"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "gw_approval_orderId_key" ON "gw_approval"("orderId");

-- CreateIndex
CREATE INDEX "gw_approval_organizationId_status_idx" ON "gw_approval"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gw_audit_entry_seq_key" ON "gw_audit_entry"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "gw_audit_entry_hash_key" ON "gw_audit_entry"("hash");

-- CreateIndex
CREATE INDEX "gw_audit_entry_organizationId_seq_idx" ON "gw_audit_entry"("organizationId", "seq");

-- CreateIndex
CREATE INDEX "gw_audit_entry_orderId_idx" ON "gw_audit_entry"("orderId");

-- CreateIndex
CREATE INDEX "gw_agent_organizationId_idx" ON "gw_agent"("organizationId");

-- AddForeignKey
ALTER TABLE "gw_approval" ADD CONSTRAINT "gw_approval_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "gw_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
