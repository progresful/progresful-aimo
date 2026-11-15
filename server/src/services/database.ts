import { PrismaClient } from '../../prisma/generated/prisma/client.js';

const prisma = new PrismaClient();

export default prisma;

export type PrismaClientOrTx = PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
