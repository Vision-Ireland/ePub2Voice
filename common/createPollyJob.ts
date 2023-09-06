import { getAudioFilePath, getBucketAndFolderFromTextLocation, getSectionIdFromTextLocation } from "./createFileNamesAndPaths";
import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput, GetObjectCommand } from "@aws-sdk/client-s3"; // ES Modules import
import { Readable } from 'stream';
import { PollyClient, StartSpeechSynthesisTaskCommand, TaskStatus } from "@aws-sdk/client-polly";

export const maxCharsForSpeechSynthesisTask = 100000


const streamToString = (stream: any) =>
    new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
});

const getTextFromS3 = async (bucket: string, key: string) => {
  const client = new S3Client({});
  const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
  });
  const response = await client.send(command);
  if (response.Body) {
      const body = await streamToString(response.Body as Readable) as string;
      // const body = await response.Body?.transformToString("utf-8")
      return body
  } else {
      // console.log("no body")
      throw new Error("no body")
  }
}

export const sendChapterToPolly = async (chapterText:string, outputBucket: string, outputKey: string, voiceId: string, languageCode: string) => {
  const client = new PollyClient({});
  const input = { // StartSpeechSynthesisTaskInput
      Engine: "neural",
      LanguageCode: languageCode,
      // LexiconNames: [ // LexiconNameList
      //   "STRING_VALUE",
      // ],
      OutputFormat: "mp3",
      OutputS3BucketName: outputBucket, // required
      OutputS3KeyPrefix: outputKey,
      // SampleRate: "STRING_VALUE",
      SnsTopicArn: process.env.SNS_TOPIC_ARN, 

      // in the future, speech marks is what you use to get the info for which words / sentences are said when
      // SpeechMarkTypes: [ // SpeechMarkTypeList
      //   "sentence",
      // ],
      Text: chapterText, // required
      TextType: "text",
      VoiceId: voiceId, //"Aditi" || "Amy" || "Astrid" || "Bianca" || "Brian" || "Camila" || "Carla" || "Carmen" || "Celine" || "Chantal" || "Conchita" || "Cristiano" || "Dora" || "Emma" || "Enrique" || "Ewa" || "Filiz" || "Gabrielle" || "Geraint" || "Giorgio" || "Gwyneth" || "Hans" || "Ines" || "Ivy" || "Jacek" || "Jan" || "Joanna" || "Joey" || "Justin" || "Karl" || "Kendra" || "Kevin" || "Kimberly" || "Lea" || "Liv" || "Lotte" || "Lucia" || "Lupe" || "Mads" || "Maja" || "Marlene" || "Mathieu" || "Matthew" || "Maxim" || "Mia" || "Miguel" || "Mizuki" || "Naja" || "Nicole" || "Olivia" || "Penelope" || "Raveena" || "Ricardo" || "Ruben" || "Russell" || "Salli" || "Seoyeon" || "Takumi" || "Tatyana" || "Vicki" || "Vitoria" || "Zeina" || "Zhiyu" || "Aria" || "Ayanda" || "Arlet" || "Hannah" || "Arthur" || "Daniel" || "Liam" || "Pedro" || "Kajal" || "Hiujin" || "Laura" || "Elin" || "Ida" || "Suvi" || "Ola" || "Hala" || "Andres" || "Sergio" || "Remi" || "Adriano" || "Thiago" || "Ruth" || "Stephen" || "Kazuha" || "Tomoko" || "Niamh" || "Sofie",
    };
    console.log("input", input)
    const command = new StartSpeechSynthesisTaskCommand(input);
    const response = await client.send(command);
    console.log("response", response)
    
    return response
}

export const createPollyJob = async (bucket: string, key: string, sectionId: string, bookId: string, mapIndex: number, pollyVoice: string, pollyLanguage: string) => {

  // console.log("sectionId", sectionId)
  const chapterText = await getTextFromS3(bucket, key)
  console.log("chapter length: ", chapterText.length)

  // console.log("chapterText", chapterText)
  const audioOutputBucket = process.env.AUDIO_OUTPUT_BUCKET_NAME!
  const audioOutputKey = getAudioFilePath(bookId, pollyVoice, sectionId || `${mapIndex}`, pollyLanguage)
  // only do one polly job per book right now
  // const pollyResponse = await sendChapterToPolly(chapterText, audioOutputBucket, audioOutputKey, pollyVoice, pollyLanguage)
  // console.log("pollyResponse, ", pollyResponse)
  // // todo: add error handling for polly response
  // if (!pollyResponse.SynthesisTask || !pollyResponse.SynthesisTask.OutputUri || !pollyResponse.SynthesisTask.TaskId) {
  //     throw new Error("pollyResponse, SynthesisTask, or outputURI is undefined")
  // }
  // if (mapIndex === -1 || chapterText.length === 10759 || chapterText.length === 17581 || chapterText.length === 14831) {
  if (1 === 1) {
    const pollyResponse = await sendChapterToPolly(chapterText, audioOutputBucket, audioOutputKey, pollyVoice, pollyLanguage)
    console.log("pollyResponse, ", pollyResponse)
    // todo: add error handling for polly response
    if (!pollyResponse.SynthesisTask || !pollyResponse.SynthesisTask.OutputUri || !pollyResponse.SynthesisTask.TaskId) {
        throw new Error("pollyResponse, SynthesisTask, or outputURI is undefined")
    }
  }


  return audioOutputKey
}