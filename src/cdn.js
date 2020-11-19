const fetch = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const fs = require('fs');
const _ = require('lodash');
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

function deleteFolder(dirname) {
    const tmpDirContents = fs.readdirSync(dirname);
    tmpDirContents.forEach((fname) =>
      fs.unlinkSync(path.join(dirname, fname))
    );
    fs.rmdirSync(dirname);
}

const main = async () => {
  const sourceBucket = "db-method-hls-headers";
  const fullTemp = path.join(__dirname, sourceBucket);
  fs.mkdirSync(fullTemp);
  try {
    const [videoObjectResponse] = await storage.bucket(sourceBucket).getFiles({
      prefix: "LO_RES-Arms+Chest/",
    });

    const vidMap = {};
    videoObjectResponse.forEach((file) => {
      const [vidFolder, filename] = file.name.split('/')
      if (!vidMap[vidFolder]) vidMap[vidFolder] = {};
      vidMap[vidFolder][filename] = file;
    })

    const fullPromises = _.map(vidMap, (vidFiles, vidname) => {
      const vidPath = path.join(fullTemp, vidname)
      fs.mkdirSync(vidPath)
      const downloadPromises = _.filter(vidFiles, ({ name }) =>
        /v\dprog_index\.m3u8/.test(name)
      ).map((file) => {
        const nameArr = file.name.split('/')
        const filename = nameArr[nameArr.length - 1]
        const filePath = path.join(vidPath, filename)
        return file.download({ destination: filePath })
      });
  
      return Promise.all(downloadPromises).catch((err) => {
        // console.error(err)
        // deleteFolder(vidPath)
        throw err
      });
    });

    await Promise.all(fullPromises)

  } catch (err) {
    console.error(err)
    // deleteFolder(fullTemp);
  }

};


main();
