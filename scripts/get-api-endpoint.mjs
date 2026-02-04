#!/usr/bin/env node

/**
 * CDK Outputs 파일에서 API endpoint URL을 추출하는 스크립트
 * 
 * 사용법:
 *   node get-api-endpoint.mjs <outputs-file> <stack-name>
 * 
 * 예:
 *   node get-api-endpoint.mjs cdk-outputs.json EvscrapStack
 * 
 * 출력:
 *   https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/
 */

import fs from 'fs';
import path from 'path';

function main() {
  // 인자 확인
  if (process.argv.length < 4) {
    console.error('Usage: node get-api-endpoint.mjs <outputs-file> <stack-name>');
    console.error('Example: node get-api-endpoint.mjs cdk-outputs.json EvscrapStack');
    process.exit(1);
  }

  const outputsFile = process.argv[2];
  const stackName = process.argv[3];

  // 파일 존재 확인
  if (!fs.existsSync(outputsFile)) {
    console.error(`Error: Outputs file not found: ${outputsFile}`);
    console.error('Make sure to run: npx cdk deploy --outputs-file cdk-outputs.json');
    process.exit(1);
  }

  // 파일 읽기
  let outputs;
  try {
    const content = fs.readFileSync(outputsFile, 'utf-8');
    outputs = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Failed to parse outputs file: ${error.message}`);
    process.exit(1);
  }

  // 스택 확인
  if (!outputs[stackName]) {
    console.error(`Error: Stack not found: ${stackName}`);
    console.error(`Available stacks: ${Object.keys(outputs).join(', ')}`);
    process.exit(1);
  }

  const stackOutputs = outputs[stackName];

  // API URL 찾기 (키 이름: ApiUrl)
  const apiUrlKey = 'ApiUrl';
  if (!stackOutputs[apiUrlKey]) {
    console.error(`Error: API URL output not found in stack ${stackName}`);
    console.error(`Available outputs: ${Object.keys(stackOutputs).join(', ')}`);
    process.exit(1);
  }

  const apiUrl = stackOutputs[apiUrlKey];
  
  // URL이 /로 끝나는지 확인
  const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
  
  // 표준 출력으로 URL 출력 (다른 스크립트에서 사용 가능)
  console.log(baseUrl);
}

main();
