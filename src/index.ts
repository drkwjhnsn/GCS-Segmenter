import express from "express";
import bodyParser from "body-parser";
import PQueue from 'p-queue';
import {Storage} from '@google-cloud/storage';
import * as contentful from "contentful-management";
import nodemailer from "nodemailer";
import os from 'os';
import fs from 'fs';
import path from 'path';
import ffmpeg_static from "ffmpeg-static";
import ffprobe_static from "ffprobe-static";
import * as ffmpeg from "fluent-ffmpeg";
import { exec } from "child_process";
import { randomBytes } from "crypto"
import dotenv from 'dotenv';
import clc from 'cli-color';

dotenv.config({ path: path.join(__dirname, '..', '.env')})

const { CMS_PAT, CMS_SPACE_ID, CMS_ENV_ID, EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, CDN_HOST, PROXY_URL, OPEN_BUCKET, AUTH_BUCKET, PROJECT_ROOT } = process.env;

ffmpeg.setFfprobePath(ffprobe_static.path);

const app = express();
const port = 3000;
app.use(bodyParser.json())

const storage = new Storage({ keyFilename: path.join(PROJECT_ROOT || '..', "GCS-Segmenter.json" )});
const cmsClient = contentful.createClient({
  accessToken: CMS_PAT!,
});

