import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import * as path from 'path';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class CreateTextFromEbook extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 Bucket
    const ebookBucket = s3.Bucket.fromBucketArn(this, 'ebookBucket', 
      cdk.Fn.importValue('ebookBucketArn')
    );

    // const table = dynamodb.Table.fromTableName(this, "DynamoDBTable",
    //   cdk.Fn.importValue("DynamoDBTable")
    // )
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

    const checkForAudioBookLambda = new lambda.Function(this, 'checkForAudioBook', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/checkForAudioBook')),
      timeout: cdk.Duration.seconds(100),
      environment: {
        'BUCKET_NAME': ebookBucket.bucketName,
        'TABLE_NAME': table.tableName,
      }
    });
    const checkForAudioBookLambdaStatement = new iam.PolicyStatement();
    checkForAudioBookLambdaStatement.addActions("dynamodb:Query");
    checkForAudioBookLambdaStatement.addResources(table.tableArn);
    checkForAudioBookLambda.addToRolePolicy(checkForAudioBookLambdaStatement);

    // create mp3 output ebookBucket
    const outputBucket = new s3.Bucket(this, 'OutputBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // create Lambda function
    const convertToTextLambda = new lambda.Function(this, 'ConvertEbookToText', {
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/convertEbookToText')),
      timeout: cdk.Duration.seconds(100),
      environment: {
        'BUCKET_NAME': ebookBucket.bucketName,
        // 'TABLE_NAME': table.tableName,
        'OUTPUT_BUCKET_NAME': outputBucket.bucketName
      }
    });
    outputBucket.grantReadWrite(convertToTextLambda);
    // add Polly permissions for Lambda function
    const statement = new iam.PolicyStatement();
    statement.addActions("s3:*");
    statement.addResources("*");
    // statement.addActions("s3:Get*");
    // statement.addResources(ebookBucket.bucketArn + "/*");

    // statement.addActions("s3:List*");
    // statement.addResources(ebookBucket.bucketArn);

    // statement.addActions("s3:Put*");
    // statement.addResources(outputBucket.bucketArn + "/*");
    // statement.addActions("polly:StartSpeechSynthesisTask, polly:GetSpeechSynthesisTask, polly:ListSpeechSynthesisTasks")
    // statement.addResources("*");
    convertToTextLambda.addToRolePolicy(statement);

    const pollyStatement = new iam.PolicyStatement({ // Restrict to listing and describing tables
      actions: ["polly:StartSpeechSynthesisTask", "polly:GetSpeechSynthesisTask", "polly:ListSpeechSynthesisTasks"],
      resources: ['*'],
    })
    convertToTextLambda.addToRolePolicy(pollyStatement);
    ebookBucket.grantReadWrite(convertToTextLambda);


    new cdk.CfnOutput(this, "convertToText", {
      value: convertToTextLambda.functionName,
    });
  }
}