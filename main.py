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

def create_cookies_file():
    """Create a temporary cookies file with basic YouTube consent"""
    cookies_content = """# Netscape HTTP Cookie File
.youtube.com	TRUE	/	FALSE	2147483647	CONSENT	YES+cb
.youtube.com	TRUE	/	FALSE	2147483647	VISITOR_INFO1_LIVE	random_string
.youtube.com	TRUE	/	FALSE	2147483647	GPS	1
.youtube.com	TRUE	/	FALSE	2147483647	YSC	random_string
.youtube.com	TRUE	/	FALSE	2147483647	PREF	f6=40000000&hl=en"""
    
    # Create temporary file
    temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt')
    temp_file.write(cookies_content)
    temp_file.close()
    return temp_file.name

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
        # Create temporary cookies file
        cookies_file = create_cookies_file()
        
        command = [
            "yt-dlp",
            "--format", "bestvideo[ext=mp4][protocol^=http]+bestaudio[ext=m4a][protocol^=http]/best[ext=mp4][protocol^=http]/best",
            "--no-check-certificate",
            "--no-warnings",
            "--no-playlist",
            "--print-json",
            "--cookies", cookies_file,
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "--add-header", "Accept-Language: en-US,en;q=0.5",
            "--add-header", "Origin: https://www.youtube.com",
            "--add-header", "Referer: https://www.youtube.com",
            "--add-header", "Sec-Fetch-Dest: document",
            "--add-header", "Sec-Fetch-Mode: navigate",
            "--add-header", "Sec-Fetch-Site: none",
            "--add-header", "Sec-Fetch-User: ?1",
            "--geo-bypass",
            "--no-cache-dir",
            "--extractor-args", "youtube:player_client=android,web",
            f"https://youtube.com/watch?v={video_id}"
        ]
        
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            video_info = json.loads(result.stdout)
            
            # Clean up cookies file
            os.unlink(cookies_file)
            
            formats = [
                {
                    "url": f["url"],
                    "height": f.get("height", 0),
                    "fps": f.get("fps", 0),
                    "vcodec": f.get("vcodec", "")
                }
                for f in video_info["formats"]
                if f.get("ext") == "mp4" and f.get("url") and f.get("protocol", "").startswith("http")
            ]
            
            formats.sort(key=lambda x: x["height"], reverse=True)
            
            if not formats:
                # If no formats found, try with embedded URL
                return {
                    "formats": [{
                        "url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&controls=1&disablekb=0&fs=1&modestbranding=1&rel=0",
                        "height": 720,
                        "fps": 30,
                        "vcodec": "avc1"
                    }],
                    "title": video_info.get("title", ""),
                    "description": video_info.get("description", ""),
                    "thumbnail": video_info.get("thumbnail", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                    "duration": video_info.get("duration", 0)
                }
            
            return {
                "formats": formats,
                "title": video_info.get("title", ""),
                "description": video_info.get("description", ""),
                "thumbnail": video_info.get("thumbnail", ""),
                "duration": video_info.get("duration", 0)
            }

        finally:
            # Ensure cookies file is deleted even if an error occurs
            if os.path.exists(cookies_file):
                os.unlink(cookies_file)

    except subprocess.CalledProcessError as e:
        print(f"yt-dlp error: {e.stderr}")
        # Return fallback embed URL
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
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching video: {str(e)}")
