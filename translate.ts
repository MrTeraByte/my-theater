import axios from 'axios';
import { spawn } from 'child_process';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';

/**
 * Configuration from Environment Variables
 */
const CONFIG = {
  R2_ENDPOINT: process.env.R2_ENDPOINT || '', // https://<account_id>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '',
};

class MovieProcessor {
  private inputUrl: string;
  private fileName: string;
  private tempPath: string;

  constructor(url: string, name: string) {
    this.inputUrl = url;
    this.fileName = name;
    this.tempPath = path.resolve(process.cwd(), `processed_${name}`);
  }

  private log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Step 1: Download & Remux using Streaming
   */
  async downloadAndProcess(): Promise<void> {
    this.log(`🚀 Starting processing: ${this.inputUrl}`);

    const response = await axios({
      method: 'GET',
      url: this.inputUrl,
      responseType: 'stream',
    });

    const args = [
      '-i', 'pipe:0',
      '-map', '0:v', '-map', '0:a',
      '-sn', '-c', 'copy',
      '-disposition:a:0', '0', '-disposition:a:1', 'default',
      '-movflags', '+faststart',
      this.tempPath,
      '-y'
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      response.data.pipe(ffmpeg.stdin);

      ffmpeg.stderr.on('data', (data) => {
        const out = data.toString();
        if (out.includes('size=')) {
          process.stdout.write(`\r⚡ FFmpeg Progress: ${out.trim().split('\n')[0]}`);
        }
      });

      ffmpeg.on('close', (code) => {
        process.stdout.write('\n');
        code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${code}`));
      });
    });
  }

  /**
   * Step 2: Upload to Cloudflare R2
   */
  async uploadToR2(): Promise<void> {
    this.log(`☁️ Uploading ${this.fileName} to Cloudflare R2...`);

    const client = new S3Client({
      region: 'auto',
      endpoint: CONFIG.R2_ENDPOINT,
      credentials: {
        accessKeyId: CONFIG.R2_ACCESS_KEY_ID,
        secretAccessKey: CONFIG.R2_SECRET_ACCESS_KEY,
      },
    });

    const parallelUploads3 = new Upload({
      client,
      params: {
        Bucket: CONFIG.R2_BUCKET_NAME,
        Key: this.fileName,
        Body: createReadStream(this.tempPath),
        ContentType: 'video/mp4',
      },
      queueSize: 4, // 4 concurrent parts
      partSize: 1024 * 1024 * 5, // 5MB part size
    });

    parallelUploads3.on('httpUploadProgress', (progress) => {
      const loaded = progress.loaded || 0;
      const total = progress.total || 1;
      process.stdout.write(`\r📤 Upload Progress: ${((loaded / total) * 100).toFixed(2)}%`);
    });

    await parallelUploads3.done();
    this.log(`\n✅ Upload complete!`);
  }

  /**
   * Step 3: Cleanup
   */
  async cleanup(): Promise<void> {
    this.log(`🧹 Cleaning up temporary file...`);
    await fs.unlink(this.tempPath);
  }
}

/**
 * Execution Logic
 */
async function run() {
  const [,, url, name] = process.argv;
  if (!url || !name) {
    console.error('Missing arguments: <url> <name>');
    process.exit(1);
  }

  const processor = new MovieProcessor(url, name);
  try {
    await processor.downloadAndProcess();
    await processor.uploadToR2();
    await processor.cleanup();
    console.log('✨ All tasks completed successfully.');
  } catch (err) {
    console.error('\n❌ Workflow failed:', err);
    process.exit(1);
  }
}

run();
