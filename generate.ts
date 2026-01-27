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
        body { background: #1a1a1a; color: #fff; font-family: sans-serif; margin: 0; padding: 10px; }
        .container { width: 100%; overflow: hidden; }
        .video-section { float: left; width: 68%; }
        .list-section { float: right; width: 28%; background: #222; padding: 10px; border: 1px solid #444; height: 90vh; overflow-y: auto; }
        video { width: 100%; background: #000; border: 1px solid #555; height: 400px; }
        .seek-box { margin-top: 15px; padding: 15px; background: #333; border-radius: 4px; }
        input { padding: 12px; font-size: 20px; width: 100px; border: 1px solid #999; }
        button { padding: 12px 20px; font-size: 20px; background: #00bfff; color: #fff; border: none; cursor: pointer; font-weight: bold; }
        .movie-link { display: block; padding: 15px; color: #00bfff; text-decoration: none; border-bottom: 1px solid #333; font-size: 1.1rem; }
        .movie-link:focus, button:focus, input:focus { background: #ffffff !important; color: #000000 !important; outline: 4px solid #ffcc00; }
        .clearfix:after { content: ""; display: table; clear: both; }
    </style>
</head>
<body>

    <div class="container clearfix">
        <div class="video-section">
            <video id="tvPlayer" controls autoplay>
                <p>HTML5 Video not supported</p>
            </video>

            <div class="seek-box">
                <label style="display:block; margin-bottom: 5px;">Enter Minute & Press Go:</label>
                <input type="number" id="seekMin" value="0">
                <button onclick="tizenHardSeek()">GO</button>
            </div>
        </div>

        <div class="list-section">
            <h3 style="margin: 0 0 10px 0; color: #ccc;">Movies</h3>
            ${movieLinks}
        </div>
    </div>

    <script type="text/javascript">
        var player = document.getElementById('tvPlayer');
        var originalUrl = "";

        function playVideo(url) {
            originalUrl = url;
            player.pause();
            player.removeAttribute('src'); // Clean exit
            player.load();
            
            player.src = url;
            player.load();
            player.play();
        }

        function tizenHardSeek() {
            var min = document.getElementById('seekMin').value;
            if (!min || isNaN(min) || !originalUrl) return;
            
            var seconds = parseInt(min) * 60;

            // 1. Completely stop the current player
            player.pause();
            
            // 2. Add a timestamp and the media fragment
            // The 'tizen_cb' param tricks the TV into thinking it's a new file
            var separator = originalUrl.indexOf('?') !== -1 ? '&' : '?';
            var cacheBuster = "tizen_cb=" + new Date().getTime();
            var seekUrl = originalUrl + separator + cacheBuster + "#t=" + seconds;
            
            console.log("Attempting Hard Re-load Seek: " + seekUrl);

            // 3. Null out the src and reload to flush the Tizen buffer
            player.src = ""; 
            player.load();

            // 4. Set the new 'fake' URL with the start time
            setTimeout(function() {
                player.src = seekUrl;
                player.load();
                
                // 5. Final attempt to play
                setTimeout(function() {
                    player.play();
                }, 500);
            }, 300);
        }
    </script>

</body>
</html>`;

  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  fs.writeFileSync('dist/index.html', html);
  console.log("Website generated in /dist");
}

build();
