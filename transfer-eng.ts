import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { spawn } from "child_process";
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
    console.log("Starting direct FFmpeg stream...");

    const uploadStream = new PassThrough();

    /**
     * Why this version is different:
     * 1. We pass the URL directly to -i (input).
     * 2. FFmpeg will use HTTP Range requests to find metadata.
     * 3. -reconnect 1 helps if the connection drops.
     */
    const ffmpeg = spawn("ffmpeg", [
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-headers", "User-Agent: Mozilla/5.0\r\n", 
      "-i", videoUrl,
      "-map", "0",
      "-c", "copy",
      "-disposition:a", "0", 
      "-disposition:a:m:language:eng", "default",
      "-f", "mp4",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "pipe:1",
    ]);

    // Handle FFmpeg output to uploadStream
    ffmpeg.stdout.pipe(uploadStream);

    // Capture logs for debugging
    ffmpeg.stderr.on("data", (data) => {
      const msg = data.toString();
      // Only log actual errors or stream info to keep output clean
      if (msg.toLowerCase().includes("error") || msg.includes("Stream #")) {
        console.log(`FFmpeg: ${msg.trim()}`);
      }
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
    console.log("Upload complete!");

  } catch (err) {
    console.error("Transfer failed:", err);
    process.exit(1);
  }
}

const [videoUrl, fileName] = process.argv.slice(2);
uploadVideo(videoUrl, fileName);
