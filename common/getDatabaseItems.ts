import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { UpdateExpression } from "databaseItems";


export const getEbookSortKey = () => {
  return 'ebook';
};

export const getChapterSortKey = (pollyVoice: string, chapterId: string, pollyLanguage: string) => {
  return `${pollyVoice}_${pollyLanguage}_${chapterId}`
}

export const getEbookItem = async (bookId: string) => {
  return await getItem(bookId, getEbookSortKey());
}

export const getAudioItem = async (bookId: string, pollyVoice: string, chapterId: string, pollyLanguage: string) => {
  return await getItem(bookId, getChapterSortKey(pollyVoice, chapterId, pollyLanguage));
}

export const getItem = async (bookId: string, sortKey: string) => {
  const tableName = process.env.TABLE_NAME || "";
  // const dynamodb = new AWS.DynamoDB();
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  // const dynamodbParams = 
  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression:
    "id = :id AND sortKey = :sortKey",
    ExpressionAttributeValues: {
      ":id": bookId,
      ":sortKey": sortKey
    },
    // ConsistentRead: true
  })

    try {
      const response = await docClient.send(command);
      console.log(response)
      return response.Items;
    }
    catch(err) {
        console.log(err);
        throw new Error();
        
    }
  }

  export function GenerateUpdateExpression(object: {[key: string]: any}) {
    let exp: UpdateExpression
     = {
        UpdateExpression: 'set',
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {}
    };
    for (const [key, value] of Object.entries(object)) {
        exp.UpdateExpression += ` #${key} = :${key},`;
        exp.ExpressionAttributeNames[`#${key}`] = key;
        exp.ExpressionAttributeValues[`:${key}`] = value;
    };
    // remove trailing comma
    exp.UpdateExpression = exp.UpdateExpression.slice(0, -1);
    return exp
}