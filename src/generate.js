
const dotenv =  require('dotenv');
const path = require('path');
const {Storage} = require('@google-cloud/storage');

dotenv.config({ path: path.join(__dirname, '..', '.env')})
const { CMS_PAT, CMS_SPACE_ID, CMS_ENV_ID, EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, CDN_HOST, PROXY_URL, OPEN_BUCKET, AUTH_BUCKET, PROJECT_ROOT } = process.env;

const storage = new Storage({ keyFilename: path.join(PROJECT_ROOT || '..', "GCS-Segmenter.json" )});


const main = async () => {
 const sourceBucket = "db-method-app.appspot.com";
 const [videoObjectResponse] = await storage
   .bucket(sourceBucket)
   .getFiles({ prefix: "videos/" });
  for (let i = 0; i < videoObjectResponse.length; i++) {
    console.log(JSON.stringify(videoObjectResponse[i], null, 2))
  }
}

main();