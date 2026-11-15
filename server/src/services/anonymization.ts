import crypto from 'crypto';

export type AnonymizationConfig = {
  sensitiveFields: Record<string, string[]>;
  replacements: {
    email: string;
    name: string;
    password: string;
    default: string;
  };
};

export const DEFAULT_ANONYMIZATION_CONFIG: AnonymizationConfig = {
  sensitiveFields: {
    user: ['name', 'email', 'image'],
    account: ['password'],
  },
  replacements: {
    name: 'Name',
    email: 'forgotten-user-{id}@anonymized.local',
    password: '$argon2id$v=19$m=65536,t=3,p=4$XXXXXXXXXXXXXXXXXXXXXXXX',
    default: 'REDACTED',
  },
};

export class AnonymizationService {
  private config: AnonymizationConfig;

  constructor(config: AnonymizationConfig = DEFAULT_ANONYMIZATION_CONFIG) {
    this.config = config;
  }

  generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  encrypt(data: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  anonymizeAggregateSensitiveFields(aggregate: Record<string, any>, aggregateType: string, aggregateId: string): Record<string, any> {
    const sensitiveFields = this.config.sensitiveFields[aggregateType] || [];
    const anonymized = { ...aggregate };
    for (const field of sensitiveFields) {
      if (field in anonymized) {
        anonymized[field] = this.getReplacementValue(field, aggregateId);
      }
    }
    return anonymized;
  }

  anonymizeEventData(eventData: Record<string, any>, aggregateType: string, aggregateId: string): Record<string, any> {
    const anonymized = this.anonymizeAggregateSensitiveFields(eventData, aggregateType, aggregateId);
    anonymized._anonymized = true;
    anonymized._anonymized_at = new Date().toISOString();
    return anonymized;
  }

  private getReplacementValue(field: string, aggregateId: string): string {
    switch (field) {
      case 'email':
        return this.config.replacements.email.replace('{id}', aggregateId);
      case 'name':
        return this.config.replacements.name;
      case 'password':
        return this.config.replacements.password;
      default:
        return this.config.replacements.default;
    }
  }
}

export const anonymizationService = new AnonymizationService();
