import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import axios from "axios";

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
    console.log("Initializing streams...");

    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const uploadStream = new PassThrough();

    // FFmpeg settings for streaming MP4
    const ffmpeg = spawn("ffmpeg", [
      "-probesize", "10M",             // Give FFmpeg more data to figure out tracks
      "-analyzeduration", "10M",
      "-i", "pipe:0",                  // Input from stdin
      "-map", "0",                     // Copy all streams
      "-c", "copy",                    // No re-encoding
      "-disposition:a", "0",           // Reset defaults
      "-disposition:a:m:language:eng", "default", // Set English
      "-f", "mp4",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "pipe:1",                        // Output to stdout
    ]);

    // PREVENT EPIPE: If FFmpeg dies, stop Axios from pushing data
    response.data.on("error", (err: any) => console.error("Axios Stream Error:", err.message));
    ffmpeg.stdin.on("error", (err: any) => {
        console.error("FFmpeg Stdin Error (Pipe Closed):", err.message);
        response.data.destroy(); // Stop the download immediately
    });

    // Pipe Axios -> FFmpeg
    response.data.pipe(ffmpeg.stdin);

    // Pipe FFmpeg -> Upload
    ffmpeg.stdout.pipe(uploadStream);

    // Monitor FFmpeg logs to see why it fails
    ffmpeg.stderr.on("data", (data) => {
      const log = data.toString();
      if (log.includes("Error")) console.error(`FFmpeg Log: ${log.trim()}`);
    });

    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        Body: uploadStream,
        ContentType: "video/mp4",
      },
    });

    upload.on("httpUploadProgress", (progress) => {
      const mb = (progress.loaded || 0) / 1024 / 1024;
      console.log(`Uploaded: ${mb.toFixed(2)} MB`);
    });

    await upload.done();
    console.log("Upload finished successfully!");

  } catch (err) {
    console.error("Transfer failed:", err);
    process.exit(1);
  }
}

const [videoUrl, fileName] = process.argv.slice(2);
uploadVideo(videoUrl, fileName);
