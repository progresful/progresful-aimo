import { ulid } from 'ulid';
import logger from './logger.ts';
import type { PrismaClient } from '../../prisma/generated/prisma/index';
import type { Event, ProcessedEvent, ForgottenAggregate } from '../../prisma/generated/eventstore_prisma/index';
import type { PrismaClient as EventStorePrismaClient } from '../../prisma/generated/eventstore_prisma/index';
import db from './database.ts';
import eventStoreDatabase from './eventStoreDatabase.ts';
import { anonymizationService } from './anonymization.ts';

export type EventBaseMeta = {
  authorId: string;
  ts: number;
  version: number;
};

export type EventBase<T extends string> = {
  id: string;
  name: string;
  data: Record<string, any>;
  meta: EventBaseMeta;
  aggregate_id: string;
  aggregate_type: T;
};

type EventBaseDB = {
  id: string;
  name: string;
  data: string;
  meta: string;
  aggregate_id: string;
  aggregate_type: string;
  created_at: string;
};

export class EventStore {
  private store: EventStorePrismaClient | null = null;
  private dataStore: PrismaClient | null = null;
  private commands: Map<string, Map<number, (...props: any[]) => Promise<any>>> = new Map();
  private isShuttingDown: boolean = false;
  isReady: boolean = false;

  constructor(eventStoreDataDb: EventStorePrismaClient, dataDb: PrismaClient) {
    this.init(eventStoreDataDb, dataDb);
  }

  private async init(eventStoreDataDb: EventStorePrismaClient, dataDb: PrismaClient) {
    try {
      this.store = eventStoreDataDb;
      this.dataStore = dataDb;
      logger.info('EventStore: Ready');
      this.isReady = true;
    } catch (error) {
      logger.error('Failed to initialize EventStore:', error);
      throw error;
    }
  }

  async cleanupProcessedEvents(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const result = await this.store.processedEvent.deleteMany({
      where: {
        processed_at: {
          lt: cutoffDate,
        },
      },
    });
    return result.count;
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const result = await this.store.processedEvent.findUnique({
      where: {
        event_id: eventId,
      },
    });
    return result !== null;
  }

  async markEventProcessed(eventId: string, aggregateId: string, aggregateType: string): Promise<void> {
    await this.store.processedEvent.create({
      data: {
        event_id: eventId,
        aggregate_id: aggregateId,
        aggregate_type: aggregateType,
        processing_node: process.env.NODE_ENV || 'development',
      },
    });
  }

