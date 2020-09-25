import express from "express";
import bodyParser from "body-parser";
import {Storage} from '@google-cloud/storage';
import os from 'os';
import fs from 'fs';
import path from 'path';
import ffmpeg from "fluent-ffmpeg";
import ffmpeg_static from "ffmpeg-static";

// Creates a client
const storage = new Storage({ keyFilename: "GCS-Segmenter.json" });
// Creates a client from a Google service account key.
// const storage = new Storage({keyFilename: "key.json"});

// async function createBucket() {
//   // Creates the new bucket
//   await storage.createBucket(bucketName);
//   console.log(`Bucket ${bucketName} created.`);
// }

// createBucket().catch(console.error);

const app = express();
const port = 3000;

app.use(bodyParser.json())

function promisifyCommand(command: ffmpeg.FfmpegCommand) {
  return new Promise((resolve, reject) => {
    command
      .on("start", (commandLine: string) => {
        console.log(`Spawned Ffmpeg with command: ${commandLine}`);
      })
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

app.post<{ gcsFilePath: string, bucketName: string }>("/", async (req, res) => {
  console.log(req.body)
  const {
    gcsFilePath = "videos/test.mp4",
    bucketName = "db-method-dev.appspot.com",
  } = req.body;
  const fileName = path.basename(gcsFilePath);
  const title = fileName.split(".")[0].replace(/\.[^/.]+$/, '');;
  const gcsFileDir = path.dirname(gcsFilePath)

  const videoObjectResponse = await storage.bucket(bucketName).getFiles({ prefix: gcsFilePath})

  const tmpDir = fs.mkdtempSync(`${os.tmpdir()}/`)
  const originalFilePath = path.join(tmpDir, fileName)
  await videoObjectResponse[0][0].download({ destination: originalFilePath });

  const fileStats = fs.statSync(originalFilePath)
  console.log(JSON.stringify(fileStats, null, 2))

  const command = ffmpeg(originalFilePath)
    .setFfmpegPath(ffmpeg_static)
    .outputOptions([
      "-f hls",
      "-g 60",
      "-hls_time 2",
      "-hls_list_size 0",
      '-hls_segment_filename',
      path.join(tmpDir, `${title}%d.ts`),
    ])
    .output(path.join(tmpDir, `${title}.m3u8`));
  await promisifyCommand(command);
  console.log("Segmentation complete")
    const tmpDirContents = fs.readdirSync(tmpDir);
    const uploadFiles = tmpDirContents.filter((file) => /.*?\.(ts|m3u8)/.test(file));
    const bucket = storage.bucket("db-method-dev-hls")
    const uploadPromises = uploadFiles.map((file) =>
      bucket.upload(path.join(tmpDir, file), {
        destination: `${title}/${file}`,
      })
    );

    await Promise.all(uploadPromises)
  console.log("Successfully uploaded to GCS")


  // cleanup

  tmpDirContents.forEach((fname) => fs.unlinkSync(path.join(tmpDir, fname)));
  fs.rmdirSync(tmpDir)
  res.send("completed");
});


app.listen(port, () => {
  return console.log(`Server is listening on ${port}`);
});
