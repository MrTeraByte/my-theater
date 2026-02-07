import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  DOWNLOAD_URL
} = process.env;

const log = (message: string) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

async function run() {
  if (!DOWNLOAD_URL) throw new Error("No download URL provided.");

  const rarPath = path.join(process.cwd(), "temp.rar");
  const extractDir = path.join(process.cwd(), "extracted");

  // --- Step 1: Download ---
  log(`Step 1: Downloading RAR from ${DOWNLOAD_URL}...`);
  const response = await axios({
    url: DOWNLOAD_URL,
    method: 'GET',
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(rarPath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  log("Step 1 Complete: Downloaded temp.rar");

  // --- Step 2: Extraction ---
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir);
  log("Step 2: Extracting files (flattened)...");
  try {
    // 'e' extracts without directory structure, putting everything in one level
    execSync(`7z e "${rarPath}" -o"${extractDir}" -y`);
    log("Step 2 Complete: Files extracted.");
  } catch (err) {
    log("Extraction failed. Ensure the link is a valid RAR file.");
    throw err;
  }

  // --- Step 3: Filtering and Uploading ---
  const files = fs.readdirSync(extractDir);
  const movieExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
  
  log(`Step 3: Found ${files.length} items. Starting uploads to R2 root...`);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    
    if (movieExtensions.includes(ext)) {
      const filePath = path.join(extractDir, file);
      const stats = fs.statSync(filePath);
      log(`[Uploading] ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      try {
        const parallelUploads3 = new Upload({
          client: s3,
          params: {
            Bucket: R2_BUCKET_NAME,
            Key: file, // Root of the bucket
            Body: fs.createReadStream(filePath),
            ContentType: "video/mp4", // Forced as requested
          },
          queueSize: 4, // Number of concurrent parts
          partSize: 1024 * 1024 * 5, // 5MB part size
          leavePartsOnError: false,
        });

        parallelUploads3.on("httpUploadProgress", (progress) => {
          if (progress.loaded && progress.total) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (percent % 25 === 0) log(`...Progress for ${file}: ${percent}%`);
          }
        });

        await parallelUploads3.done();
        log(`[Success] Finished: ${file}`);
      } catch (err) {
        log(`[Failed] Error uploading ${file}: ${err}`);
      }
    } else {
      log(`[Skipping] ${file} (Not a movie file)`);
    }
  }

  // --- Step 4: Final Cleanup ---
  log("Step 4: Cleaning up workspace...");
  fs.unlinkSync(rarPath);
  fs.rmSync(extractDir, { recursive: true, force: true });
  log("All steps completed successfully!");
}

run().catch((err) => {
  log(`CRITICAL ERROR: ${err.message}`);
  process.exit(1);
});
