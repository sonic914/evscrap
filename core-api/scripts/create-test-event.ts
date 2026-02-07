import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function createTestEvent() {
  try {
    // 1. 먼저 테넌트 생성 (또는 기존 테넌트 사용)
    const tenant = await prisma.tenant.upsert({
      where: { id: 'test-tenant-001' },
      update: {},
      create: {
        id: 'test-tenant-001',
        displayName: 'Test Tenant',
        phoneNumber: '+821012345678',
        status: 'APPROVED',
      },
    });
    console.log('✅ Tenant:', tenant.id);

    // 2. Case 생성
    const testCase = await prisma.case.upsert({
      where: { id: 'test-case-001' },
      update: {},
      create: {
        id: 'test-case-001',
        vin: 'TEST-VIN-123456789',
        make: 'Tesla',
        model: 'Model 3',
        year: 2023,
        tenantId: tenant.id,
      },
    });
    console.log('✅ Case:', testCase.id);

    // 3. Event 생성 (PENDING 상태)
    const eventPayload = {
      eventType: 'CASE_CREATED',
      caseId: testCase.id,
      vin: testCase.vin,
      make: testCase.make,
      model: testCase.model,
    };

    const canonicalHash = createHash('sha256')
      .update(JSON.stringify(eventPayload))
      .digest('hex');

    const event = await prisma.event.create({
      data: {
        id: `test-event-${Date.now()}`,
        targetType: 'CASE',
        targetId: testCase.id,
        eventType: 'CASE_CREATED',
        occurredAt: new Date(),
        payload: eventPayload,
        canonicalHash,
        anchorStatus: 'PENDING', // ⭐ 중요: PENDING 상태
        tenantId: tenant.id,
        caseId: testCase.id,
      },
    });

    console.log('\n🎉 테스트 이벤트 생성 완료!\n');
    console.log('Event ID:', event.id);
    console.log('Anchor Status:', event.anchorStatus);
    console.log('\n다음 명령어로 SQS 메시지 전송:');
    console.log(`aws sqs send-message \\
  --queue-url "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue" \\
  --message-body "{\\"eventId\\":\\"${event.id}\\"}" \\
  --region ap-northeast-2`);

    return event;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTestEvent();
