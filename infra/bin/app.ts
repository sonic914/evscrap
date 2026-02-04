#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EvscrapStack } from '../lib/evscrap-stack';

const app = new cdk.App();

// 고정 환경 설정
const env = {
  account: '090733632671',
  region: 'ap-northeast-2',
};

new EvscrapStack(app, 'EvscrapStack', {
  env,
  description: 'evscrap Phase 0-A: 배포 가능한 테스트 환경 골격',
  tags: {
    Project: 'evscrap',
    Environment: 'dev',
    Phase: '0-A',
  },
});

app.synth();
