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
        body { 
            background: #1a1a1a; 
            color: #ffffff; 
            font-family: Arial, sans-serif; 
            margin: 0; padding: 20px; 
        }
        
        /* Float-based layout for maximum old-browser compatibility */
        .container { width: 100%; overflow: hidden; }
        
        .video-section { 
            float: left; 
            width: 65%; 
        }
        
        .list-section { 
            float: right; 
            width: 30%; 
            background: #222; 
            padding: 10px;
            height: 80vh;
            overflow-y: auto;
            border: 1px solid #444;
        }

        video { 
            width: 100%; 
            background: #000; 
            border: 1px solid #555;
        }

        .seek-box {
            margin-top: 20px;
            padding: 15px;
            background: #333;
            border: 1px solid #444;
        }

        input { 
            padding: 10px; 
            font-size: 18px; 
            width: 80px; 
        }

        button { 
            padding: 10px 20px; 
            font-size: 18px; 
            background: #00bfff; 
            color: #fff; 
            border: none;
            cursor: pointer;
        }

        .movie-link {
            display: block;
            padding: 15px;
            color: #00bfff;
            text-decoration: none;
            border-bottom: 1px solid #333;
            font-size: 18px;
        }

        .movie-link:focus, button:focus, input:focus {
            background: #fff;
            color: #000;
            outline: 5px solid yellow;
        }

        .clearfix:after {
            content: "";
            display: table;
            clear: both;
        }
    </style>
</head>
<body>

    <div class="container clearfix">
        <div class="video-section">
            <video id="tvPlayer" controls preload="metadata">
                Your browser does not support HTML5 video.
            </video>

            <div class="seek-box">
                <label>Minutes: </label>
                <input type="number" id="seekMin" value="0">
                <button id="seekBtn" onclick="manualSeek()">Go to Time</button>
            </div>
        </div>

        <div class="list-section">
            <h3 style="margin: 0 0 10px 0;">Movie List</h3>
            ${movieLinks}
        </div>
    </div>

    <script type="text/javascript">
        var player = document.getElementById('tvPlayer');

        function playVideo(url) {
            // Re-binding the source manually for old browsers
            player.pause();
            player.src = url;
            player.load();
            player.play();
        }

        function manualSeek() {
            var min = document.getElementById('seekMin').value;
            var targetSeconds = parseInt(min) * 60;
            
            if (!isNaN(targetSeconds)) {
                // Technique for old TVs: Pause, Seek, then Play
                player.pause();
                
                // Small delay to ensure the pause is registered
                setTimeout(function() {
                    try {
                        player.currentTime = targetSeconds;
                        // Another small delay before playing again
                        setTimeout(function() {
                            player.play();
                        }, 200);
                    } catch(e) {
                        alert("Cannot seek yet. Wait for video to load.");
                    }
                }, 200);
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
