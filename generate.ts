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
        body { background: #1a1a1a; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 10px; }
        .container { width: 100%; overflow: hidden; }
        .video-section { float: left; width: 68%; }
        .list-section { float: right; width: 28%; background: #222; padding: 10px; border: 1px solid #444; height: 92vh; overflow-y: auto; }
        
        /* Fixed height often helps Tizen rendering */
        #tvPlayer { width: 100%; background: #000; border: 1px solid #555; height: 480px; }
        
        .seek-box { margin-top: 15px; padding: 20px; background: #333; border: 2px solid #444; }
        input { padding: 15px; font-size: 24px; width: 120px; vertical-align: middle; }
        button { padding: 15px 30px; font-size: 24px; background: #00bfff; color: #fff; border: none; cursor: pointer; vertical-align: middle; font-weight: bold; }
        
        .movie-link { display: block; padding: 15px; color: #00bfff; text-decoration: none; border-bottom: 1px solid #333; font-size: 1.1rem; }
        .movie-link:focus, button:focus, input:focus { background: #fff !important; color: #000 !important; outline: 5px solid yellow; }
        .clearfix:after { content: ""; display: table; clear: both; }
    </style>
</head>
<body>

    <div class="container clearfix">
        <div class="video-section">
            <video id="tvPlayer" controls preload="none">
                <p>HTML5 Video not supported</p>
            </video>

            <div class="seek-box">
                <input type="number" id="seekMin" value="0" placeholder="Min">
                <button onclick="tizenBruteSeek()">JUMP TO TIME</button>
            </div>
        </div>

        <div class="list-section">
            <h3 style="margin: 0 0 10px 0;">Movies</h3>
            ${movieLinks}
        </div>
    </div>

    <script type="text/javascript">
        var player = document.getElementById('tvPlayer');
        var currentUrl = "";

        function playVideo(url) {
            currentUrl = url;
            player.pause();
            player.src = url;
            player.load();
            player.play();
        }

        function tizenBruteSeek() {
            var min = document.getElementById('seekMin').value;
            if (!min || isNaN(min) || !currentUrl) return;
            
            var seconds = parseInt(min) * 60;

            // THE TIZEN 2.1 RESET FIX:
            // 1. Fully kill the element's current state
            player.pause();
            player.removeAttribute('src'); 
            player.load(); 

            // 2. Wait for the hardware to flush (long delay is safer)
            setTimeout(function() {
                // 3. Re-inject the source with a "Cache Buster" AND the Fragment
                // This forces a brand new HTTP request that ignores previous buffer
                var cleanUrl = currentUrl.split('?')[0].split('#')[0];
                var bypassUrl = cleanUrl + "?t=" + new Date().getTime() + "#t=" + seconds;
                
                player.src = bypassUrl;
                player.load();

                // 4. Wait for metadata before play
                var playAttempt = setInterval(function() {
                    if (player.readyState >= 1) {
                        player.play();
                        clearInterval(playAttempt);
                    }
                }, 200);

                // Auto-kill attempt after 5 seconds if it hangs
                setTimeout(function() { clearInterval(playAttempt); }, 5000);

            }, 500);
        }
    </script>

</body>
</html>`;

  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  fs.writeFileSync('dist/index.html', html);
  console.log("Website generated in /dist");
}

build();
