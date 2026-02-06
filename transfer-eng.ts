import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function processAndUpload(videoUrl: string, fileName: string) {
  // Using the system temp directory is often safer for large writes
  const localTempFile = path.join(process.env.RUNNER_TEMP || process.cwd(), `output_${Date.now()}.mp4`);

  try {
    console.log(`Processing: ${videoUrl}`);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoUrl)
        // Network robustness flags to prevent SIGSEGV on stream hiccups
        .inputOptions([
          '-reconnect 1',
          '-reconnect_at_eof 1',
          '-reconnect_streamed 1',
          '-reconnect_delay_max 4',
          '-err_detect ignore_err' // Skip minor corruptions in the stream
        ])
        .outputOptions([
          "-map 0:v:0",                 // Video
          "-map 0:a:m:language:eng",    // English Audio
          "-c copy",                    // No transcoding
          "-disposition:a:0 default", 
          "-movflags +faststart",       // Metadata to front
          "-bsf:a aac_adtstoasc"        // Fixes bitstream headers for MP4 container
        ])
        .on("start", (cmd) => console.log("FFmpeg command initiated."))
        .on("progress", (p) => {
          if (p.percent) console.log(`Processing: ${p.percent.toFixed(2)}%`);
        })
        .on("error", (err) => {
          console.error("FFmpeg Error details:", err);
          reject(err);
        })
        .on("end", () => resolve(true))
        .save(localTempFile);
    });

    console.log("Processing finished. Beginning R2 Upload...");
    
    const fileStream = fs.createReadStream(localTempFile);
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`,
        Body: fileStream,
        ContentType: "video/mp4",
      },
      // Higher part size is better for 5GB+ files
      partSize: 20 * 1024 * 1024, 
      queueSize: 4,
    });

    upload.on("httpUploadProgress", (p) => {
      console.log(`Uploaded: ${((p.loaded || 0) / 1024 / 1024).toFixed(2)} MB`);
    });

    await upload.done();
    console.log("🚀 Success! Uploaded to R2.");

  } catch (err) {
    console.error("Workflow failed with error:", err);
    process.exit(1);
  } finally {
    if (fs.existsSync(localTempFile)) {
      fs.unlinkSync(localTempFile);
    }
  }
}

const [videoUrl, fileName] = process.argv.slice(2);
processAndUpload(videoUrl, fileName);
