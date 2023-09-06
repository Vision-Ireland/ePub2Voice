import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from "constructs";
import * as path from 'path';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class PollyToLambda extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // create mp3 output ebookBucket
        const outputBucket = new s3.Bucket(this, 'OutputBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // create Lambda function
        const handlePolly = new lambda.Function(this, 'handlePolly', {
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/handlePolly')),
            timeout: cdk.Duration.seconds(100),
            environment: {
                'OUTPUT_BUCKET_NAME': outputBucket.bucketName
            }
        });

        // add Polly permissions for Lambda function
        const statement = new iam.PolicyStatement();
        statement.addActions("s3:PutObject");
        statement.addResources(outputBucket.bucketArn);
        // statement.addActions("polly:StartSpeechSynthesisTask, polly:GetSpeechSynthesisTask, polly:ListSpeechSynthesisTasks")
        // statement.addResources("*");
        handlePolly.addToRolePolicy(statement);

        const pollyStatement = new iam.PolicyStatement({ // Restrict to listing and describing tables
            actions: ["polly:StartSpeechSynthesisTask", "polly:GetSpeechSynthesisTask", "polly:ListSpeechSynthesisTasks"],
            resources: ['*'],
        })
        
        handlePolly.addToRolePolicy(pollyStatement);
        outputBucket.grantReadWrite(handlePolly);

        outputBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(handlePolly), { suffix: '.mp3' });
    }
}