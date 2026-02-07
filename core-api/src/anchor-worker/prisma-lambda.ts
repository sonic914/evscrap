/**
 * Lambda-specific Prisma Client initialization
 * Fetches database credentials from Secrets Manager
 */

import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let prisma: PrismaClient | null = null;
let isInitialized = false;

/**
 * Get database credentials from Secrets Manager
 */
async function getDatabaseCredentials(): Promise<{ username: string; password: string }> {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable not set');
  }

  const client = new SecretsManagerClient({ region: 'ap-northeast-2' });
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  
  try {
    const response = await client.send(command);
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);
    return {
      username: secret.username,
      password: secret.password,
    };
  } catch (error) {
    console.error('[PrismaLambda] Failed to fetch database credentials:', error);
    throw error;
  }
}

/**
 * Initialize Prisma Client with credentials from Secrets Manager
 */
async function initializePrisma(): Promise<PrismaClient> {
  if (isInitialized && prisma) {
    return prisma;
  }

  const dbProxyEndpoint = process.env.DB_PROXY_ENDPOINT;
  if (!dbProxyEndpoint) {
    throw new Error('DB_PROXY_ENDPOINT environment variable not set');
  }

  console.log('[PrismaLambda] Fetching database credentials');
  const credentials = await getDatabaseCredentials();

  // Construct DATABASE_URL with password
  const databaseUrl = `postgresql://${credentials.username}:${credentials.password}@${dbProxyEndpoint}:5432/evscrap?schema=public`;
  
  console.log('[PrismaLambda] Initializing Prisma Client');
  
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ['error', 'warn'],
  });

  isInitialized = true;
  return prisma;
}

/**
 * Get Prisma Client (singleton pattern for Lambda container reuse)
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  if (!prisma || !isInitialized) {
    return await initializePrisma();
  }
  return prisma;
}
