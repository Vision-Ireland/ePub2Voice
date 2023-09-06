import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput, GetObjectCommand } from "@aws-sdk/client-s3"; // ES Modules import
import { PollyClient, StartSpeechSynthesisTaskCommand, TaskStatus } from "@aws-sdk/client-polly";
import { AdditionalMetadata, AudioBookChapterInterface, UpdateExpression } from "../../interfaces/databaseItems";
import { getAudioFilePath, getBucketAndFolderFromTextLocation, getSectionIdFromTextLocation } from "../../common/createFileNamesAndPaths";
import { getTextFileLocations } from "../../common/getTextFileLocations";
import { Readable } from 'stream';
import { getChapterSortKey, getAudioItem, GenerateUpdateExpression } from "../../common/getDatabaseItems";
import { AudioBookStatus } from "enums";
import { createPollyJob } from "../../common/createPollyJob";
import { updateEbookDdbItem } from "../../common/updateDdbItems";



// const client = new AWS.Rekognition();



const getPreviousJobIds = (previousPollyJobIds: string[] | undefined, preivousTaskId: string) => {
    if (previousPollyJobIds && previousPollyJobIds.length > 0) {
        return [
            ...previousPollyJobIds,
            `${preivousTaskId}`
        ]
    } else {
        return [
            `${preivousTaskId}`] 
    }
}

const createItemForUpdate = async (bookId: string, pollyVoice: string, chapterId: string, pollyLanguage: string, outputUri: string, taskId: string) => {
    // first we get the existing item
    const audioRecords = await getAudioItem(bookId, pollyVoice, chapterId, pollyLanguage)
    // if it doesnt exist, we create it 
    if (!audioRecords ||audioRecords.length == 0) {
        // book item doesnt exist 
        const item: AudioBookChapterInterface = {
            id: bookId,
            sortKey: getChapterSortKey(pollyVoice, chapterId, pollyLanguage),
            voice: pollyVoice,
            chapterId: chapterId,
            s3Location: outputUri,
            type: "audioBookChapter",
            audioBookStatus: TaskStatus.IN_PROGRESS,
            pollyJobId: taskId
        }
        console.log("item (first of its kind)", item)
        return item
      } else {
        const record = audioRecords[0] as AudioBookChapterInterface
        // for whatever reason, failure or otherwise, we need to update the entry
        // at this point, the only thing we want to update is the pollyJobId since we dnt have any other info
        // we also want to update the s3 location since that will be different and set status to started
        
        const item: AudioBookChapterInterface = {
            ...record,
            s3Location: outputUri,
            pollyJobId: taskId,
            audioBookStatus: TaskStatus.IN_PROGRESS,
            previousPollyJobIds: getPreviousJobIds(record.previousPollyJobIds, record.pollyJobId),
        }
        console.log("item (updated)", item)
        // const item: AudioBookChapterInterface = {
        //     ...audioRecords[0],
        // }
        return item
      }
    // if one exists, we make updates rather than using the whole thing


}

const createDdbEntry = (item: AudioBookChapterInterface) => {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    
    const command = new PutCommand({
        Item: item,
        // ReturnValues: "ALL_OLD",
        TableName: process.env.TABLE_NAME!,
        // ConditionExpression: 'attribute_not_exists(id)'
    });
    const response = docClient.send(command);
    return response
}

const getBucketAndKey = (textFileLocation: string) => {
    let bucket = process.env.TEXT_OUTPUT_BUCKET_NAME!
    let key = textFileLocation
    if (textFileLocation.indexOf("s3://") > -1) {
        const result = getBucketAndFolderFromTextLocation(textFileLocation)
        bucket = result.bucket
        key = result.key
    } 
    return {bucket, key}
  }

const createAllPollyJobs = async (textFileLocations: string[], bookId: string, pollyVoice: string, pollyLanguage: string, audioOutputBucket: string) => {
    const output = await Promise.all(textFileLocations.map(async (textFileLocation, mapIndex) => {
        const {bucket, key} = getBucketAndKey(textFileLocation)
        // console.log("textFileLocation", textFileLocation)
        const sectionId = getSectionIdFromTextLocation(textFileLocation)
        return await createPollyJob(audioOutputBucket, key, sectionId, bookId, mapIndex, pollyVoice, pollyLanguage)
    }))
    // todo actually figure out what we need and save it to db
    return output
}

const createAllPollyJobs2 = async (textFileLocations: string[], bookId: string, pollyVoice: string, pollyLanguage: string, audioOutputBucket: string) => {
    for (const textFileLocation of textFileLocations) {
        const {bucket, key} = getBucketAndKey(textFileLocation)
        // console.log("textFileLocation", textFileLocation)
        const sectionId = getSectionIdFromTextLocation(textFileLocation)
        await createPollyJob(audioOutputBucket, key, sectionId, bookId, 0, pollyVoice, pollyLanguage)
    }
    // const output = await Promise.all(textFileLocations.map(async (textFileLocation, mapIndex) => {
    //     const {bucket, key} = getBucketAndKey(textFileLocation)
    //     // console.log("textFileLocation", textFileLocation)
    //     const sectionId = getSectionIdFromTextLocation(textFileLocation)
    //     return await createPollyJob(audioOutputBucket, key, sectionId, bookId, mapIndex, pollyVoice, pollyLanguage)
    // }))
    // todo actually figure out what we need and save it to db
    return
}

const updateEbookItemWithVoice = async (bookId: string, pollyVoice: string, pollyLanguage: string, ) => {
    const desiredUpdates = {
        voices: {
            // todo: determine how to do this...i want to add a voice to it as the update. 
            action: "ADD",
            value: pollyVoice
        
        }
    }

    const expression: UpdateExpression = GenerateUpdateExpression(desiredUpdates)
    const response = await updateEbookDdbItem(bookId, expression)
    return response
}


export const handler = async (event: any = {}): Promise<any> => {
    console.log(JSON.stringify(event))
    const {bookId, pollyVoice, pollyLanguage} = event.result.Payload
    // const pollyLanguage = "en-IN" // todo: don't hard code this - allow user to select. 
    console.log("AUDIO_OUTPUT_BUCKET", process.env.AUDIO_OUTPUT_BUCKET_NAME!)
    const s3TextLocationFolder = event.result.Payload.s3Location
    const textFileLocations = await getTextFileLocations(s3TextLocationFolder)
    if (!textFileLocations) {
        throw new Error("No text file locations found")
    }
    // note that in the future if we want to move to a step function mapping, we could pass the text file locations 
    // (or append them with the bucket to get the full path) directly with the mapping
    // const response = await createAllPollyJobs(textFileLocations, bookId, pollyVoice, pollyLanguage, process.env.AUDIO_OUTPUT_BUCKET_NAME!)
    // console.log(response)
    await createAllPollyJobs2(textFileLocations, bookId, pollyVoice, pollyLanguage, process.env.AUDIO_OUTPUT_BUCKET_NAME!)
    return;
};
