import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let expressHandler: any;

/**
 * Cold start 시 Secret Manager에서 DB 비밀번호를 가져와 DATABASE_URL을 완성한 후,
 * Express 앱을 dynamic import하여 Prisma가 올바른 연결 문자열을 사용하도록 합니다.
 */
async function init() {
  if (expressHandler) return;

  // Secret Manager에서 DB 비밀번호 가져와서 DATABASE_URL 업데이트
  if (process.env.DB_SECRET_ARN && process.env.DATABASE_URL) {
    try {
      const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
      const secret = await sm.send(
        new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
      );
      const creds = JSON.parse(secret.SecretString!);
      const user = creds.username || 'evscrap_admin';
      const pass = encodeURIComponent(creds.password);
      // postgresql://user@host:port/db → postgresql://user:password@host:port/db
      process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
        `${user}@`,
        `${user}:${pass}@`
      );
      console.log('[init] DATABASE_URL updated with secret credentials');
    } catch (err) {
      console.error('[init] Failed to fetch DB secret:', err);
      throw err;
    }
  }

  // Dynamic import: prisma.ts가 모듈 로드 시 업데이트된 DATABASE_URL을 사용
  const serverlessExpress = (await import('@vendia/serverless-express')).default;
  const { default: app } = await import('../app');
  expressHandler = serverlessExpress({ app });
}

export const handler = async (event: any, context: any) => {
  await init();
  return expressHandler(event, context);
};
