import { FileNames } from "FileNamesAndPaths"
export const getTextFolderPath = (outputBucket: string, bookId: string) => {
  return `s3://${outputBucket}/${bookId}`
}

export const getTextFilePath = (bookId: string, sectionId: string) => {
  const desiredKey = `${bookId}/${FileNames.textPathStart}_${sectionId}/${FileNames.text}`
  return desiredKey
}

export const getAudioFolderPath = (bookId: string, pollyVoice: string, pollyLanguage: string) => {
  return `${bookId}/${pollyVoice}_${pollyLanguage}`
}

export const getAudioFilePath = (bookId: string, pollyVoice: string, sectionId: string, pollyLanguage: string) => {
  const desiredKey = `${bookId}/${pollyVoice}_${pollyLanguage}/${FileNames.audioPathStart}_${sectionId}/${FileNames.audio}`
  return desiredKey
}

export const getEpubFileLocation = (epubBucket: string, epubKey: string) => {
  return `s3://${epubBucket}/${epubKey}`
}

export const getBucketAndFolderFromTextLocation = (textLocation: string) => {
  const bucketAndFolder =  textLocation.split("s3://")[1].split("/")
  return {
    bucket: bucketAndFolder[0],
    key: bucketAndFolder[1]
  }
}

export const getSectionIdFromTextLocation = (textLocation: string) => {
  const sectionFolderPath = textLocation.split(FileNames.text)[0]
  const sectionFolderPathSplit = sectionFolderPath.split("/")
  let subtraction = 1
  const lastCharacter = sectionFolderPath[sectionFolderPath.length - 1];
  // if the last character is a slash, we want to go back 2 in the list since we split on the / for sectionFolderPathSplit
  if (lastCharacter == "/") {
    subtraction = 2
  }
  const result = sectionFolderPathSplit[sectionFolderPathSplit.length - subtraction]
  return result.replace(`${FileNames.textPathStart}_`, "")
}

const getVoiceAndLangFromCombined = (combined: string) => {
  const response = combined.split("_")
  const pollyVoice = response[0]
  const pollyLanguage = response[1]
  return {pollyVoice, pollyLanguage}
}

export const getAllInfoFromAudioLocation = (audioLocation: string) => {
  // dependent on getAudioFilePath
  const allItems = audioLocation.split("s3://")[1].split("/")
  const bucket = allItems[0]
  const bookId = allItems[1]
  const combinedVoiceAndLang = allItems[2]
  const {pollyVoice, pollyLanguage} = getVoiceAndLangFromCombined(combinedVoiceAndLang)
  const fullSection = allItems[3]
  const sectionId = fullSection.replace(`${FileNames.audioPathStart}_`, "")
  const fileName = allItems[4]
  return {bucket, bookId, pollyVoice, pollyLanguage, sectionId}
}

export const maxFailuresOfCreatingAudio = 5