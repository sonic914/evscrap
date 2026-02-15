import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

/**
 * 정적 웹 호스팅 스택 (admin-web + user-web)
 * - S3 (Block Public Access) + CloudFront OAC
 * - SPA fallback: Custom Error Response 403/404 → /index.html
 */
export class WebHostingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // Admin Web
    // ========================================
    const adminBucket = new s3.Bucket(this, 'AdminWebBucket', {
      bucketName: `evscrap-admin-web-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const adminDist = this.createDistribution('AdminWeb', adminBucket);

    // ========================================
    // User Web
    // ========================================
    const userBucket = new s3.Bucket(this, 'UserWebBucket', {
      bucketName: `evscrap-user-web-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userDist = this.createDistribution('UserWeb', userBucket);

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'AdminWebBucketName', {
      value: adminBucket.bucketName,
      exportName: 'EvscrapAdminWebBucket',
    });
    new cdk.CfnOutput(this, 'AdminWebDistributionId', {
      value: adminDist.distributionId,
      exportName: 'EvscrapAdminWebDistributionId',
    });
    new cdk.CfnOutput(this, 'AdminWebUrl', {
      value: `https://${adminDist.distributionDomainName}`,
      exportName: 'EvscrapAdminWebUrl',
    });

    new cdk.CfnOutput(this, 'UserWebBucketName', {
      value: userBucket.bucketName,
      exportName: 'EvscrapUserWebBucket',
    });
    new cdk.CfnOutput(this, 'UserWebDistributionId', {
      value: userDist.distributionId,
      exportName: 'EvscrapUserWebDistributionId',
    });
    new cdk.CfnOutput(this, 'UserWebUrl', {
      value: `https://${userDist.distributionDomainName}`,
      exportName: 'EvscrapUserWebUrl',
    });
  }

  private createDistribution(prefix: string, bucket: s3.Bucket): cloudfront.Distribution {
    // Security headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, `${prefix}SecurityHeaders`, {
      responseHeadersPolicyName: `evscrap-${prefix.toLowerCase()}-security`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, `${prefix}Distribution`, {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA fallback: 403/404 → /index.html (200)
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    return distribution;
  }
}
