import { TaskStatus } from "@aws-sdk/client-polly";
import { AudioBookStatus } from "enums";

export type VoiceRecordingInfo = {
  numberOfSectionsWithAudio: number;
  audioBookStatus: TaskStatus;
}

interface voiceChapterCounterInterface {
  [key: string]: VoiceRecordingInfo; // niav_en-in: {numberOfSectionsWithAudio: 1}
}

export interface BookInterface {
  id: string;
  sortKey: string;
  type: string; // this is used as SK so that we make sure we dont accidentally get an audiobook when querying for books
  epubS3Location: string;
  title: string;
  author: string;
  metadata: AdditionalMetadata;
  coverImageLocation: string;
  language: string;
  // voices: voiceStatusInterface;
  textLocation?: string;
  numberOfSections?: number; // 22
  numberOfAudioRecordings?: number // this may be different than number of sections, as we may need to break down the sections into smaller pieces
  audioRecordings?: voiceChapterCounterInterface; 
  
  // pollyVoice: {}
}

export interface UpdateExpression {
  UpdateExpression: string,
  ExpressionAttributeNames?: {[key: string]: any},
  ExpressionAttributeValues: {[key: string]: any}

}

export interface AudioBookChapterInterface {
  id: string;
  sortKey: string;  
  voice: string;  
  chapterId: string;  
  s3Location: string;  
  type: string;  
  // duration: string;
  audioBookStatus: TaskStatus;  
  pollyJobId: string;  
  failureCount?: number;
  previousPollyJobIds?: string[];
}

export interface AdditionalMetadata {
  id: string;
  idType: string;
  [key: string]: string;
}

export interface GeneratedChapterContent {
  bookId: string;
  voiceId: string;
  chapterId: string;
  location: string;
  length: number;
  type: string;
}

export interface ExtractedMetadata {
  title?: string;
  creator?: string;
  language?: string;
  source?: string;
  date?: string;
  publisher?: string;
  identifier?: string;
}

export interface Metadata {
    id: string;
    title: string;
    creator: string;
    language: string;
    source: string;
    date: string;
    publisher: string;
}