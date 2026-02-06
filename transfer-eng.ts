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
    console.log("Fetching video stream via Axios...");
    
    // Get the source stream using Axios (handles Google URLs better)
    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0' // Sometimes needed for Google storage URLs
      }
    });

    const uploadStream = new PassThrough();

    /**
     * FFmpeg Logic:
     * -i pipe:0 -> Read from stdin (the Axios stream)
     * -map 0 -> Keep all tracks
     * -c copy -> Don't re-encode (fast)
     * -disposition:a 0 -> Reset all audio defaults
     * -disposition:a:m:language:eng default -> Set English as default
     */
    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-map", "0",
      "-c", "copy",
      "-disposition:a", "0",
      "-disposition:a:m:language:eng", "default",
      "-f", "mp4",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "pipe:1",
    ]);

    // Pipe Axios -> FFmpeg
    response.data.pipe(ffmpeg.stdin);

    // Pipe FFmpeg -> Upload Stream
    ffmpeg.stdout.pipe(uploadStream);

    // Capture FFmpeg errors for debugging
    let ffmpegLogs = "";
    ffmpeg.stderr.on("data", (data) => {
      ffmpegLogs += data.toString();
    });

    ffmpeg.on("error", (err) => {
      console.error("FFmpeg Process Error:", err);
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
