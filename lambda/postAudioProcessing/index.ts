import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient, UpdateCommand, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getAllInfoFromAudioLocation, getTextFilePath, maxFailuresOfCreatingAudio } from "../../common/createFileNamesAndPaths";
import { getChapterSortKey, getAudioItem, GenerateUpdateExpression, getEbookSortKey } from "../../common/getDatabaseItems";
import { AdditionalMetadata, AudioBookChapterInterface } from "../../interfaces/databaseItems";
import { AudioBookStatus } from "enums";
import { TaskStatus } from "@aws-sdk/client-polly";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createPollyJob } from "../../common/createPollyJob";


const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

interface PutItem {
  Put: {
    TableName: string;
    Item: AudioBookChapterInterface; // The item to be put into the table
  };
}


// Define the item interface for the Update operation
interface UpdateItem {
  Update: {
    TableName: string;
    Key: {
      id: string;
      sortKey: string;
    };
    UpdateExpression: string;
    ExpressionAttributeValues: {
      [key: string]: string;
    };
    ReturnValues: string;
  };
}

const parseMessage = (message: string) => {
  const messageObject = JSON.parse(message);
  return messageObject;
};

const updateItem = async (bookId: string, pollyVoice: string, chapterId: string, language: string, jobStatus: string) => {
  const command = new UpdateCommand({
    TableName: process.env.TABLE_NAME!,
    Key: {
      id: bookId,
      sortKey: getChapterSortKey(pollyVoice, chapterId, language),
    },
    UpdateExpression: "SET #status = :newStatus", // Updated to use ExpressionAttributeNames
    ExpressionAttributeNames: {
      "#status": "status", // status is a reserved word, so it needs to be wrapped in ExpressionAttributeNames
    },
    ExpressionAttributeValues: {
      ":newStatus": jobStatus,
    },
    ReturnValues: "ALL_NEW",
  });

  const response = await docClient.send(command);
  console.log(response);
  return response;
};

const getPreviousJobIds = (previousPollyJobIds: string[] | undefined, previousTaskId: string) => {
  if (previousPollyJobIds && previousPollyJobIds.length > 0) {
    return [...previousPollyJobIds, previousTaskId]; // Removed unnecessary string interpolation
  } else {
    return [previousTaskId];
  }
};

const createAudiBookItem = async (bookId: string, pollyVoice: string, chapterId: string, pollyLanguage: string, outputUri: string, taskId: string, taskStatus: string, taskStatusCompleted: boolean, taskStatusFailed: boolean) => {
  // first we get the existing item
  const audioRecords = await getAudioItem(bookId, pollyVoice, chapterId, pollyLanguage);
  console.log("audioRecords", audioRecords)
  // if it doesn't exist, we create it 
  if (!audioRecords || audioRecords.length === 0) { // Used strict equality comparison
    // book item doesn't exist 
    const item: AudioBookChapterInterface = {
      id: bookId,
      sortKey: getChapterSortKey(pollyVoice, chapterId, pollyLanguage),
      voice: pollyVoice,
      chapterId: chapterId,
      s3Location: outputUri,
      type: "audioBookChapter",
      audioBookStatus: taskStatus as TaskStatus,
      pollyJobId: taskId,
    };
    console.log("item (first of its kind)", item);
    return item;
  } else {
    const record = audioRecords[0] as AudioBookChapterInterface;
    // for whatever reason, failure or otherwise, we need to update the entry
    // at this point, the only thing we want to update is the pollyJobId and the failure count IF it failed previously
    // we also want to update the s3 location since that will be different and set status to started

    const item: AudioBookChapterInterface = {
      ...record,
      s3Location: outputUri,
      pollyJobId: taskId,
      audioBookStatus: taskStatus as TaskStatus,
      previousPollyJobIds: getPreviousJobIds(record.previousPollyJobIds, record.pollyJobId),
      // failureCount: taskStatus === TaskStatus.FAILED ? (record.failureCount || 0) + 1 : 0
    }
    if (taskStatusFailed) {
      // current job failed, so we update failure count to be previous plus 1 if it existed
      item.failureCount = (record.failureCount || 0) + 1
    } else if ((record.audioBookStatus === TaskStatus.FAILED || record.audioBookStatus.toLowerCase() === TaskStatus.FAILED) && taskStatusCompleted) {
      // previous job failed but current one succeeded, so we update failure count to be previous plus 1 if it existed
      item.failureCount = 0
    }
    console.log("item (updated)", item);
    // const item: AudioBookChapterInterface = {
    //     ...audioRecords[0],
    // }
    return item;
  }
  // if one exists, we make updates rather than using the whole thing


};

