import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from "path";
import { Readable } from "stream";


const s3Client = new S3Client({});
const oneMB = 1024 * 1024;

export const getObjectRange = (bucket: string, key: string, start: number, end: number) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: `bytes=${start}-${end}`,
  });

  return s3Client.send(command);
};

export const getRangeAndLength = (contentRange: any) => {
  const [range, length] = contentRange.split("/");
  const [start, end] = range.split("-");
  return {
    start: parseInt(start),
    end: parseInt(end),
    length: parseInt(length),
  };
};

export const isComplete = (end: number, length: number) => end === length - 1;

// When downloading a large file, you might want to break it down into
// smaller pieces. Amazon S3 accepts a Range header to specify the start
// and end of the byte range to be downloaded.
export const downloadEpub = async (bucket: string, key: string) => {
  console.log("writing file to: ", path.join("/tmp", `${key}`))
  const writeStream = createWriteStream(
    // fileURLToPath(new URL(`./${key}`, import.meta.url))
    // path.join(__dirname, `${key}`)
    path.join("/tmp", `${key}`)
  ).on("error", (err) => console.error(err));

  let rangeAndLength = { start: -1, end: -1, length: -1 };
  console.log("rangeAndLength1", rangeAndLength)

  while (!isComplete(rangeAndLength.end, rangeAndLength.length)) {
    console.log("rangeAndLength", rangeAndLength)
    const { end } = rangeAndLength;
    const nextRange = { start: end + 1, end: end + oneMB };

    console.log(`Downloading bytes ${nextRange.start} to ${nextRange.end}`);

    const { ContentRange, Body } = await getObjectRange(
      bucket,
      key,
      nextRange.start,
      nextRange.end,
    
    );

    writeStream.write(await Body!.transformToByteArray());
    // Body!.pipe(file)

    rangeAndLength = getRangeAndLength(ContentRange);
  }
  await new Promise((waitForStreamToComplete) => writeStream.on('finish', waitForStreamToComplete));
  return path.join("/tmp", `${key}`)
};

// export const main = async () => {
//   await downloadInChunks({
//     bucket: "my-cool-bucket",
//     key: "my-cool-object.txt",
//   });
// };

