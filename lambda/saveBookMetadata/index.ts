import { DynamoDBClient, PutItemCommand, AttributeValue } from "@aws-sdk/client-dynamodb";
// import { PollyClient, StartSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { getMetadata } from './getMetadata';
import { downloadEpub } from "./downloadEpub";
import { BookInterface } from "../../interfaces/databaseItems";
import { getEpubFileLocation } from "../../common/createFileNamesAndPaths";
import { getEbookSortKey } from "../../common/getDatabaseItems";


export const handler = async (event: any = {}): Promise<any> => {
    console.log(JSON.stringify(event))
    const bucket = event.Records[0].s3.bucket.name;
    const region = event.Records[0].awsRegion;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    const objPath = await downloadEpub(bucket, key);


    const zipFilePath = '/tmp/ziped-epub.zip';

    await zipTheFile(objPath, zipFilePath);

    try {
        const metadata = await getMetadata(zipFilePath);

        console.log(metadata);

        if (metadata) {

            const client = new DynamoDBClient({ region: region });
            const docClient = DynamoDBDocumentClient.from(client);

            const item: BookInterface = {
                id: uuidv4(),
                sortKey: getEbookSortKey(),
                type: "ebook",
                title: metadata.title,
                epubS3Location: getEpubFileLocation(bucket, key),
                author: metadata.creator,
                coverImageLocation: "foobar", // TODO: save cover image and add the location here
                language: metadata.language,
                // voices: {},
                metadata: {
                    // id: metadata.id,
                    idType: "metadata-id",
                    ...metadata
                }
                // id: { S: metadata.id }, // lets change this to our own unique ID, and save the metadata id elsewhere. 
                // title: { S: metadata.title },
                // creator: { S: metadata.creator },
                // language: { S: metadata.language },
                // source: { S: metadata.source },
                // date: { S: metadata.date },
                // publisher: { S: metadata.publisher },
                
            };

            const tableName = process.env.TABLE_NAME || "";

            const command = new PutCommand({
                TableName: tableName,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)'
            });

            try {
                await docClient.send(command);
                console.log(item)
                console.log('Above metadata stored successfully in DynamoDB!');
            } catch (error) {
                console.error('Error storing metadata in DynamoDB:', error);
                throw error;
            }

        } else {
            console.log('Metadata not found.');
        }

    } catch (error) {
        console.log('Error getting metadata:', error);
    }
    return;
};

const zipTheFile = async (objPath: string, zipFilePath: string) => {

    await fs.promises.rename(objPath, zipFilePath);
    console.log('File renamed successfully:', zipFilePath);
}

