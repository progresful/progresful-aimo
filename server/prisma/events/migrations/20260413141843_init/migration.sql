-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_anonymized" BOOLEAN NOT NULL DEFAULT false,
    "anonymized_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_node" TEXT NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "forgotten_aggregates" (
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "forgotten_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "event_count" INTEGER NOT NULL,

    CONSTRAINT "forgotten_aggregates_pkey" PRIMARY KEY ("aggregate_id")
);

-- CreateTable
CREATE TABLE "anonymization_keys" (
    "aggregate_id" TEXT NOT NULL,
    "encryption_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymization_keys_pkey" PRIMARY KEY ("aggregate_id")
);

-- CreateIndex
CREATE INDEX "events_aggregate_id_idx" ON "events"("aggregate_id");

-- CreateIndex
CREATE INDEX "events_aggregate_type_idx" ON "events"("aggregate_type");

-- CreateIndex
CREATE INDEX "events_aggregate_id_aggregate_type_created_at_idx" ON "events"("aggregate_id", "aggregate_type", "created_at");

-- CreateIndex
CREATE INDEX "events_name_idx" ON "events"("name");

-- CreateIndex
CREATE INDEX "events_is_anonymized_idx" ON "events"("is_anonymized");

-- CreateIndex
CREATE INDEX "processed_events_aggregate_id_idx" ON "processed_events"("aggregate_id");

-- CreateIndex
CREATE INDEX "processed_events_aggregate_type_idx" ON "processed_events"("aggregate_type");

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");

-- CreateIndex
CREATE INDEX "forgotten_aggregates_aggregate_type_idx" ON "forgotten_aggregates"("aggregate_type");