const queue = new PQueue({concurrency: 1});


  const transporter = nodemailer.createTransport({
    name: 'appstem.com',
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT || '587', 10),
    secure: EMAIL_PORT === "465",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

app.post<{ gcsFilePath: string, bucketName: string, email: string }>("/", async (req, res) => {
  const {
    gcsFilePath: hackyFilePath,
    bucketName,
    email,
  } = req.body;


  // Hacky fix for correct location of manual trigger
  const gcsFilePath = hackyFilePath.replace('fix/', 'videos/')

  queue.add(() => processVideo(bucketName, gcsFilePath, email));
  console.log(`Added ${gcsFilePath} to work queue`)
  console.log(queue.size)
  res.status(202).end();
});

// Right now there is no valid SMTP service so I stubbed the email functions

// TODO: When you have a valid SMTP service, update the SMTP creds in the env vars and unstub the following functions

const sendStartedEmail = (userEmail: string, title: string ) => null
// transporter.sendMail({
//     from: EMAIL_USER, 
//     to: userEmail, 
//     subject: `Video processing has started for "${title}"`, 
//   });

const sendErrorEmail = (userEmail: string, title: string, error: Error ) => null
// transporter.sendMail({
//     from: EMAIL_USER, 
//     to: userEmail, 
//     subject: `There has been an error processing "${title}"`, 
//     text: error.stack, 
//   });

const sendCompletedEmail = (userEmail: string, title: string ) => null
// transporter.sendMail({
//     from: EMAIL_USER, 
//     to: userEmail, 
//     subject: `Video processing has completed for "${title}"`, 
//   });

const createCmsEntry = (title: string, masterUrl: string, duration: number) => {
  return cmsClient
    .getSpace(CMS_SPACE_ID!)
    .then((space) => space.getEnvironment(CMS_ENV_ID!))
    .then((environment) =>
      environment.createEntry("video", {
        fields: {
          title: {
            "en-US": title,
          },
          duration: {
            "en-US": duration,
          },
          masterUrl: {
            "en-US": masterUrl,
          },
        },
      })
    )
    .then((entry) => entry.publish());
}

const processVideo = async (sourceBucket: string, gcsFilePath: string, email: string) => {
  console.log({ bucketName: sourceBucket , gcsFilePath, email});
  console.log(clc.green(`Processing of ${gcsFilePath} started on ${new Date().toUTCString()}`))
  const fileName = path.basename(gcsFilePath);
  let [title, extension] = fileName.split(".");
  title = title.replace(/\.[^/.]+$/, "");
  const urlTitle = title.replace(/[/\s.?=&:#]+/g, '');
  const tmpDir = path.join(__dirname, urlTitle);
  const originalFilePath = path.join(tmpDir, fileName);
  try {
    await sendStartedEmail(email, title);

    const [videoObjectResponse] = await storage
      .bucket(sourceBucket)
      .getFiles({ prefix: gcsFilePath });
    
      
    fs.mkdirSync(tmpDir)
    console.log(originalFilePath)
    await videoObjectResponse[0].download({ destination: originalFilePath });

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(originalFilePath, (err, metadata) => {
        // console.log(metadata);
        if (err) return reject(err);
        return resolve(Math.round(metadata.format.duration || 1));
      });
    });

    fs.writeFileSync(path.join(tmpDir, `${urlTitle}.key`), randomBytes(16));
    console.log(tmpDir)

    console.log(`title: ${title}`)
    const keyUrl = `https://storage.googleapis.com/${AUTH_BUCKET}/${urlTitle}/${urlTitle}.key`;
    const keyPath = path.join(tmpDir, `${urlTitle}.key`);
    const keyInfo = `${keyUrl}\n${keyPath}`;
    const masterUrl = `${PROXY_URL}/${urlTitle}/master.m3u8`;
    const baseUrl = `${CDN_HOST}/${urlTitle}/`;
    fs.writeFileSync(path.join(tmpDir, `${urlTitle}.keyinfo`), keyInfo);
    console.log(originalFilePath);
    console.log(`urlTitle: ${urlTitle}`)

      await new Promise((resolve, reject) => {
        const ps = exec(
          `${ffmpeg_static} -y \
        -i "${originalFilePath}" \
        -c:a copy \
        -hls_key_info_file "${urlTitle}.keyinfo" \
        -sc_threshold 0 \
        -c:v libx264 \
        -filter:v fps=23.98 -g 60 \
        -map v:0 -s:v:0 214x120 -b:v:0 156k -maxrate:v:0 170k -bufsize:v:0 255k -profile:v:0 baseline \
        -map 0 -s:v:1 640x360 -b:v:1 384k -maxrate:v:1 422k -bufsize:v:1 633k\
        -map 0 -s:v:2 854x480 -b:v:2 512k -maxrate:v:2 563k -bufsize:v:2 845k\
        -map 0 -s:v:3 1280x720 -b:v:3 1024k -maxrate:v:3 1126k -bufsize:v:3 1689k\
        -map 0 -s:v:4 1920x1080 -b:v:4 2056k -maxrate:v:4 2262k -bufsize:v:4 3393k\
        -map 0 -s:v:5 2560x1440 -b:v:5 3212k -maxrate:v:5 3533k -bufsize:v:5 4818k\
        -map a:0 -c:a:0 aac -b:a:0 36k -ac 1 \
        -var_stream_map \
        "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3 v:4,a:4 v:5,a:5" \
        -f hls \
        -master_pl_name master.m3u8 \
        -hls_base_url "${baseUrl}" \
        -hls_time 6 \
        -hls_list_size 0 \
        -hls_playlist_type vod \
        -hls_segment_filename "v%vfileSequence%d.ts" \
        "v%vprog_index.m3u8"`,
          { cwd: tmpDir, maxBuffer: 16777216 },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else if (stderr) {
              console.error(clc.red(stderr));
            } else if (stdout) {
              console.log(stdout);
            }
          }
        );
        ps.on("close", (code) => {
          if (!code) {
            resolve();
          } else {
            reject(code);
          }
        });
      });

    
    // await new Promise((resolve, reject) => {
    //   const ps = spawn(
    //     `${ffmpeg_static} -y \
    //     -i "${originalFilePath}" \
    //     -c:a copy \
    //     -hls_key_info_file "${urlTitle}.keyinfo" \
    //     -sc_threshold 0 \
    //     -c:v libx264 \
    //     -filter:v fps=23.98 -g 60 \
    //     -map v:0 -s:v:0 214x120 -b:v:0 156k -maxrate:v:0 170k -bufsize:v:0 255k -profile:v:0 baseline \
    //     -map 0 -s:v:1 640x360 -b:v:1 384k -maxrate:v:1 422k -bufsize:v:1 633k\
    //     -map 0 -s:v:2 854x480 -b:v:2 512k -maxrate:v:2 563k -bufsize:v:2 845k\
    //     -map 0 -s:v:3 1280x720 -b:v:3 1024k -maxrate:v:3 1126k -bufsize:v:3 1689k\
    //     -map 0 -s:v:4 1920x1080 -b:v:4 2056k -maxrate:v:4 2262k -bufsize:v:4 3393k\
    //     -map 0 -s:v:5 2560x1440 -b:v:5 3212k -maxrate:v:5 3533k -bufsize:v:5 4818k\
    //     -map a:0 -c:a:0 aac -b:a:0 36k -ac 1 \
    //     -var_stream_map \
    //     "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3 v:4,a:4 v:5,a:5" \
    //     -f hls \
    //     -master_pl_name master.m3u8 \
    //     -hls_base_url "${baseUrl}" \
    //     -hls_time 6 \
    //     -hls_list_size 0 \
    //     -hls_playlist_type vod \
    //     -hls_segment_filename "v%vfileSequence%d.ts" \
    //     "v%vprog_index.m3u8"`,
    //     { cwd: tmpDir },
    //   );
      
    //   ps.stdout.on("data", (data) => {
    //     console.log(`stdout: ${data}`);
    //   });

    //   ps.stderr.on("data", (data) => {
    //     console.error(`stderr: ${data}`);
    //   });

    //   ps.on("error", (err) => {
    //     console.error(clc.red(`Failed to start ffmpeg: ${err.message}`));
    //   });

    //   ps.on("close", (code) => {
    //     if (code) {
    //       reject(new Error(clc.red(`child process exited with code ${code}`)));
    //     } else {
    //       resolve();
    //     }
    //   });
    // });

    console.log(`Segmentation of "${title}" complete`);
    const tmpDirContents = fs.readdirSync(tmpDir);

    const uploadToOpenBucket = tmpDirContents.filter((file) =>
      /.*?\.ts$/.test(file)
    );
    const openBucket = storage.bucket(OPEN_BUCKET!);
    const openPromises = uploadToOpenBucket.map((file) => {
      return openBucket.upload(path.join(tmpDir, file), {
        destination: `${urlTitle}/${file}`,
      });
    });

    const uploadToAuthBucket = tmpDirContents.filter((file) =>
      /.*?\.(m3u8|key)$/.test(file)
    );

    console.log('Header Files:')
    console.log(uploadToAuthBucket);

    const authBucket = storage.bucket(AUTH_BUCKET!);
    const authPromises = uploadToAuthBucket.map((file) => {
      return authBucket.upload(path.join(tmpDir, file), {
        destination: `${urlTitle}/${file}`,
      });
    });

    await Promise.all([...openPromises, ...authPromises]);
    console.log(`Successfully uploaded "${title}" to GCS`);
    
    try {
      await createCmsEntry(title, masterUrl, duration);
    } catch (err) {
      console.log(err)
    }
    console.log(`Successfully uploaded "${title}" to CMS`);
    
    await storage.bucket(sourceBucket).upload(originalFilePath, { destination: `processed/${urlTitle}.${extension}` });
    await storage.bucket(sourceBucket).deleteFiles({ prefix: gcsFilePath })

    // cleanup
    tmpDirContents.forEach((fname) => fs.unlinkSync(path.join(tmpDir, fname)));
    fs.rmdirSync(tmpDir);
    
    await sendCompletedEmail(email, title);
  } catch (err) {
    console.error(clc.red(err));
    sendErrorEmail(email, title, err)

    try {
      await storage.bucket(sourceBucket).upload(originalFilePath, { destination: `errored/${urlTitle}.${extension}` });
      await storage.bucket(sourceBucket).deleteFiles({ prefix: gcsFilePath })
    } catch {
      console.error(clc.red("Failed to move original video"))
    }

    try {
      const tmpDirContents = fs.readdirSync(tmpDir);
      tmpDirContents.forEach((fname) =>
        fs.unlinkSync(path.join(tmpDir, fname))
      );
      fs.rmdirSync(tmpDir);
    } catch {
      console.log(clc.red('Failed to remove temporary directory'))
    }
  }
}


app.listen(port, () => {
  return console.log(`Server is listening on ${port}`);
});