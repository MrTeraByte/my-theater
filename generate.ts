import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as fs from 'fs';

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function build() {
  const response = await s3Client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
  const movies = response.Contents?.filter(f => !f.Key?.endsWith('/')) || [];
  
  const movieLinks = movies.map(m => {
    const videoUrl = `${process.env.R2_PUBLIC_URL}/${m.Key}`;
    const fileName = m.Key || "Unknown File";
    return `<a href="${videoUrl}" class="movie-link" onclick="playVideo('${videoUrl}'); return false;">${fileName}</a>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TV Movie Portal</title>
    <style>
        body { background: #111; color: #fff; font-family: sans-serif; margin: 0; padding: 15px; }
        .container { width: 100%; overflow: hidden; }
        .video-column { float: left; width: 70%; }
        .list-column { float: right; width: 25%; background: #222; padding: 10px; height: 90vh; overflow-y: auto; border: 1px solid #444; }
        video { width: 100%; background: #000; border: 1px solid #333; }
        .seek-box { margin-top: 15px; padding: 15px; background: #333; border: 1px solid #555; }
        input { padding: 10px; font-size: 20px; width: 80px; }
        button { padding: 10px 20px; font-size: 20px; background: #00bfff; color: #fff; border: none; cursor: pointer; }
        .movie-link { display: block; padding: 12px; color: #00bfff; text-decoration: none; border-bottom: 1px solid #333; }
        .movie-link:focus, button:focus, input:focus { background: yellow; color: #000; outline: none; }
    </style>
</head>
<body>

    <div class="container">
        <div class="video-column">
            <video id="tvPlayer" controls crossorigin="anonymous">
                Your TV does not support HTML5 video.
            </video>

            <div class="seek-box">
                <input type="number" id="seekMin" value="0">
                <button onclick="doSeek()">Go to Minute</button>
            </div>
        </div>

        <div class="list-column">
            <h3 style="margin-top:0;">Movies</h3>
            ${movieLinks}
        </div>
    </div>

    <script type="text/javascript">
        var player = document.getElementById('tvPlayer');

        function playVideo(url) {
            player.src = url;
            player.load();
            player.play();
        }

        function doSeek() {
            var min = document.getElementById('seekMin').value;
            var target = parseInt(min) * 60;
            
            if (isNaN(target)) return;

            // Tizen 2.1 fix: It needs to know the video is seekable 
            // before it accepts the command.
            if (player.seekable && player.seekable.length > 0) {
                player.currentTime = target;
            } else {
                // Fallback: Just try it anyway
                player.currentTime = target;
            }
        }
    </script>

</body>
</html>`;

  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  fs.writeFileSync('dist/index.html', html);
}

build();
