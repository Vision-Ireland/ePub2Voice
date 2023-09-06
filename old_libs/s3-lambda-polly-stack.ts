import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import * as path from 'path';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class PollyLambdaS3TriggerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 Bucket
    const bucket = new s3.Bucket(this, 'Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create DynamoDB table to hold ebook info
    const table = new Table(this, 'Classifications', {
      partitionKey: {
        name: 'ebook_id',
        type: AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY // removes table on cdk destroy
    });

    // create mp3 output bucket
    const outputBucket = new s3.Bucket(this, 'OutputBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create Lambda function
    const lambdaFunction = new lambda.Function(this, 'ConvertEbookToAudio', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/convertEbookToAudio')),
      timeout: cdk.Duration.seconds(300),
      environment: {
        'BUCKET_NAME': bucket.bucketName,
        'TABLE_NAME': table.tableName,
        'OUTPUT_BUCKET_NAME': outputBucket.bucketName
      }
    });

    // add Polly permissions for Lambda function
    const statement = new iam.PolicyStatement();
    statement.addActions("polly:*");
    statement.addResources("*");
    // lambdaFunction.addToRolePolicy(statement);


    // add s3 permissions for Lambda function
    // const statement = new iam.PolicyStatement();
    statement.addActions("s3:PutObject");
    statement.addResources(outputBucket.bucketArn);
    // statement.addActions("polly:StartSpeechSynthesisTask, polly:GetSpeechSynthesisTask, polly:ListSpeechSynthesisTasks")
    // statement.addResources("*");
    lambdaFunction.addToRolePolicy(statement);

    const pollyStatement = new iam.PolicyStatement({ // Restrict to listing and describing tables
      actions: ["polly:StartSpeechSynthesisTask", "polly:GetSpeechSynthesisTask", "polly:ListSpeechSynthesisTasks"],
      resources: ['*'],
    })
    
    lambdaFunction.addToRolePolicy(pollyStatement);

    // create trigger for Lambda function with image type suffixes
    // bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(lambdaFunction),{suffix: '.epub'});

    // grant permissions for lambda to read/write to DynamoDB table and bucket
    table.grantReadWriteData(lambdaFunction);
    // bucket.grantReadWrite(lambdaFunction);



    // create Lambda function
    const HamzaTestingLambda = new lambda.Function(this, 'HamzaTestingLambda', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/convertEbookToAudio')),
      timeout: cdk.Duration.seconds(300),
      environment: {
        'BUCKET_NAME': bucket.bucketName,
        'TABLE_NAME': table.tableName,
        'OUTPUT_BUCKET_NAME': outputBucket.bucketName
      }
    });
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(HamzaTestingLambda),{suffix: '.epub'});

    const statementHamzaTestingLambda = new iam.PolicyStatement();
    statementHamzaTestingLambda.addActions("dynamodb:putItem");
    // add permission to write to ddb table
    table.grantReadWriteData(HamzaTestingLambda);
    bucket.grantReadWrite(HamzaTestingLambda);

	 new cdk.CfnOutput(this, "UploadEBookToS3", {
      value: `aws s3 cp <local-path-to-ebook> s3://${bucket.bucketName}/`,
      description: "Upload an image to S3 (using AWS CLI) to trigger polly",
    });
    new cdk.CfnOutput(this, "DynamoDBTable", {
      value: table.tableName,
      description: "This is where the ebook information will be stored.",
    });
    new cdk.CfnOutput(this, "LambdaFunction", {
      value: lambdaFunction.functionName,
    });
    new cdk.CfnOutput(this, "LambdaFunctionLogs", {
      value: lambdaFunction.logGroup.logGroupName,
    });
  }
}