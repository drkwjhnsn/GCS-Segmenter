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
  const sourceBucket = "db-method-app.appspot.com";
  let [videoObjectResponse] = await storage
    .bucket(sourceBucket)
    .getFiles({ prefix: "videos/" });
  videoObjectResponse = videoObjectResponse.filter(
    ({ metadata }) => metadata && metadata.contentType === "video/mp4"
  ).sort((a, b) => a.metadata.size - b.metadata.size)
  for (let i = 0; i < videoObjectResponse.length; i++) {
    const meta = videoObjectResponse[i].metadata;
    console.log(JSON.stringify(meta.name.split("/")[1], null, 2));

    const raw = JSON.stringify({
      name: meta.name.split("/")[1],
      bucket: "db-method-app.appspot.com",
    });

    const requestOptions = {
      method: "POST",
      body: raw,
      headers: { "Content-Type": "application/json" },
      redirect: "follow",
    };

    fetch(
      "https://us-central1-db-method-app.cloudfunctions.net/manualTrigger",
      requestOptions
    )
      .then((response) => response.text())
      .then((result) => console.log(result))
      .catch((error) => console.log("error", error));
  }
};

main();
