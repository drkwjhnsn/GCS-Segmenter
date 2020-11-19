const fetch = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const {
  CMS_PAT,
  CMS_SPACE_ID,
  CMS_ENV_ID,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_USER,
  EMAIL_PASS,
  CDN_HOST,
  PROXY_URL,
  OPEN_BUCKET,
  AUTH_BUCKET,
  PROJECT_ROOT,
} = process.env;

const storage = new Storage({
  keyFilename: path.join(PROJECT_ROOT || "..", "GCS-Segmenter.json"),
});

const main = async () => {
  const sourceBucket = "db-method-hls-headers";
  const [videoObjectResponse] = await storage.bucket(sourceBucket).getFiles({
    prefix: "LO_RES-Arms+Chest/",
  });
  // videoObjectResponse = videoObjectResponse.filter(
  //   ({ metadata }) => metadata && metadata.contentType === "video/mp4"
  // ).sort((a, b) => a.metadata.size - b.metadata.size)
  videoObjectResponse
    .map((file) => {
      console.log(file.name);
      return file;
    })
    .filter(({ name }) => /v\dprog_index\.m3ui/.test(name))
    .map((file) => {
      console.log(`after: ${file.name}`);
      return file;
    });

  // for (let i = 0; i < videoObjectResponse.length; i++) {
  //   const meta = videoObjectResponse[i].metadata;
  //   console.log(`${meta.name}: ${meta.size}`)

  //   const raw = JSON.stringify({
  //     name: meta.name.split("/")[1],
  //     bucket: "db-method-app.appspot.com",
  //   });


  // }
};

// gs://db-method-hls-headers/LO_RES-Arms+Chest/v0prog_index.m3u8

main();
