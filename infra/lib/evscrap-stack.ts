import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
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
    // VPC: RDS 및 Lambda 네트워크
    // ========================================
    const vpc = new ec2.Vpc(this, 'EvscrapVpc', {
      vpcName: 'evscrap-vpc',
      maxAzs: 2,
      natGateways: 1, // 비용 절감: NAT Gateway 1개만
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ========================================
    // RDS Postgres + RDS Proxy
    // ========================================
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      securityGroupName: 'evscrap-db-sg',
      description: 'Security group for RDS Postgres',
      allowAllOutbound: false,
    });

    // Lambda Security Group
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      securityGroupName: 'evscrap-lambda-sg',
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    // Lambda -> DB 접근 허용
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to access RDS Postgres'
    );

    // DB Credentials Secret
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: 'evscrap/db/credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'evscrap_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 30,
      },
    });

    // RDS Postgres (dev 최소 사양)
    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier: 'evscrap-db',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'evscrap',
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false, // dev 환경
    });

    // RDS Proxy
    const dbProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
      secrets: [dbSecret],
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      dbProxyName: 'evscrap-db-proxy',
      requireTLS: false, // dev 환경: prod에서는 true
      maxConnectionsPercent: 100,
      maxIdleConnectionsPercent: 50,
    });

    // ========================================
    // Bastion Host (임시 - 마이그레이션용)
    // ========================================
    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc,
      securityGroupName: 'evscrap-bastion-sg',
      description: 'Security group for Bastion Host',
      allowAllOutbound: true,
    });

    // Bastion에서 DB 접근 허용
    dbSecurityGroup.addIngressRule(
      bastionSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Bastion Host to access RDS'
    );

    const bastionHost = new ec2.Instance(this, 'BastionHost', {
      instanceName: 'evscrap-bastion',
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.NANO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: bastionSecurityGroup,
      ssmSessionPermissions: true, // SSM Agent 권한 자동 부여
    });

    // PostgreSQL 클라이언트 자동 설치
    bastionHost.userData.addCommands(
      'yum update -y',
      'yum install -y postgresql15'
    );

    // Bastion에 Secret Manager 읽기 권한 (마이그레이션용)
    dbSecret.grantRead(bastionHost.role);

    // ========================================
    // SQS: Anchor Events Queue
    // ========================================
    const anchorDLQ = new sqs.Queue(this, 'AnchorEventsDLQ', {
      queueName: 'evscrap-anchor-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const anchorQueue = new sqs.Queue(this, 'AnchorEventsQueue', {
      queueName: 'evscrap-anchor-events-queue',
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: anchorDLQ,
        maxReceiveCount: 5,
      },
    });

    // ========================================
    // Lambda: Anchor Worker
    // ========================================
    // CloudWatch Log Groups (명시적 — logRetention deprecated 와일드카드 제거)
    const workerLogGroup = new logs.LogGroup(this, 'AnchorWorkerLogGroup', {
      logGroupName: '/aws/lambda/evscrap-anchor-worker',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiHandlerLogGroup', {
      logGroupName: '/aws/lambda/evscrap-api',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const anchorWorker = new lambda.Function(this, 'AnchorWorker', {
      functionName: 'evscrap-anchor-worker',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'anchor-worker/index.handler',
      code: lambda.Code.fromAsset('../core-api/dist/lambda'),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      logGroup: workerLogGroup,
      environment: {
        DATABASE_URL: `postgresql://evscrap_admin@${dbProxy.endpoint}:5432/evscrap?schema=public`,
        DB_PROXY_ENDPOINT: dbProxy.endpoint,
        DB_SECRET_ARN: dbSecret.secretArn,
        NODE_ENV: 'production',
      },
    });

    // SQS 트리거 연결
    anchorWorker.addEventSource(
      new SqsEventSource(anchorQueue, {
        batchSize: 1,
        maxBatchingWindow: cdk.Duration.seconds(0),
      })
    );

    // Worker에 Secret 읽기 권한
    dbSecret.grantRead(anchorWorker);

    // Worker에 SQS 권한 (자동 부여되지만 명시)
    anchorQueue.grantConsumeMessages(anchorWorker);

    // ========================================
    // Lambda: API Handler (Express via serverless-express)
    // ========================================
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: 'evscrap-api',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handlers/api.handler',
      code: lambda.Code.fromAsset('../core-api/dist/lambda'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      logGroup: apiLogGroup,
      environment: {
        DATABASE_URL: `postgresql://evscrap_admin@${dbProxy.endpoint}:5432/evscrap?schema=public`,
        DB_PROXY_ENDPOINT: dbProxy.endpoint,
        DB_SECRET_ARN: dbSecret.secretArn,
        BUCKET_NAME: evidenceBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        ADMIN_POOL_ID: adminPool.userPoolId,
        ADMIN_POOL_CLIENT_ID: adminPoolClient.userPoolClientId,
        ANCHOR_QUEUE_URL: anchorQueue.queueUrl,
        TEST_AUTH_SECRET: 'evscrap-test-secret-2026',
        ADMIN_AUTH_SECRET: 'evscrap-admin-secret-2026',
        NODE_ENV: 'production',
      },
    });

    // API Lambda 권한 (최소권한)
    dbSecret.grantRead(apiHandler);
    evidenceBucket.grantRead(apiHandler);   // GetObject, ListBucket
    evidenceBucket.grantPut(apiHandler);    // PutObject만 (DeleteObject 제거 — 증빙 삭제 불가)
    anchorQueue.grantSendMessages(apiHandler);

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

    const apiIntegration = new apigateway.LambdaIntegration(apiHandler);

    // GET /health (직접 매핑)
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', apiIntegration);

    // /{proxy+} → Express 라우팅으로 전체 위임
    const proxyResource = api.root.addProxy({
      defaultIntegration: apiIntegration,
      anyMethod: true,
    });

    // ========================================
    // Observability: SNS Topic + CloudWatch Alarms
    // ========================================
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'evscrap-alarms',
      displayName: 'evscrap Alerts (Slack/Email 연동 대기)',
    });

    const alarmAction = new cw_actions.SnsAction(alarmTopic);

    // 1) API Gateway 5XX Error Rate
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: 'evscrap-api-5xx',
      alarmDescription: 'API Gateway 5XX 에러 발생',
      metric: api.metricServerError({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(alarmAction);

    // 2) Anchor Worker Lambda Errors
    const workerErrorAlarm = new cloudwatch.Alarm(this, 'WorkerErrorAlarm', {
      alarmName: 'evscrap-worker-errors',
      alarmDescription: 'Anchor Worker Lambda 에러 발생',
      metric: anchorWorker.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    workerErrorAlarm.addAlarmAction(alarmAction);

    // 3) SQS DLQ 메시지 수 > 0
    const dlqAlarm = new cloudwatch.Alarm(this, 'DlqAlarm', {
      alarmName: 'evscrap-dlq-messages',
      alarmDescription: 'SQS DLQ에 메시지 존재 — 앵커링 실패 메시지 확인 필요',
      metric: anchorDLQ.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(alarmAction);

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

    new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
      value: dbProxy.endpoint,
      description: 'RDS Proxy Endpoint',
      exportName: 'EvscrapDatabaseProxyEndpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: dbSecret.secretArn,
      description: 'Database Secret ARN',
      exportName: 'EvscrapDatabaseSecretArn',
    });

    new cdk.CfnOutput(this, 'AnchorQueueUrl', {
      value: anchorQueue.queueUrl,
      description: 'Anchor Events Queue URL',
      exportName: 'EvscrapAnchorQueueUrl',
    });

    new cdk.CfnOutput(this, 'AnchorQueueArn', {
      value: anchorQueue.queueArn,
      description: 'Anchor Events Queue ARN',
      exportName: 'EvscrapAnchorQueueArn',
    });

    new cdk.CfnOutput(this, 'AnchorWorkerArn', {
      value: anchorWorker.functionArn,
      description: 'Anchor Worker Lambda ARN',
      exportName: 'EvscrapAnchorWorkerArn',
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'VPC ID',
      exportName: 'EvscrapVpcId',
    });

    new cdk.CfnOutput(this, 'BastionInstanceId', {
      value: bastionHost.instanceId,
      description: 'Bastion Host Instance ID (for SSM)',
      exportName: 'EvscrapBastionInstanceId',
    });
  }
}
