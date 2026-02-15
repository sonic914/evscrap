#!/usr/bin/env node
/**
 * CDK Outputs에서 프론트엔드 .env.local 파일 자동 생성
 * 사용: node scripts/gen-frontend-env.mjs [cdk-outputs.json 경로]
 *
 * 토큰/비밀번호는 절대 저장하지 않음
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// CDK outputs 파일 경로
const outputsPath = process.argv[2] || resolve(root, 'infra/cdk-outputs.json');

let outputs;
try {
  const raw = JSON.parse(readFileSync(outputsPath, 'utf-8'));
  outputs = raw.EvscrapStack || Object.values(raw)[0] || {};
} catch {
  console.error(`❌ CDK outputs 파일을 읽을 수 없습니다: ${outputsPath}`);
  console.error('   먼저 CDK deploy 또는 cdk synth를 실행하세요.');
  process.exit(1);
}

const apiBase = outputs.ApiEndpoint || outputs.ApiUrl || '';
const userPoolId = outputs.UserPoolId || '';
const userPoolClientId = outputs.UserPoolClientId || '';
const adminPoolId = outputs.AdminPoolId || '';
const adminPoolClientId = outputs.AdminPoolClientId || '';

// admin-web/.env.local
const adminEnv = `NEXT_PUBLIC_API_BASE=${apiBase}
NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN=${adminPoolId}
NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN=${adminPoolClientId}
NEXT_PUBLIC_AWS_REGION=ap-northeast-2
`;

// user-web/.env.local
const userEnv = `VITE_API_BASE=${apiBase}
VITE_COGNITO_USER_POOL_ID_USER=${userPoolId}
VITE_COGNITO_CLIENT_ID_USER=${userPoolClientId}
VITE_AWS_REGION=ap-northeast-2
`;

writeFileSync(resolve(root, 'admin-web/.env.local'), adminEnv);
console.log('✅ admin-web/.env.local 생성 완료');

writeFileSync(resolve(root, 'user-web/.env.local'), userEnv);
console.log('✅ user-web/.env.local 생성 완료');

console.log('\n--- 생성된 값 (비밀번호 미포함) ---');
console.log(`API_BASE=${apiBase}`);
console.log(`USER_POOL_ID=${userPoolId}`);
console.log(`ADMIN_POOL_ID=${adminPoolId}`);
