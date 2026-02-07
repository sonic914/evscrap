# Anchor Worker Testing Progress

## ✅ Completed

1. **CDK Infrastructure Deployed**
   - SQS Queue: `evscrap-anchor-events-queue`
   - SQS DLQ: `evscrap-anchor-events-dlq`
   - Lambda Function: `evscrap-anchor-worker`

2. **Lambda Bundling Fixed**
   - Created proper bundling script (`scripts/bundle-lambda.js`)
   - Bundle includes all dependencies (223 packages)
   - Prisma Client properly generated
   - CDK updated to use `dist/lambda` directory

3. **Lambda Deployment Status**
   - Function successfully initializes (Init Duration: 175ms)
   - Memory usage: ~74 MB
   - Runtime: Node.js 20.x

## 🔍 Current Issue

Lambda is running but encountering an error. From CloudWatch Logs:

```
ERROR Uncaught Exception
```

The error message is truncated in CLI output.

## 📋 Next Steps

**Option 1: Check Cloud Watch Logs in Console (Recommended)**

1. Open [CloudWatch Logs Console](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fevscrap-anchor-worker)
2. Click the latest log stream
3. Find the full error message
4. Check for:
   - Database connection errors
   - Missing environment variables
   - Prisma Client errors

**Option 2: Add More Logging**

Update `core-api/src/anchor-worker/index.ts` to add try-catch and detailed logging:

```typescript
export const handler = async (event: SQSEvent): Promise<void> => {
  console.log("[AnchorWorker] Starting, event:", JSON.stringify(event));

  try {
    // ... existing code
  } catch (error) {
    console.error("[AnchorWorker] Fatal error:", error);
    throw error;
  }
};
```

Then rebuild, rebundle, and redeploy.

## Likely Issues

Based on the symptoms, possible causes:

1. **Database Connection**: Lambda can't connect to RDS Proxy
   - Check VPC/Security Group configuration
   - Verify `DB_PROXY_ENDPOINT` environment variable

2. **Secrets Manager**: Can't read database credentials
   - Verify `DB_SECRET_ARN` is correct
   - Check Lambda IAM permissions

3. **Prisma Client**: Binary not compatible with Lambda runtime
   - May need to use `binaryTargets` in schema.prisma

## Testing Commands

Once fixed, test with:

```powershell
# Send test message
cd c:\Users\sonic\Projects\evscrap\evscrap
powershell -ExecutionPolicy Bypass -File test-worker-simple.ps1
```

Expected successful log output:

```
[AnchorWorker] Received 1 message(s)
[ProcessEvent] Starting: test-event-...
[ProcessEvent] Event not found: test-event-... (expected for test)
```
