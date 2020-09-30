const fs  = require("fs");
const path = require("path");

  const masterPath = "master.m3u8"
  const masterData = fs.readFileSync(masterPath, { encoding: "utf-8" });
  console.log(masterData)
  const absoluteMasterData = masterData.replace(/v\d*prog_index\.m3u8/g, (sub) => `SHIT${sub}`);

  console.log(absoluteMasterData)
  fs.writeFileSync(masterPath, absoluteMasterData);