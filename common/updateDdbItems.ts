import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  UpdateCommandInput,
  UpdateCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand} from '@aws-sdk/client-s3';
import { PollyClient, StartSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";
import { FileNames } from 'FileNamesAndPaths';
import { getTextFilePath, getTextFolderPath } from './createFileNamesAndPaths';
import { GenerateUpdateExpression, getEbookSortKey } from './getDatabaseItems';
import { UpdateExpression } from 'databaseItems';


export const updateEbookDdbItem = async (bookId: string, exp: UpdateExpression) => {
  const tableName = process.env.TABLE_NAME || "";
  const client = new DynamoDBClient({})
  const docClient = DynamoDBDocumentClient.from(client);
  const command = new UpdateCommand({
      TableName: tableName,
      Key: {
          "id": bookId,
          sortKey: getEbookSortKey()
      },
      UpdateExpression: exp.UpdateExpression,
      ExpressionAttributeNames: exp.ExpressionAttributeNames,
      ExpressionAttributeValues: exp.ExpressionAttributeValues
  })
  const response = await docClient.send(command)
  console.log("ddb put response", response)
  return response
}