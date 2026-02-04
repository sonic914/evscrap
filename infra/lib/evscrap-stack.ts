import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class EvscrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // S3: 증빙 자료 업로드용 버킷 (Private)
    // ========================================
    const evidenceBucket = new s3.Bucket(this, 'EvidenceBucket', {
      bucketName: `evscrap-evidence-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ========================================
    // Cognito: User Pools (폐차장용, 관리자용)
    // ========================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'evscrap-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        phone: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'evscrap-users-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    const adminPool = new cognito.UserPool(this, 'AdminPool', {
      userPoolName: 'evscrap-admins',
      selfSignUpEnabled: false, // 관리자는 수동 등록
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const adminPoolClient = new cognito.UserPoolClient(this, 'AdminPoolClient', {
      userPool: adminPool,
      userPoolClientName: 'evscrap-admins-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // ========================================
    // Lambda: Health Check Handler
    // ========================================
    const healthHandler = new lambda.Function(this, 'HealthHandler', {
      functionName: 'evscrap-health',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  const path = event.path || event.rawPath || '/';
  const now = new Date().toISOString();
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      status: 'healthy',
      timestamp: now,
      path: path,
      version: '0.1.0-phase0a',
    }),
  };
};
      `),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        BUCKET_NAME: evidenceBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        ADMIN_POOL_ID: adminPool.userPoolId,
      },
    });

    // S3 버킷 읽기 권한 (향후 presigned URL 생성용)
    evidenceBucket.grantRead(healthHandler);

    // ========================================
    // API Gateway: REST API
    // ========================================
    const api = new apigateway.RestApi(this, 'EvscrapApi', {
      restApiName: 'evscrap-api',
      description: 'evscrap Phase 0-A API',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        tracingEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const healthIntegration = new apigateway.LambdaIntegration(healthHandler);

    // GET /health
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', healthIntegration);

    // GET /user/v1/health
    const userResource = api.root.addResource('user');
    const userV1Resource = userResource.addResource('v1');
    const userHealthResource = userV1Resource.addResource('health');
    userHealthResource.addMethod('GET', healthIntegration);

    // GET /admin/v1/health
    const adminResource = api.root.addResource('admin');
    const adminV1Resource = adminResource.addResource('v1');
    const adminHealthResource = adminV1Resource.addResource('health');
    adminHealthResource.addMethod('GET', healthIntegration);

    // ========================================
    // CloudFormation Outputs
    // ========================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: 'EvscrapApiUrl',
    });

    new cdk.CfnOutput(this, 'EvidenceBucketName', {
      value: evidenceBucket.bucketName,
      description: 'S3 Evidence Bucket Name',
      exportName: 'EvscrapEvidenceBucket',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID (폐차장용)',
      exportName: 'EvscrapUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (폐차장용)',
      exportName: 'EvscrapUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'AdminPoolId', {
      value: adminPool.userPoolId,
      description: 'Cognito Admin Pool ID (관리자용)',
      exportName: 'EvscrapAdminPoolId',
    });

    new cdk.CfnOutput(this, 'AdminPoolClientId', {
      value: adminPoolClient.userPoolClientId,
      description: 'Cognito Admin Pool Client ID (관리자용)',
      exportName: 'EvscrapAdminPoolClientId',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });

    new cdk.CfnOutput(this, 'AccountId', {
      value: this.account,
      description: 'AWS Account ID',
    });
  }
}
