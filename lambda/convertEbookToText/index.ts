import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  UpdateCommandInput,
  UpdateCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand} from '@aws-sdk/client-s3';
import { PollyClient, StartSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";
import { createFormattedEbook } from "./convertEbook"
import { SectionReturn } from "./localInterfaces";
import { FileNames } from 'FileNamesAndPaths';
import { getTextFilePath, getTextFolderPath } from '../../common/createFileNamesAndPaths';
import { GenerateUpdateExpression, getEbookSortKey } from '../../common/getDatabaseItems';
import { UpdateExpression } from 'databaseItems';
import { updateEbookDdbItem } from '../../common/updateDdbItems';
import { maxCharsForSpeechSynthesisTask } from '../../common/createPollyJob';

export const getS3object = async(region: string, bucket: string, key: string) => {
    const s3 = new S3Client({region: region})
    const params = {
        Bucket: bucket,
        Key: key,
    }; 
    console.log(key);
    try {
        const { ContentType } = await s3.send(new HeadObjectCommand(params));
        console.log('CONTENT TYPE:', ContentType);
        return ContentType;
    } catch (err) {
        console.log(err);
        const message = `Error getting object ${key} from bucket ${bucket}. Make sure they exist and your bucket is in the same region as this function.`;
        console.log(message);
        throw new Error(message);
    }
}

const uploadTextToS3 = async (chapterText: string, outputBucket: string, outputKey: string) => {
    
    const params = {
        Bucket: outputBucket,
        Key: outputKey,
        Body: chapterText
      };
    const s3 = new S3Client({})
    try {
        const putRequest = new PutObjectCommand(params)
        const putResponse = await s3.send(putRequest)
        console.log("putResponse", putResponse)
    }
    catch (ex) {
        console.log(ex)
    }
}





function uriToParams(uri: string): { bucket: string, key: string } {
    const matches = /(?:s3:\/\/)?([^/]+)\/(.*)/.exec(uri);
    if (!matches) {
        throw new Error(`Received invalid uri: '${uri}'`);
    }
    const params = {
        bucket: matches[1],
        key: matches[2],
    };

    return params;
}

const findLastSpace = (inputString: string) => {
    let previousSpaceIndex = inputString.lastIndexOf(" ", maxCharsForSpeechSynthesisTask -1) + 1
    const intitialString  = inputString.slice(0, previousSpaceIndex)
}

const divideStringIntoSubstrings = (inputString: string, substrings: SectionReturn[], originalSectionId: string, iter: number) => {
    let previousSpaceIndex = inputString.lastIndexOf(" ", maxCharsForSpeechSynthesisTask -1) + 1
    const shortEnoughString  = inputString.slice(0, previousSpaceIndex)
    const remainingString = inputString.slice(previousSpaceIndex, inputString.length)
    substrings.push({
        sectionText: shortEnoughString,
        id: `${originalSectionId}_part${iter}`
    })
    if (remainingString.length > maxCharsForSpeechSynthesisTask) {
        iter += 1
        divideStringIntoSubstrings(remainingString, substrings, originalSectionId, iter)
    } else {
        substrings.push({
            sectionText: remainingString,
            id: `${originalSectionId}_part${iter+1}`})
    }
    // const substrings = []
    // while (remainingString.length <= inputString.length) {
    //     const nextSpaceIndex = inputString.indexOf(" ", previousSpaceIndex)
    //     substrings.push(inputString.slice(previousSpaceIndex, nextSpaceIndex))
    //     previousSpaceIndex = nextSpaceIndex + 1
    // }
    return substrings

}

const uploadSectionsToS3 = async (sectionReturns: SectionReturn[], outputBucket: string, bookId: string) => {
    for (const section of sectionReturns) { // limit 5k, 7500 chars
        console.log("sectionReturn ids", sectionReturns.map(item => item.id))
        const sectionText = section.sectionText //7500 chars
        // console.log(`the length for section ${section.id} is ${sectionText.length}`)
        if (sectionText.length > maxCharsForSpeechSynthesisTask) { // it is
            console.log(`Section ${section.id} is too long to be converted to text ( ${sectionText.length}) chars. Breaking it down`)
            // break down text into new sections
            const newSectionReturns = divideStringIntoSubstrings(sectionText, [], section.id, 1)
            console.log("newSectionReturns", newSectionReturns)

            // push them to the sectionReturns list
            const index = sectionReturns.indexOf(section)
            sectionReturns.splice(index, 1)
            sectionReturns.push(...newSectionReturns)

            continue
        }
        // const desiredKey = `${bookId}/${FileNames.textPathStart}_${section.id}/${FileNames.text}`
        const desiredKey = getTextFilePath(bookId, section.id)
        console.log("uploading text for sectionId: ", section.id)
        await uploadTextToS3(section.sectionText, outputBucket, desiredKey)
    }
    return sectionReturns
}

// const client = new AWS.Rekognition();
export const handler = async (event: any = {}): Promise<any> => {
    console.log(JSON.stringify(event))
    // todo: change how we get bucket and key
    const {bookId, pollyVoice} = event
    const epubS3Location: string = event.result.Payload.s3Location
    // const bucket = epubS3Location
    // const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const {bucket, key} = uriToParams(epubS3Location)

    // const bookText = await createFormattedEbook(region, bucket, key)
    const sectionReturns: SectionReturn[] = await createFormattedEbook(bucket, key)
    const numberOfEbookSections = [...sectionReturns].length
    console.log("sectionReturns", sectionReturns)
    const outputBucket = process.env.OUTPUT_BUCKET_NAME!
    const finalSectionReturns =await uploadSectionsToS3(sectionReturns, outputBucket, bookId)
    // 
    const textLocation =  getTextFolderPath(outputBucket, bookId)
    // update dynamodb to show where text is
    const desiredUpdates = {
        textLocation: textLocation,
        numberOfSections: finalSectionReturns.length,
        numberOfEbookSections: numberOfEbookSections,
    }

    const expression: UpdateExpression = GenerateUpdateExpression(desiredUpdates)
    const response = await updateEbookDdbItem(bookId, expression)
    const returnEvent = {...event.result.Payload}
    returnEvent.s3Location = textLocation
    return returnEvent;
}; // 17581