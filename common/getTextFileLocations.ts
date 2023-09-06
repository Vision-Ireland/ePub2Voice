import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3"; // ES Modules import
import { getBucketAndFolderFromTextLocation } from "./createFileNamesAndPaths";

export const getTextFileLocations = async (s3TextLocationFolder: string) => {
  const client = new S3Client({})
  const {bucket, key} = getBucketAndFolderFromTextLocation(s3TextLocationFolder)
  const input = {
      "Bucket": bucket,
      "Prefix": key,
    };
    const command = new ListObjectsV2Command(input);
    const response: ListObjectsV2CommandOutput = await client.send(command);
    console.log(response)
    if (!response.Contents || response.Contents.length < 1) {
        console.log("No text files found")
        return null
    }
    const textFileLocations = response.Contents.map(item => item.Key!)
    return textFileLocations
}