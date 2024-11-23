from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import json
from typing import Optional

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/playlist/{playlist_id}")
async def get_playlist(playlist_id: str):
    try:
        command = [
            "yt-dlp",
            "--no-check-certificate",
            "--no-warnings",
            "--flat-playlist",
            "--print-json",
            f"https://www.youtube.com/playlist?list={playlist_id}"
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        
        videos = [json.loads(line) for line in result.stdout.strip().split("\n")]
        video_data = []
        
        for video in videos:
            video_data.append({
                "id": video.get("id"),
                "title": video.get("title"),
                "description": video.get("description", ""),
                "thumbnail": video.get("thumbnail", f"https://i.ytimg.com/vi/{video.get('id')}/hqdefault.jpg"),
                "duration": video.get("duration", 0)
            })

        return {
            "title": videos[0].get("playlist_title", "Playlist"),
            "videos": video_data,
            "totalVideos": len(video_data)
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Error fetching playlist: {e.stderr}")

@app.get("/video/{video_id}")
async def get_video(video_id: str):
    try:
        command = [
            "yt-dlp",
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--no-check-certificate",
            "--no-warnings",
            "--no-playlist",
            "--print-json",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "--add-header", "Accept-Language: en-US,en;q=0.5",
            "--add-header", "Origin: https://www.youtube.com",
            "--add-header", "Referer: https://www.youtube.com",
            "--geo-bypass",
            f"https://youtube.com/watch?v={video_id}"
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        video_info = json.loads(result.stdout)
        
        formats = [
            {
                "url": f["url"],
                "height": f.get("height", 0),
                "fps": f.get("fps", 0),
                "vcodec": f.get("vcodec", "")
            }
            for f in video_info["formats"]
            if f.get("ext") == "mp4" and f.get("url")
        ]
        
        formats.sort(key=lambda x: x["height"], reverse=True)
        
        return {
            "formats": formats,
            "title": video_info.get("title", ""),
            "description": video_info.get("description", ""),
            "thumbnail": video_info.get("thumbnail", ""),
            "duration": video_info.get("duration", 0)
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Error fetching video: {e.stderr}") 
