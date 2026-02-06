import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function uploadVideo(videoUrl: string, fileName: string) {
  try {
    console.log("Starting stream transfer with English as default...");

    // 1. Get the source stream
    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });

    // 2. Create a bridge to pass FFmpeg output to the S3 Upload
    const ffmpegOutputBridge = new PassThrough();

    // 3. Process the stream
    ffmpeg(response.data)
      .outputOptions([
        "-map 0",                            // Keep all streams (Video, All Audios, Subs)
        "-c copy",                           // Direct stream copy (No re-encoding)
        "-disposition:a 0",                  // Turn off 'default' for all audio tracks
        "-disposition:a:m:language:eng default", // Set English as the default
        "-f matroska"                        // Pipe-friendly container
      ])
      .on("error", (err) => {
        console.error("FFmpeg Error:", err.message);
      })
      .pipe(ffmpegOutputBridge);

    // 4. Upload to R2
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: fileName, // Use the original filename (e.g., .mkv or .mp4)
        Body: ffmpegOutputBridge,
        ContentType: "video/x-matroska", // Matroska is safer for stream-piping
      },
    });

    upload.on("httpUploadProgress", (p) => {
      console.log(`Uploaded: ${((p.loaded || 0) / 1024 / 1024).toFixed(2)} MB`);
    });

    await upload.done();
    console.log("Upload complete! English is now the default audio.");

  } catch (err) {
    console.error("Transfer failed:", err);
    process.exit(1);
  }
}

const [videoUrl, fileName] = process.argv.slice(2);
uploadVideo(videoUrl, fileName);