  async log<T extends EventBase<string>>(...events: T[]) {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }
    if (events.length === 0) {
      return;
    }
    try {
      // Filter out already processed events
      const eventsToLog: Array<T> = [];
      for (const event of events) {
        const eventId = event.id ?? ulid();
        if (await this.isEventProcessed(eventId)) {
          logger.warn(`EventStore: Event ${eventId} already processed, skipping`);
          continue;
        }
        eventsToLog.push({ ...event, id: eventId });
      }
      if (eventsToLog.length === 0) {
        return;
      }

      await this.store.event.createMany({
        data: eventsToLog.map(
          (event): Event => ({
            id: event.id,
            name: event.name,
            data: JSON.stringify(event.data),
            meta: JSON.stringify(event.meta),
            aggregate_id: event.aggregate_id,
            aggregate_type: event.aggregate_type,
            created_at: new Date(),
            is_anonymized: false,
            anonymized_at: null,
          })
        ),
      });

      await this.store.processedEvent.createMany({
        data: eventsToLog.map(
          (event): ProcessedEvent => ({
            event_id: event.id,
            aggregate_id: event.aggregate_id,
            aggregate_type: event.aggregate_type,
            processed_at: new Date(),
            processing_node: process.env.NODE_ENV || 'development',
          })
        ),
      });

      logger.info(`EventStore: Logged batch of ${eventsToLog.length} events`);
    } catch (error) {
      logger.error(`EventStore: Failed to log batch of events:`, error);
      throw error;
    }
  }

  registerCommand(name: string, command: (...props: any[]) => Promise<any>, version: number) {
    if (!this.commands.has(name)) {
      this.commands.set(name, new Map());
    }
    if (this.commands.get(name).has(version)) {
      logger.warn(`EventStore: Overwrited command ${name} version ${version}`);
    }
    this.commands.get(name).set(version, command);
    logger.info(`EventStore: Registered command ${name} version ${version}`);
  }

  async getEventsByAggregate(aggregateId: string, aggregateType?: string): Promise<EventBase<string>[]> {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }

    try {
      const events = await this.store.event.findMany({
        where: {
          aggregate_id: aggregateId,
          aggregate_type: aggregateType,
        },
        orderBy: {
          created_at: 'asc',
        },
      });
      return events.map((event) => ({
        id: event.id,
        name: event.name,
        data: event.data ? JSON.parse(event.data) : {},
        meta: event.meta ? JSON.parse(event.meta) : {},
        aggregate_id: event.aggregate_id,
        aggregate_type: event.aggregate_type,
      }));
    } catch (error) {
      logger.error('Failed to get events by aggregate:', error);
      throw error;
    }
  }

  async getEventsByType(aggregateType: string): Promise<EventBase<string>[]> {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }

    try {
      const events = await this.store.event.findMany({
        where: {
          aggregate_type: aggregateType,
        },
        orderBy: {
          created_at: 'asc',
        },
      });
      return events.map(
        (event): EventBase<string> => ({
          id: event.id,
          name: event.name,
          data: event.data ? JSON.parse(event.data) : {},
          meta: event.meta ? JSON.parse(event.meta) : {},
          aggregate_id: event.aggregate_id,
          aggregate_type: event.aggregate_type,
        })
      );
    } catch (error) {
      logger.error('Failed to get events by type:', error);
      throw error;
    }
  }

  async getEventsByTimeRange(start: Date, end: Date): Promise<EventBase<string>[]> {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }

    try {
      const events = await this.store.event.findMany({
        where: {
          created_at: {
            gte: start,
            lte: end,
          },
        },
        orderBy: {
          created_at: 'asc',
        },
      });
      return events.map(
        (event): EventBase<string> => ({
          id: event.id,
          name: event.name,
          data: event.data ? JSON.parse(event.data) : {},
          meta: event.meta ? JSON.parse(event.meta) : {},
          aggregate_id: event.aggregate_id,
          aggregate_type: event.aggregate_type,
        })
      );
    } catch (error) {
      logger.error('Failed to get events by time range:', error);
      throw error;
    }
  }

  async getAllEvents(): Promise<EventBase<string>[]> {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }
    try {
      const events = await this.store.event.findMany({
        orderBy: {
          created_at: 'asc',
        },
      });
      return events.map(
        (event): EventBase<string> => ({
          id: event.id,
          name: event.name,
          data: event.data ? JSON.parse(event.data) : {},
          meta: event.meta ? JSON.parse(event.meta) : {},
          aggregate_id: event.aggregate_id,
          aggregate_type: event.aggregate_type,
        })
      );
    } catch (error) {
      logger.error('Failed to get all events:', error);
      throw error;
    }
  }

  async replayEvents(events: EventBase<string>[], skipProcessedCheck: boolean = false) {
    for (const event of events) {
      if (!skipProcessedCheck && event.id && (await this.isEventProcessed(event.id))) {
        logger.info(`EventStore: Event ${event.id} already processed, skipping replay`);
        continue;
      }

      const commandVersions = this.commands.get(event.name);
      if (!commandVersions) {
        logger.warn(`EventStore: No command handler registered for event: ${event.name}`);
        continue;
      }

      const command = commandVersions.get(event.meta.version);
      if (!command) {
        logger.warn(`EventStore: No command handler registered for event: ${event.name} version ${event.meta.version}`);
        continue;
      }

      try {
        await command(this.dataStore, event.data, {
          isRecreating: true,
          authorId: event.meta.authorId,
        });
        if (event.id) {
          await this.markEventProcessed(event.id, event.aggregate_id, event.aggregate_type);
        }
        logger.info(`EventStore: Replayed event ${event.id} with name ${event.name}`);
      } catch (error) {
        logger.error(`EventStore: Failed to replay event ${event.id} with name ${event.name}:`, error);
        throw error;
      }
    }
  }

  getLatestCommandVersion(name: string): number | null {
    const versions = this.commands.get(name);
    if (!versions) return null;

    const versionNumbers = Array.from(versions.keys());
    return Math.max(...versionNumbers);
  }

  hasCommandVersion(name: string, version: number): boolean {
    return this.commands.get(name)?.has(version) ?? false;
  }

  async close() {
    if (this.isShuttingDown) {
      logger.warn('EventStore: Already shutting down');
      return;
    }

    this.isShuttingDown = true;
    logger.info('EventStore: Closing database connections...');

    try {
      await this.store?.$disconnect();
      logger.info('EventStore: Database connections closed successfully');
    } catch (error) {
      logger.error('EventStore: Failed to close database connections:', error);
    }
  }

  /**
   * Anonymize all events for an aggregate (GDPR right to be forgotten)
   * Strategy: Replace sensitive data with anonymized values
   */
  async anonymizeAggregate(aggregateId: string, aggregateType: string, requestedBy: string, reason?: string) {
    if (!this.store) {
      throw new Error('EventStore: Not ready');
    }

    logger.info(`EventStore: Starting anonymization for ${aggregateType}:${aggregateId}`);

    try {
      await this.store.$transaction(async (tx) => {
        // Get all events for this aggregate
        const events = await tx.event.findMany({
          where: {
            aggregate_id: aggregateId,
            aggregate_type: aggregateType,
            is_anonymized: false,
          },
        });

        let anonymizedCount = 0;
        let skippedCount = 0;

        for (const event of events) {
          try {
            const eventData = JSON.parse(event.data);

            // Check if already anonymized
            if (eventData._anonymized) {
              skippedCount++;
              continue;
            }

            // Anonymize sensitive fields
            const anonymizedData = anonymizationService.anonymizeEventData(eventData, aggregateType, aggregateId);

            // Update event with anonymized data
            await tx.event.update({
              where: { id: event.id },
              data: {
                data: JSON.stringify(anonymizedData),
                is_anonymized: true,
                anonymized_at: new Date(),
              },
            });

            anonymizedCount++;
          } catch (error) {
            logger.error(`EventStore: Failed to anonymize event ${event.id}:`, error);
            skippedCount++;
          }
        }

        // Record in forgotten_aggregates table
        await tx.forgottenAggregate.create({
          data: {
            aggregate_id: aggregateId,
            aggregate_type: aggregateType,
            requested_by: requestedBy,
            reason: reason || 'GDPR request',
            event_count: anonymizedCount,
          },
        });

        logger.info(`EventStore: Anonymized ${anonymizedCount} events for ${aggregateType}:${aggregateId}, ` + `skipped ${skippedCount}`);

        return { anonymizedCount, skippedCount };
      });
    } catch (error) {
      logger.error('EventStore: Failed to anonymize aggregate:', error);
      throw error;
    }
  }

  async isAggregateForgotten(aggregateId: string): Promise<boolean> {
    const result = await this.store.forgottenAggregate.findUnique({
      where: {
        aggregate_id: aggregateId,
      },
    });
    return !!result;
  }

  async getForgottenAggregates(aggregateType?: string): Promise<ForgottenAggregate[]> {
    const result = await this.store.forgottenAggregate.findMany({
      where: {
        aggregate_type: aggregateType,
      },
      orderBy: {
        forgotten_at: 'desc',
      },
    });
    return result;
  }
}

export const eventStore = new EventStore(eventStoreDatabase, db);
