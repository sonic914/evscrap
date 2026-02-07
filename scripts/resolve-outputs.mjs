#!/usr/bin/env node
/**
 * resolve-outputs.mjs
 * CDK outputs JSON 또는 CloudFormation describe-stacks에서 값을 추출하여
 * KEY=VALUE 형식으로 출력한다 (GitHub Actions $GITHUB_ENV 호환).
 *
 * 사용법: node scripts/resolve-outputs.mjs [cdk-outputs-file]
 * 기본 파일: infra/cdk-outputs.json
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const STACK_NAME = 'EvscrapStack';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';

// ──────── 키 매핑 (다양한 이름 후보 → 표준 키) ────────
const KEY_MAP = {
  API_BASE: ['ApiUrl', 'ApiBaseUrl', 'RestApiUrl', 'ApiGatewayUrl', 'ServiceUrl'],
  USER_POOL_ID: ['UserPoolId', 'ScrapyardUserPoolId', 'UserUserPoolId'],
  USER_POOL_CLIENT_ID: ['UserPoolClientId', 'ScrapyardClientId', 'UserClientId'],
  ADMIN_POOL_ID: ['AdminPoolId', 'AdminUserPoolId'],
  ADMIN_POOL_CLIENT_ID: ['AdminPoolClientId', 'AdminUserPoolClientId', 'AdminClientId'],
};

// ──────── 1) CDK outputs JSON에서 추출 ────────
function fromCdkOutputs(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    // cdk-outputs.json 형식: { "StackName": { "KeyName": "value", ... } }
    const stack = raw[STACK_NAME] || Object.values(raw)[0];
    if (!stack) return null;
    return stack;
  } catch {
    return null;
  }
}

// ──────── 2) CloudFormation describe-stacks에서 추출 ────────
function fromCloudFormation() {
  try {
    const cmd = `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --output json`;
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }));
    const outputs = result.Stacks?.[0]?.Outputs || [];
    const map = {};
    for (const o of outputs) {
      map[o.OutputKey] = o.OutputValue;
    }
    return map;
  } catch (e) {
    console.error(`[resolve-outputs] CloudFormation 조회 실패: ${e.message}`);
    return null;
  }
}

// ──────── 매칭 ────────
function resolveValue(outputMap, candidates) {
  for (const key of candidates) {
    if (outputMap[key]) return outputMap[key];
  }
  return '';
}

// ──────── MAIN ────────
const cdkFile = resolve(process.argv[2] || 'infra/cdk-outputs.json');
let outputs = fromCdkOutputs(cdkFile);
let source = 'cdk-outputs.json';

if (!outputs) {
  console.error(`[resolve-outputs] ${cdkFile} 없음/파싱 실패 → CloudFormation fallback`);
  outputs = fromCloudFormation();
  source = 'CloudFormation describe-stacks';
}

if (!outputs) {
  console.error('[resolve-outputs] ❌ 어디서도 outputs를 가져올 수 없습니다.');
  process.exit(1);
}

console.error(`[resolve-outputs] ✅ source: ${source}`);

const result = {};
for (const [envKey, candidates] of Object.entries(KEY_MAP)) {
  result[envKey] = resolveValue(outputs, candidates);
}

// stdout으로 KEY=VALUE 출력 (GITHUB_ENV 호환)
for (const [k, v] of Object.entries(result)) {
  if (v) {
    console.log(`${k}=${v}`);
  } else {
    console.error(`[resolve-outputs] ⚠️  ${k} 값을 찾을 수 없음`);
  }
}