const getItem = async (tableName: string, key: { [key: string]: any }) => {

  try {

    const params = new GetCommand({
      TableName: tableName,
      Key: key,
    });

    console.log(params);

    const response = await docClient.send(params);
    console.log(response);

    // Access the retrieved item using response.Item
    const item = response.Item;

    return item;
  } catch (err) {
    console.error("Error getting item from DynamoDB:", err);
    throw err;
  }
};

// const transactWrite = async () => {
//   // TransactWriteCommand
//   const cmd = new TransactWriteCommand({

//   })
// }


const incrementVoiceChapterCounterForEbookItem = async (bookId: string, pollyVoice: string, chapterId: string, language: string, voiceId: string) => {
  // Step 1: Get the existing item
  const tableName = process.env.TABLE_NAME!;
  const key = {
    id: bookId,
    sortKey: getEbookSortKey()
  };

  const existingItem = await getItem(tableName, key);

  // Step 2: If the item exists and the audioRecordings attribute is not present, create it
  if (!existingItem || !existingItem.audioRecordings) {
    const command = new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: {
        id: bookId,
        sortKey: getEbookSortKey()
      },
      UpdateExpression: "SET audioRecordings = :defaultValue",
      ExpressionAttributeValues: {
        ":defaultValue": {
          [voiceId]: {
            numberOfSectionsWithAudio: 1
          }
        }
      },
      ReturnValues: "ALL_NEW",
    });

    try {
      const response = await docClient.send(command);
      console.log(response);
      return response;
    } catch (err) {
      console.error("Error updating item:", err);
      throw err;
    }
  } else {
    const incrementer = 1
    // first, we check if the number of sections with audio equals the number of sections desired
    const desiredNumberOfSections = existingItem.numberOfSections;
    let status = existingItem.audioRecordings?.[voiceId]?.audioBookStatus || TaskStatus.IN_PROGRESS
    const numberSectionsPreviously = existingItem.audioRecordings?.[voiceId]?.numberOfSectionsWithAudio || 0;
    const completedSections = numberSectionsPreviously + incrementer
    if (completedSections === desiredNumberOfSections) {
      // if it does, we don't need to do anything
      status = TaskStatus.COMPLETED
    }

    // Step 3: If the audioRecordings attribute exists, update the numberOfSectionsWithAudio
    const command = new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: {
        id: bookId,
        sortKey: getEbookSortKey()
      },
      UpdateExpression: `SET audioRecordings.#voiceId.#numberOfSectionsWithAudio = if_not_exists(audioRecordings.#voiceId.#numberOfSectionsWithAudio, :defaultValue) + :incrementValue, 
      audioRecordings.#voiceId.#audioBookStatus = :audioBookStatus`,
      ExpressionAttributeNames: {
        "#voiceId": voiceId,
        "#numberOfSectionsWithAudio": "numberOfSectionsWithAudio",
        "#audioBookStatus": "audioBookStatus"
      },
      ExpressionAttributeValues: {
        ":defaultValue": 1,
        ":incrementValue": incrementer,
        ":audioBookStatus": status
      },
      ReturnValues: "ALL_NEW",
    });

    try {
      const response = await docClient.send(command);
      console.log(response);
      return response;
    } catch (err) {
      console.error("Error updating item:", err);
      throw err;
    }
  }
};


const putAudioBookItem = async (item: AudioBookChapterInterface) => {
  const command = new PutCommand({
    TableName: process.env.TABLE_NAME!,
    Item: item,
    // ConditionExpression: 'attribute_not_exists(id)'
  });

  try {
    const response = await docClient.send(command);
    console.log(item)
    console.log('Item successfully stored in DynamoDB!');
    return response
  } catch (error) {
    console.error('Error storing metadata in DynamoDB:', error);
    throw error;
  }
}


