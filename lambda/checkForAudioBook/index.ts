"use strict";
import {S3Client, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CheckForBookResult } from '../../interfaces/enums';
import { BookInterface, UpdateExpression } from '../../interfaces/databaseItems';
import { getAudioFolderPath } from '../../common/createFileNamesAndPaths';
import { getTextFileLocations } from '../../common/getTextFileLocations';
import { getEbookSortKey, getEbookItem, GenerateUpdateExpression  } from '../../common/getDatabaseItems';
import { TaskStatus } from '@aws-sdk/client-polly';
import { updateEbookDdbItem } from '../../common/updateDdbItems';

const getIdAndVoice = (event: any) => {
  // for now we will just assume the book id and voice are given as inputs to the event
  const {bookId, pollyVoice, pollyLanguage} = event
  return {bookId, pollyVoice, pollyLanguage}
}

const validateTextAtLocation =async (s3TextLocationFolder: string) => {
  const textFiles: string[] | null = await getTextFileLocations(s3TextLocationFolder)
  if (!textFiles || textFiles.length == 0) {
    console.log("no text files found at location. Re-running lambda to create text files")
    return CheckForBookResult.neither; 
  } else {
    return CheckForBookResult.justText;
  
  }
}

const getExp = (book: BookInterface, pollyVoice: string, voiceRecordingStatus: TaskStatus) => {
  if (!book.audioRecordings) {
    // no audio recordings have been created yet, so lets create the default

    return {
      UpdateExpression: "SET audioRecordings = :defaultValue",
      ExpressionAttributeValues: {
        ":defaultValue": {
          [pollyVoice]: {
            numberOfSectionsWithAudio: 0,
            audioBookStatus: TaskStatus.IN_PROGRESS
          }
        }
      },
    };
  } else if (!(pollyVoice in book.audioRecordings)) {
    // the voice has not been created yet, so lets create it
    return {
      UpdateExpression: "SET audioRecordings.#voiceId = :defaultValue",
      ExpressionAttributeNames: {
        "#voiceId": pollyVoice,
      },
      ExpressionAttributeValues: {
        ":defaultValue": {
          numberOfSectionsWithAudio: 0,
          audioBookStatus: TaskStatus.IN_PROGRESS
        }
      },
    };
  }

   else {
    return {
      UpdateExpression: `SET audioRecordings.#voiceId.#audioBookStatus = :audioBookStatus`,
      // UpdateExpression: `SET audioRecordings.#voiceId.#audioBookStatus = if_not_exists(audioRecordings.#voiceId.#audioBookStatus, :audioBookStatus) `, // if_not_exists(audioRecordings.#voiceId.#audioBookStatus, :audioBookStatus)
      ExpressionAttributeNames: {
        "#voiceId": pollyVoice,
        "#audioBookStatus": "audioBookStatus",
      }, 
      ExpressionAttributeValues: {
        ":audioBookStatus": voiceRecordingStatus,
      },
    }
  }
}

export const handler = async (event: any = {}): Promise<any> => {
    console.log(JSON.stringify(event))
    const {bookId, pollyVoice, pollyLanguage} = getIdAndVoice(event)
    // const region = event.Records[0].awsRegion;
    // const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    const items = await getEbookItem(bookId);
    // first validate items
    if (!items ||items.length == 0) {
      // this means there are no books
      return {result: CheckForBookResult.error, bookId, pollyVoice, s3Location: null}
    }
    // now we know there are items, we just dont know if there is text or audiobook
    const book = items[0] as BookInterface
    // first check if there is audio for the specific language
    const voiceRecordingStatus: TaskStatus | undefined = book.audioRecordings?.[pollyVoice]?.audioBookStatus
    console.log("voiceRecordingStatus", voiceRecordingStatus)
    if(voiceRecordingStatus === TaskStatus.COMPLETED) {
      return {result: CheckForBookResult.both, bookId, pollyVoice, s3Location: getAudioFolderPath(bookId, pollyVoice, pollyLanguage), pollyLanguage}
    } 
    if (voiceRecordingStatus && voiceRecordingStatus !== TaskStatus.FAILED) {
      // eventually we will want to retry this since if it's not failed it will be in progress.
      // todo: update
      return {result: CheckForBookResult.both, bookId, pollyVoice, s3Location: getAudioFolderPath(bookId, pollyVoice, pollyLanguage), pollyLanguage}
    }
    if (voiceRecordingStatus === TaskStatus.FAILED) {
      return {result: CheckForBookResult.error, bookId, pollyVoice, s3Location: getAudioFolderPath(bookId, pollyVoice, pollyLanguage), pollyLanguage}
    }

    // now we know it is the first time we are doing anything for this voice, so lets update the ddb table that we are working on it, and continue.
    if (!voiceRecordingStatus) {
      console.log("Initiation process for: " + pollyVoice + " voice")
      // basically i need to set the audiorecording to a default value
      // return {result: CheckForBookResult.error, bookId, pollyVoice, s3Location: null}
      
      const exp = getExp(book, pollyVoice, TaskStatus.IN_PROGRESS)

      const resp = await updateEbookDdbItem(bookId, exp)
      console.log("resp", resp)
    }

    // otherwise there is no audio so check for text
    if (book.textLocation) {
      // first validate there is stuff at the location
      const result = await validateTextAtLocation(book.textLocation)
      return {result, bookId, pollyVoice, s3Location: book.textLocation, pollyLanguage}
    }
    
    // if neither audio nor text, return neither
    return {result: CheckForBookResult.neither, bookId, pollyVoice, s3Location: book.epubS3Location, pollyLanguage}
};

