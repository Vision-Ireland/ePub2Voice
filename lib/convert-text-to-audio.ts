import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as path from 'path';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Topic } from 'aws-cdk-lib/aws-sns';



export class ConvertTextToAudio extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /** ------------------ Import resources from other CDK stacks ------------------ */  
    // import existing resources from other cdk

    const table = dynamodb.Table.fromTableName(this, "DynamoDBTable",
      cdk.Fn.importValue("DynamoDBTable")
    )
    // const table = new Table(this, 'metadataTable', {
    //   partitionKey: {
    //     name: 'id',
    //     type: AttributeType.STRING
    //   },
    //   sortKey: {
    //     name: "sortKey", // this is different for different things, so we need to keep it generically labeled
    //     type: AttributeType.STRING
    //   },
    //   removalPolicy: cdk.RemovalPolicy.DESTROY // removes table on cdk destroy
    // });
    const topic = Topic.fromTopicArn(this, "triggerPostAudioLambdaTopicArn", cdk.Fn.importValue('triggerPostAudioLambdaTopicArn'))

    // create resources
    const textOutputBucket = s3.Bucket.fromBucketArn(this, 'textOutputBucket',
      cdk.Fn.importValue('textOutputBucketArn')
    );

    const audioOutputBucket = s3.Bucket.fromBucketArn(this, 'audioOutputBucket',
      cdk.Fn.importValue('audioOutputBucketArn')
    );
    

    /** ------------------ Lambda Handlers Definition ------------------ */  
    const convertToAudioLambda = new NodejsFunction(this, 'convertToAudio', {
      entry: path.join(__dirname, '../lambda/convertTextToAudio/index.ts'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(100),
      memorySize: 512,
      environment: {
        'AUDIO_OUTPUT_BUCKET_NAME': audioOutputBucket.bucketName,
        "TEXT_OUTPUT_BUCKET_NAME": textOutputBucket.bucketName,
        'TABLE_NAME': table.tableName,
        'SNS_TOPIC_ARN': topic.topicArn
      }
    })
    table.grantReadWriteData(convertToAudioLambda)

    // give lambda permission to do polly:StartSpeechSynthesisTask
    convertToAudioLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['polly:StartSpeechSynthesisTask'],
      resources: ['*'],
    }))

    textOutputBucket.grantReadWrite(convertToAudioLambda);
    audioOutputBucket.grantReadWrite(convertToAudioLambda);
    topic.grantPublish(convertToAudioLambda);

    /** ------------------ Step functions Definition ------------------ */
    const convertTextToAudioTask = new tasks.LambdaInvoke(this, "convertTextToAudioTask", {
      lambdaFunction: convertToAudioLambda
    })

    const stateMachine = new sfn.StateMachine(this, 'ConvertTextToAudio', {
      definition: convertTextToAudioTask
    });

    // define outputs
    new cdk.CfnOutput(this, "TextToPollySfn", {
      value: stateMachine.stateMachineArn,
      exportName: 'TextToPollySfn'
    });

    new cdk.CfnOutput(this, "convertToAudioLambda", {
      value: convertToAudioLambda.functionArn,
      exportName: 'convertToAudioLambda'
    })

    
}
}