from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import json
import tempfile
import os
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

# YouTube quality itags and their corresponding resolutions
QUALITY_ITAGS = {
    '137': {'height': 1080, 'fps': 30},  # 1080p
    '136': {'height': 720, 'fps': 30},   # 720p
    '135': {'height': 480, 'fps': 30},   # 480p
    '134': {'height': 360, 'fps': 30},   # 360p
    '133': {'height': 240, 'fps': 30},   # 240p
}

@app.get("/video/{video_id}")
async def get_video(video_id: str):
    try:
        # Get direct streaming URLs for different qualities
        formats = []
        for itag, quality in QUALITY_ITAGS.items():
            url = f"https://www.youtube.com/watch?v={video_id}&itag={itag}"
            formats.append({
                "url": url,
                "height": quality['height'],
                "fps": quality['fps'],
                "vcodec": "avc1"
            })
        
        # Get video metadata using a simpler yt-dlp command
        command = [
            "yt-dlp",
            "--no-check-certificate",
            "--no-warnings",
            "--print-json",
            "--skip-download",
            "--youtube-skip-dash-manifest",
            "--no-playlist",
            f"https://youtube.com/watch?v={video_id}"
        ]
        
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            video_info = json.loads(result.stdout)
            
            return {
                "formats": formats,
                "title": video_info.get("title", "Video"),
                "description": video_info.get("description", ""),
                "thumbnail": video_info.get("thumbnail", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                "duration": video_info.get("duration", 0)
            }
        except subprocess.CalledProcessError:
            # If metadata fetch fails, return basic info
            return {
                "formats": formats,
                "title": "Video",
                "description": "",
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "duration": 0
            }

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        # Return fallback format
        return {
            "formats": [{
                "url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&controls=1&disablekb=0&fs=1&modestbranding=1&rel=0",
                "height": 720,
                "fps": 30,
                "vcodec": "avc1"
            }],
            "title": "Video",
            "description": "",
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "duration": 0
        }

# ... rest of your code ...
