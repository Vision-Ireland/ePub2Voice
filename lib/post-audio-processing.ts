import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';

export class PostAudioProcessing extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /** ------------------ Import resources from other CDK stacks ------------------ */
    // import existing resources from other cdk

    const table = dynamodb.Table.fromTableName(this, "DynamoDBTable",
      cdk.Fn.importValue("DynamoDBTable")
    )

    const topic = new Topic(this, "triggerPostAudioLambda", {
      displayName: "triggerPostAudioLambda"
    })

    const textOutputBucket = new s3.Bucket(this, 'textOutputBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const audioOutputBucket = new s3.Bucket(this, 'audioOutputBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    

    const postAudioProcessingLambda = new NodejsFunction(this, 'postAudioProcessing', {
      timeout: cdk.Duration.seconds(100),
      handler: 'index.handler',
      entry: path.join(__dirname, '../lambda/postAudioProcessing/index.ts'),
      environment: {
        'TABLE_NAME': table.tableName,
        "TEXT_OUTPUT_BUCKET": textOutputBucket.bucketName,
        "AUDIO_OUTPUT_BUCKET_NAME": audioOutputBucket.bucketName,
        "SNS_TOPIC_ARN": topic.topicArn
      }
    });

    postAudioProcessingLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:StartSpeechSynthesisTask'],
      resources: ['*'],
    }))

    topic.grantPublish(postAudioProcessingLambda)

    topic.addSubscription(new subs.LambdaSubscription(postAudioProcessingLambda));
    table.grantReadWriteData(postAudioProcessingLambda);
    textOutputBucket.grantReadWrite(postAudioProcessingLambda);
    audioOutputBucket.grantReadWrite(postAudioProcessingLambda);

    new cdk.CfnOutput(this, 'triggerPostAudioLambdaTopicArn', {
      value: topic.topicArn,
      exportName: "triggerPostAudioLambdaTopicArn",
      description: 'The arn of the SNS topic',
    })

    new cdk.CfnOutput(this, "textOutputBucketArn", {
      value: textOutputBucket.bucketArn,
      exportName: 'textOutputBucketArn'
    });

    new cdk.CfnOutput(this, "audioOutputBucketArn", {
      value: textOutputBucket.bucketArn,
      exportName: 'audioOutputBucketArn'
    });
  }
}