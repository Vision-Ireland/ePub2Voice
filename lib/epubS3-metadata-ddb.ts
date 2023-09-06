import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import * as path from 'path';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class EpubS3MetadataDdbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 Bucket
    const bucket = new s3.Bucket(this, 'allEpubFiles', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create DynamoDB table to hold ebook info
    const table = new Table(this, 'metadataTable', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING
      },
      sortKey: {
        name: "sortKey", // this is different for different things, so we need to keep it generically labeled
        type: AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY // removes table on cdk destroy
    });

    const saveBookMetadata = new NodejsFunction(this, 'saveBookMetadata', {
      entry: path.join(__dirname, '../lambda/saveBookMetadata/index.ts'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(100),
      environment: {
        'BUCKET_NAME': bucket.bucketName,
        'TABLE_NAME': table.tableName,
      }
    })
    
    const policy = new iam.PolicyStatement();
    policy.addActions("dynamodb:PutItem");
    policy.addResources(table.tableArn);
    saveBookMetadata.addToRolePolicy(policy);
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(saveBookMetadata),{suffix: '.epub'});

    const statement = new iam.PolicyStatement();
    statement.addActions("dynamodb:putItem");
    // add permission to write to ddb table
    table.grantReadWriteData(saveBookMetadata);
    bucket.grantReadWrite(saveBookMetadata);

	 new cdk.CfnOutput(this, "UploadEBookToS3", {
      value: `aws s3 cp <local-path-to-ebook> s3://${bucket.bucketName}/`,
      description: "Upload an image to S3 (using AWS CLI) to trigger polly",
    });
    new cdk.CfnOutput(this, "DynamoDBTable", {
      value: table.tableName,
      description: "This is where the ebook information will be stored.",
      exportName: "DynamoDBTable"
    });
    new cdk.CfnOutput(this, "ebookBucketArn", {
      value: bucket.bucketArn,
      description: "This is where the ebooks will be stored.",
      exportName: "ebookBucketArn"
    })
    new cdk.CfnOutput(this, "LambdaFunction", {
      value: saveBookMetadata.functionName,
      exportName: "saveBookMetadataLambda"
    });
  }
}