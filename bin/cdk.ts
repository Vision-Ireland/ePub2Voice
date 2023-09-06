#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
// import { PollyLambdaS3TriggerStack } from '../old_libs/s3-lambda-polly-stack';
import { EpubS3MetadataDdbStack } from '../lib/epubS3-metadata-ddb';
// import { CreateTextFromEbook } from '../old_libs/create-text-from-ebook';
import { ConvertTextToAudio } from '../lib/convert-text-to-audio';
import { CheckForBookAndCreateTextStack } from '../lib/check-for-book-and-create-text';
import { PostAudioProcessing } from '../lib/post-audio-processing';





const app = new cdk.App();
// first we need the epub bucket and ddb table
new EpubS3MetadataDdbStack(app, 'EpubS3MetadataDdbStack');

// then we need the sns topic so that the second step function can use it for polly output
new PostAudioProcessing(app, "PostAudioProcessing")
// we havent created this yet though, which is fine since the convertTextToAudio doesnt actually do anything 

// then we need the second step function (convert to audio) so that the first step function can call it
new ConvertTextToAudio(app, "ConvertTextToAudio")

// lastly we create the first step function (check for book and create text)
new CheckForBookAndCreateTextStack(app, "CheckForBookAndCreateText")
