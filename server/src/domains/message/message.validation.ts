import { z } from 'zod';
import { isValid } from 'ulid';

export const getMessage = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
});

export const createMessage = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
    organizationId: z.string().refine(isValid, 'Invalid ULID format').optional().nullable(),
    teamId: z.string().refine(isValid, 'Invalid ULID format').optional().nullable(),
    fromType: z.enum(['user', 'organization', 'team', 'system']).optional().nullable(),
    recipientIds: z.array(z.string().refine(isValid, 'Invalid ULID format')).min(1, 'At least one recipient is required'),
  }),
});

export const updateMessage = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
  body: z.object({
    content: z.string().min(1, 'Content is required'),
    organizationId: z.string().refine(isValid, 'Invalid ULID format').optional().nullable(),
    teamId: z.string().refine(isValid, 'Invalid ULID format').optional().nullable(),
    fromType: z.enum(['user', 'organization', 'team', 'system']).optional().nullable(),
  }),
});

export const deleteMessage = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
});

export const readMessageRecipient = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
});

export const unreadMessageRecipient = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
});

export const addRecipientsToMessage = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
  body: z.object({
    recipientIds: z.array(z.string().refine(isValid, 'Invalid ULID format')).min(1, 'At least one recipient is required'),
  }),
});

export const removeRecipientsFromMessage = z.object({
  params: z.object({
    messageId: z.string().refine(isValid, 'Invalid ULID format'),
  }),
  body: z.object({
    recipientIds: z.array(z.string().refine(isValid, 'Invalid ULID format')).min(1, 'At least one recipient is required'),
  }),
});