export const handler = async (event: any = {}): Promise<any> => {
  console.log(JSON.stringify(event));
  // let transactionItems: (TransactWriteItemsCommandInput)[] = [];

  const { taskId, taskStatus, outputUri, voiceId } = parseMessage(event.Records[0].Sns.Message);
  console.log(taskId, taskStatus, outputUri);

  // update individual ddb item for audio book
  const { bucket, bookId, pollyVoice, pollyLanguage, sectionId } = getAllInfoFromAudioLocation(outputUri);

  // create item
  const taskStatusCompleted = taskStatus === TaskStatus.COMPLETED || taskStatus.toLowerCase() === TaskStatus.COMPLETED
  const taskStatusFailed = taskStatus === TaskStatus.FAILED || taskStatus.toLowerCase() === TaskStatus.FAILED

  const item = await createAudiBookItem(bookId, pollyVoice, sectionId, pollyLanguage, outputUri, taskId, taskStatus, taskStatusCompleted, taskStatusFailed)
  console.log('item', item);

  // transactionItems.push({
  //   Put: {
  //     TableName: process.env.TABLE_NAME!,
  //     Item: item,
  //   }
  // })
  // console.log(transactionItems);

  const putResponse = await putAudioBookItem(item)
  console.log('putResponse', putResponse)

  if (item.failureCount && item.failureCount >= maxFailuresOfCreatingAudio) {
    // if it failed more than once, we don't want to update the item
    throw new Error("Too many failures of creating audio.")
  }

  // update book item - change number of chapters with audio recordings completed
  // if status is success or whatever it is, book.audioRecordings.voiceId.VoiceChapterCounter +=1 if exists else 1 if it doesnt

  if (taskStatusCompleted) {
    // const updateItemResponse = await updateAudiobookItem(bookId, pollyVoice, sectionId, pollyLanguage, taskStatus)
    // console.log('updateItemResponse', updateItemResponse)
    console.log("starting to increment voice chapter counter")
    const incrementVoiceChapterCounterResponse = await incrementVoiceChapterCounterForEbookItem(bookId, pollyVoice, sectionId, pollyLanguage, voiceId)
    console.log('incrementVoiceChapterCounterResponse', incrementVoiceChapterCounterResponse)

    // transactionItems.push({
    //   Update: {
    //     TableName: process.env.TABLE_NAME!,
    //     Key: {
    //       id: bookId,
    //       sortKey: getEbookSortKey()
    //     },
    //     UpdateExpression: `SET audioRecordings.#voiceId = :defaultValue`,
    //     ExpressionAttributeNames: {
    //       "#voiceId": voiceId,
    //     },
    //     ExpressionAttributeValues: {
    //       ":defaultValue": {
    //         numberOfSectionsWithAudio: 1,
    //       },
    //     },
    //     ReturnValues: "ALL_NEW",
    //   }
    // })
    // console.log(transactionItems);

  } else if (taskStatusFailed) {

    const textFiileLocation = getTextFilePath(bookId, sectionId)
    console.log("textFiileLocation", textFiileLocation)
    // if it failed, we want to create a new polly job execution
    const textOutputBucket = process.env.TEXT_OUTPUT_BUCKET!
    console.log("sns topic arn", process.env.SNS_TOPIC_ARN)
    const result = await createPollyJob(textOutputBucket, textFiileLocation, sectionId, bookId, -1, pollyVoice, pollyLanguage)
    console.log(result)
  }

  // try {
  //   const command = new TransactWriteItemsCommand(transactionItems);
  //   const response = await docClient.send(command);

  //   // Await the completion of the transaction
  //   // const transactionResponse = await docClient.send(transactionCommand);
  //   // console.log("Transaction response:", transactionResponse);

  // } catch (error) {
  //   console.error("Error performing transaction:", error);
  //   throw error;
  // }

  // check if book is complete (does the number of chapters equal the number of chapters with audio?)
  // now we have the number of chapters, and if that equals book.numberSections, we're done

  // if book is complete, update it
  // add the voice to completed voices

  // else do nothing
  // if the number of chapter

  return;
};
