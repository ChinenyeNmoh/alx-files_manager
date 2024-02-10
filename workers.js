const fs = require('fs');
const { ObjectId } = require('mongodb');
const Bull = require('bull');
const imageThumbnail = require('image-thumbnail');
const dbClient = require('./utils/db');

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;
  if (!fileId) {
    throw new Error('Missing fileId');
  }
  if (!userId) {
    throw new Error('Missing userId');
  }
  const findFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId });
  if (!findFile) {
    throw new Error('File not found');
  }
  const pathFile = findFile.localPath;
  const thumb1 = { width: 500 };
  const thumb2 = { width: 250 };
  const thumb3 = { width: 100 };
  try {
    const thumbnail1 = await imageThumbnail(`${pathFile}_${thumb1.width}`, thumb1);
    const thumbnail2 = await imageThumbnail(`${pathFile}_${thumb2.width}`, thumb2);
    const thumbnail3 = await imageThumbnail(`${pathFile}_${thumb3.width}`, thumb3);
    fs.writeFileSync(`${pathFile}_${thumb1.width}`, thumbnail1);
    fs.writeFileSync(`${pathFile}_${thumb2.width}`, thumbnail2);
    fs.writeFileSync(`${pathFile}_${thumb3.width}`, thumbnail3);
  } catch (err) {
    // Throw the error so the job fails
    throw new Error(`Thumbnail generation failed: ${err.message}`);
  }
});
