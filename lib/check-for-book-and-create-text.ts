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
import { CheckForBookResult } from '../interfaces/enums';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';



export class CheckForBookAndCreateTextStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /** ------------------ Import resources from other CDK stacks ------------------ */  
    // import existing resources from other cdk
    const ebookBucket = s3.Bucket.fromBucketArn(this, 'ebookBucket', 
      cdk.Fn.importValue('ebookBucketArn')
    );

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
    // const textToPollySfn = sfn.StateMachine.fromStateMachineArn(this, "TextToPollySfn",
    //   cdk.Fn.importValue("TextToPollySfn")
    // )    

    // create resources
    // const outputBucket = new s3.Bucket(this, 'OutputBucket', {
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    // });
    const textOutputBucket = s3.Bucket.fromBucketArn(this, 'textOutputBucket',
      cdk.Fn.importValue('textOutputBucketArn')
    );


    
    /** ------------------ Lambda Handlers Definition ------------------ */   
    // create lambdas (first lambda)
    // const checkForAudioBookLambda = new lambda.Function(this, 'checkForAudioBook', {
    //   handler: 'index.handler',
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/checkForAudioBook')),
    //   timeout: cdk.Duration.seconds(300),
    //   environment: {
    //     'BUCKET_NAME': ebookBucket.bucketName,
    //     'TABLE_NAME': table.tableName,
    //   }
    // });
    const checkForAudioBookLambda = new NodejsFunction(this, 'checkForAudioBook', {
      entry: path.join(__dirname, '../lambda/checkForAudioBook/index.ts'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(100),
      environment: {
        'BUCKET_NAME': ebookBucket.bucketName,
        'TABLE_NAME': table.tableName,
      }
    })
    const checkForAudioBookLambdaStatement = new iam.PolicyStatement();
    checkForAudioBookLambdaStatement.addActions("dynamodb:Query");
    checkForAudioBookLambdaStatement.addResources(table.tableArn);
    checkForAudioBookLambda.addToRolePolicy(checkForAudioBookLambdaStatement);
    textOutputBucket.grantReadWrite(checkForAudioBookLambda)
    table.grantReadWriteData(checkForAudioBookLambda)
    // create lambdas (first lambda)
    const convertToTextLambda = new NodejsFunction(this, 'ConvertEbookToText', {
      entry: path.join(__dirname, '../lambda/convertEbookToText/index.ts'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(100),
      // memorySize: 256,
      environment: {
        'BUCKET_NAME': ebookBucket.bucketName,
        'TABLE_NAME': table.tableName,
        'OUTPUT_BUCKET_NAME': textOutputBucket.bucketName
      },
      bundling: {
        loader: {
          ".node": "file"
        },
        nodeModules: ["@gxl/epub-parser"]
      }
    })
    textOutputBucket.grantReadWrite(convertToTextLambda);
    // add Polly permissions for Lambda function
    const statement = new iam.PolicyStatement();
    statement.addActions("s3:*");
    statement.addResources("*");
    statement.addActions("dynamodb:PutItem")
    statement.addResources(table.tableArn)
    convertToTextLambda.addToRolePolicy(statement);

    ebookBucket.grantReadWrite(convertToTextLambda);
    table.grantReadWriteData(convertToTextLambda)

    const convertToAudioLambda = lambda.Function.fromFunctionArn(this, "convertToAudioLambda",
    cdk.Fn.importValue("convertToAudioLambda")
  )    

    /** ------------------ Step functions Definition ------------------ */
    const checkForAudioBookLambdaTask = new tasks.LambdaInvoke(this, "CheckForAudioBookLambdaTask", {
      lambdaFunction: checkForAudioBookLambda,
      resultPath: "$.result"
    })

    const convertToTextLambdaTask = new tasks.LambdaInvoke(this, "ConvertToTextLambdaTask", {
      lambdaFunction: convertToTextLambda,
      resultPath: "$.result",
      // outputPath: "$.lambdaOutput"
    })

    // const startNextStateMachine = new tasks.StepFunctionsStartExecution(this, "StartNextStateMachine", {
    //   stateMachine: textToPollySfn
    // })
    const convertTextToAudioTask = new tasks.LambdaInvoke(this, "ConvertTextToAudioTask", {
      lambdaFunction: convertToAudioLambda
    })
    convertToTextLambdaTask.next(convertTextToAudioTask)

    const succeeded = new sfn.Succeed(this, "Succesfully Completed")

    const sfnChoice = new sfn.Choice(this, 'Book and Text exist?')
    // Look at the "result" field
    .when(sfn.Condition.stringEquals('$.result.Payload.result', CheckForBookResult.both), succeeded)
    .when(sfn.Condition.stringEquals('$.result.Payload.result', CheckForBookResult.justText), convertTextToAudioTask)
    .when(sfn.Condition.stringEquals('$.result.Payload.result', CheckForBookResult.neither), convertToTextLambdaTask)
    .otherwise(new sfn.Fail(this, "Error processing output of check"))


    const stateMachine = new sfn.StateMachine(this, 'CheckForBookAndCreateText', {
      definition: checkForAudioBookLambdaTask.next(sfnChoice)
    });

    // define outputs
    new cdk.CfnOutput(this, "convertToTextLambda", {
      value: convertToTextLambda.functionName,
      exportName: "convertToTextLambda"
    });
}
}