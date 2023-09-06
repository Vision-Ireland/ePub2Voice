import { GetObjectCommand, S3Client, GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from "path";


export const downloadEpub2 = async (bucket: string, key: string) => {
  const s3Client = new S3Client({});
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  try {
    const response = await s3Client.send(command);
    console.log("response", response)
    if (response.Body! instanceof Readable) {
      const location = `/tmp/${key}`
      const file = createWriteStream(location)
      response.Body!.pipe(file)
      await new Promise((waitForStreamToComplete) => file.on('finish', waitForStreamToComplete));
      // file.on("finish", function() {
      //   file.close();
      //  });

      // response.Body!.pipe(createWriteStream(location))
      console.log(`created file at ${location}`)
      return location
    } else {
      throw new Error('Unknown object stream type.');
    
    }
  } catch (err) {
    console.log("err", err)
    throw err;
  }
}