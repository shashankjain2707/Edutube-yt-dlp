const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const app = express();

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

app.use(limiter);

// API key verification middleware - but skip for health check
app.use((req, res, next) => {
    // Skip API key check for health endpoint
    if (req.path === '/health') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        console.log('Unauthorized access attempt');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Video info endpoint
app.get('/video/:videoId', async (req, res) => {
    const { videoId } = req.params;
    
    if (!videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    try {
        console.log(`Fetching info for video: ${videoId}`);
        const videoInfo = await getVideoInfo(videoId);
        res.json(videoInfo);
    } catch (error) {
        console.error('Error fetching video:', error);
        res.status(500).json({ 
            error: 'Failed to fetch video info',
            details: error.message 
        });
    }
});

function getVideoInfo(videoId) {
    return new Promise((resolve, reject) => {
        const command = `yt-dlp -J https://youtube.com/watch?v=${videoId}`;
        console.log(`Executing command: ${command}`);
        
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('yt-dlp error:', error);
                reject(error);
                return;
            }
            
            try {
                const info = JSON.parse(stdout);
                resolve({
                    formats: info.formats.filter(f => f.ext === 'mp4'),
                    title: info.title,
                    description: info.description,
                    thumbnail: info.thumbnail,
                    duration: info.duration
                });
            } catch (e) {
                console.error('Parse error:', e);
                reject(e);
            }
        });
    });
}

// Update the playlist endpoint
app.get('/playlist/:playlistId', async (req, res) => {
    const { playlistId } = req.params;
    
    if (!playlistId) {
        return res.status(400).json({ error: 'Missing playlist ID' });
    }
    
    try {
        console.log(`Fetching playlist info: ${playlistId}`);
        const command = `yt-dlp -J --flat-playlist "https://www.youtube.com/playlist?list=${playlistId}"`;
        
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('yt-dlp error:', error);
                return res.status(500).json({ 
                    error: 'Failed to fetch playlist',
                    details: error.message
                });
            }
            
            try {
                const info = JSON.parse(stdout);
                const playlistInfo = {
                    title: info.title,
                    videos: info.entries.map(entry => ({
                        id: entry.id,
                        title: entry.title
                    }))
                };
                res.json(playlistInfo);
            } catch (e) {
                console.error('Parse error:', e);
                res.status(500).json({ 
                    error: 'Failed to parse playlist info',
                    details: e.message
                });
            }
        });
    } catch (error) {
        console.error('Error in playlist endpoint:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something broke!',
        details: err.message 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`CORS origin: ${process.env.FRONTEND_URL || '*'}`);
});
