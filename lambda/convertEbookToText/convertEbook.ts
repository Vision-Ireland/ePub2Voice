import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb"
import {S3Client, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';


import { parseEpub } from '@gxl/epub-parser'
import { Readable } from 'stream';
import { GetObjectCommandOutput } from '@aws-sdk/client-s3';
// import { downloadEpub } from "./downloadEpub"
import { downloadEpub2 } from "./downloadEpub2";

import {HtmlToTextOptions, convert} from 'html-to-text'
import { Section } from '@gxl/epub-parser/lib/parseSection';
import { SectionReturn } from "./localInterfaces";

export const asStream = (response: GetObjectCommandOutput) => {
  return response.Body as Readable;
};

export const asBuffer = async (response: GetObjectCommandOutput) => {
  const stream = asStream(response);
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

export const asString = async (response: GetObjectCommandOutput) => {
  const buffer = await asBuffer(response);
  return buffer.toString();
};


export const getS3object = async(region: string, bucket: string, key: string) => {
    const s3 = new S3Client({region: region})
    console.log(key);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const streamToString = (stream: any) =>
      new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    try {
      const response = await s3.send(command);

      // response.Body!.transformToWebStream()
      const bodyContents = await response.Body?.transformToString("utf-8")

      // const responseString = await asString(response)
      // const responseString = await new Response(response.Body as ReadableStream).text()
      // console.log("response from s3 as string")
      // console.log(responseString);
      // return responseString
      // const { Body } = await s3.send(command);
      // const bodyContents = await streamToString(Body);
      // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
      // const str = await response!.Body!.transformToString();
      console.log("sting returned from s3")
      console.log(bodyContents);
      return bodyContents as string
    } catch (err) {
        console.log(err);
        const message = `Error getting object ${key} from bucket ${bucket}. Make sure they exist and your bucket is in the same region as this function.`;
        console.log(message);
        throw new Error(message);
    }
}

const getHtmlFromChapter = (chapter: Section) => {
  const chapterHtml = chapter.htmlString
  const matches = chapterHtml.match(/<span class="raisedcap-rw">(.*)<\/span>/g);
  console.log("matches for chapter: " + chapter.id, matches)
  const options: HtmlToTextOptions = {
    wordwrap: 130,
    // tags: ['span'],
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      // { selector: 'span.raisedcap-rw', options: { ignoreLineBreak: true } }
      ]
    // ...
  };
  // if (matches) {
  //   console.log("chapterHtml contains raisedcap-rw at: ", chapterHtml.indexOf(`<span class="raisedcap-rw"`))
  //   options.selectors!.push({ selector: 'span.raisedcap-rw', options: { ignoreLineBreak: true } })
  // }
  const text = convert(chapterHtml, options);
  // console.log(text)
  return text
}

export const createFormattedEbook = async(bucket: string, key: string) => {
  // const obj = await getS3object(region, bucket, key)
  // const objPath = await downloadInChunks(bucket, key)
  const objPath = await downloadEpub2(bucket, key)
  console.log('objPath:', objPath)
  // console.log("just info")
  // const {info} = await parseEpub(objPath, {
  //   type: 'path',
  // })
  // console.log("info", info)
  console.log("getting all...")
  const epubObj = await parseEpub(objPath, {
    type: 'path',
  })
  console.log("finished parsing epub")
  // console.log("epub info", epubObj.info)
  // const epubObj = parseEpub(obj)
  console.log('epub content:', epubObj)
  console.log("epub structure", epubObj.structure)
  console.log("epub sections", epubObj.sections)


  // const textFromChapters: string[] = []
  if (epubObj.sections === undefined) {
    console.log("epub sections is undefined")
    throw new Error("epub sections is undefined")
  }
  // for (const section of epubObj.sections) {
  //   textFromChapters.push(getHtmlFromChapter(section))
  // }

  const sectionReturn: SectionReturn[] = epubObj.sections.map((section) => {
    return {
      id: section.id,
      sectionText: getHtmlFromChapter(section)
    }
  })
  console.log("sectionReturn in convertebook", sectionReturn)
  return sectionReturn
  // convert specific chapter for testing
  // const foo = epubObj.sections![6]
  // const chap6Html = epubObj.sections![6].htmlString
  // const options = {
  //   wordwrap: 130,
  //   // ...
  // };
  // const text = convert(chap6Html, options);
  // console.log(text)
  // return text
  // console.log("chapter", chapter)
  // const formattedChapter = convertChapter(chapter)
  // console.log("formatted chapter", formattedChapter)

}