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
    
    const ext = m.Key?.split('.').pop()?.toLowerCase();
    let type = "video/mp4"; 
    if (ext === 'mkv') type = "video/x-matroska";
    if (ext === 'webm') type = "video/webm";

    return `<a href="${videoUrl}" class="movie-link" onclick="playVideo('${videoUrl}'); return false;">${fileName}</a>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>TV Movie Portal</title>
    <style>
        body { 
            background: #1a1a1a; 
            color: #ffffff; 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 20px;
        }
        /* Using table layout for best compatibility on old browsers */
        .main-container {
            display: table;
            width: 100%;
            border-spacing: 20px 0;
        }
        .column {
            display: table-cell;
            vertical-align: top;
        }
        #left-col {
            width: 70%;
        }
        #right-col {
            width: 30%;
            background: #222;
            padding: 15px;
            border: 1px solid #444;
        }
        video { 
            width: 100%; 
            max-width: 900px;
            background: #000; 
            border: 2px solid #444;
        }
        .seek-controls {
            margin-top: 15px;
            background: #333;
            padding: 10px;
            border-radius: 5px;
        }
        input[type="number"] {
            padding: 10px;
            width: 100px;
            font-size: 1.2rem;
        }
        button {
            padding: 10px 20px;
            font-size: 1.2rem;
            cursor: pointer;
            background: #00bfff;
            border: none;
            color: white;
        }
        .movie-link {
            display: block;
            padding: 12px;
            color: #00bfff;
            text-decoration: none;
            font-size: 1.1rem;
            border-bottom: 1px solid #333;
        }
        .movie-link:focus, button:focus, input:focus {
            background: #ffffff;
            color: #000000;
            outline: 3px solid orange;
        }
    </style>
</head>
<body>

    <div class="main-container">
        <div id="left-col" class="column">
            <video id="tvPlayer" controls>
                Your TV browser is too old for HTML5 video.
            </video>
            
            <div class="seek-controls">
                <label>Seek to (minutes): </label>
                <input type="number" id="seekTime" value="0" min="0">
                <button onclick="manualSeek()">Go</button>
            </div>
        </div>

        <div id="right-col" class="column">
            <h3 style="margin-top:0;">Movies</h3>
            <div style="max-height: 80vh; overflow-y: auto;">
                ${movieLinks}
            </div>
        </div>
    </div>

    <script>
        var player = document.getElementById('tvPlayer');

        function playVideo(url) {
            player.src = url;
            player.load();
            player.play();
        }

        function manualSeek() {
            var minutes = document.getElementById('seekTime').value;
            var seconds = parseInt(minutes) * 60;
            
            if (!isNaN(seconds)) {
                // Some old browsers require the video to be playing/loaded before seeking
                player.currentTime = seconds;
            }
        }
    </script>

</body>
</html>`;

  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  fs.writeFileSync('dist/index.html', html);
  console.log("Website generated in /dist");
}

build();
