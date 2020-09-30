import express from "express";
import bodyParser from "body-parser";
import {Storage} from '@google-cloud/storage';
import os from 'os';
import fs from 'fs';
import path from 'path';
import ffmpeg_static from "ffmpeg-static";
import { execSync } from "child_process";
import { randomBytes } from "crypto"

const storage = new Storage({ keyFilename: "GCS-Segmenter.json" });

const app = express();
const port = 3000;

app.use(bodyParser.json())

app.post<{ gcsFilePath: string, bucketName: string }>("/", async (req, res) => {
  console.log(req.body);
  const {
    gcsFilePath = "videos/test3.mp4",
    bucketName = "db-method-dev.appspot.com",
  } = req.body;
  const fileName = path.basename(gcsFilePath);
  const title = fileName.split(".")[0].replace(/\.[^/.]+$/, "");
  const gcsFileDir = path.dirname(gcsFilePath);

  const videoObjectResponse = await storage
    .bucket(bucketName)
    .getFiles({ prefix: gcsFilePath });

  // const tmpDir = fs.mkdtempSync(`${os.tmpdir()}/`);
  const tmpDir = fs.mkdtempSync(path.join(__dirname, 'temp'))
  // const originalFilePath = path.join(tmpDir, fileName);
  const originalFilePath = path.join(__dirname, '..', gcsFilePath)
  // await videoObjectResponse[0][0].download({ destination: originalFilePath });

  const fileStats = fs.statSync(originalFilePath);
  console.log(JSON.stringify(fileStats, null, 2));
  fs.writeFileSync(path.join(tmpDir, `${title}.key`), randomBytes(16));
  const baseUrl = `https://storage.googleapis.com/db-method-dev-hls/${title}/`;
  const keyUrl = `https://storage.googleapis.com/db-method-dev-hls/${title}/${title}.key`;
  const keyPath = path.join(tmpDir, `${title}.key`);
  const keyInfo = `${keyUrl}\n${keyPath}`;
  fs.writeFileSync(path.join(tmpDir, `${title}.keyinfo`), keyInfo);

  execSync(
    `${ffmpeg_static}  -y \
    -i ${originalFilePath} \
    -c:a copy \
    -hls_enc_key key.info \
    -preset fast -sc_threshold 0 \
    -c:v libx264 \
    -filter:v fps=30 -g 60 \
    -map 0 -s:v:0 426x240 -b:v:1 192k \
    -map 0 -s:v:1 640x360 \
    -map 0 -s:v:2 854x480 \
    -map 0 -s:v:3 1280x720 \
    -map 0 -s:v:4 1920x1080 \
    -map 0 -s:v:5 2560x1440 \
    -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3 v:4,a:4 v:5,a:5" \
    -f hls \
    -hls_base_url "${baseUrl}" \
    -hls_enc 1 \
    -hls_key_info_file "${title}.keyinfo" \
    -master_pl_name master.m3u8 \
    -hls_time 6 \
    -hls_list_size 0 \
    -hls_playlist_type vod \
    -hls_segment_filename "${tmpDir}/v%vfileSequence%d.ts" \
    ${tmpDir}/v%vprog_index.m3u8`
  , { cwd: tmpDir })

  const masterPath = path.join(tmpDir, "master.m3u8");
  const masterData = fs.readFileSync(masterPath, { encoding: 'utf-8'});
  const absoluteMasterData = masterData.replace(/v\d*prog_index\.m3u8/g, (sub) => `${baseUrl}${sub}`);
  fs.writeFileSync(masterPath, absoluteMasterData)
  console.log(absoluteMasterData)
  console.log("Segmentation complete");
  console.log(tmpDir)
  const tmpDirContents = fs.readdirSync(tmpDir);
  console.log(tmpDirContents)
  const uploadFiles = tmpDirContents.filter((file) => !/.*?\.mp4$/.test(file));
  console.log(uploadFiles)
  const bucket = storage.bucket("db-method-dev-hls")
  const uploadPromises = uploadFiles.map((file) =>{
    console.log(`${title}/${file}`);
    return bucket.upload(path.join(tmpDir, file), {
      destination: `${title}/${file}`,
    }).catch(console.error)}
  );

  await Promise.all(uploadPromises)
  console.log("Successfully uploaded to GCS")


  // cleanup

  // tmpDirContents.forEach((fname) => fs.unlinkSync(path.join(tmpDir, fname)));
  // fs.rmdirSync(tmpDir)
  // res.send("completed");
  
});


app.listen(port, () => {
  return console.log(`Server is listening on ${port}`);
});