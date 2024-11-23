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

// Update CORS configuration to be more permissive
const corsOptions = {
    origin: function (origin, callback) {
        // Allow all origins
        callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Accept', 'Authorization', 'Origin', 'X-Requested-With'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 200
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Add OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

// Add headers middleware to ensure CORS works
app.use((req, res, next) => {
    // Allow all origins
    res.header('Access-Control-Allow-Origin', '*');
    
    // Allow all methods
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // Allow all headers
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization');
    
    // Allow credentials
    res.header('Access-Control-Allow-Credentials', true);
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Update API key middleware to skip test endpoints
app.use((req, res, next) => {
    // Skip API key check for health check, test endpoints, and OPTIONS
    if (req.path === '/health' || 
        req.path.startsWith('/test') || 
        req.method === 'OPTIONS') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        console.log('Unauthorized access attempt');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Playlist endpoint to fetch all videos in a playlist
app.get('/playlist/:playlistId', async (req, res) => {
    const { playlistId } = req.params;
    
    if (!playlistId) {
        return res.status(400).json({ error: 'Missing playlist ID' });
    }
    
    try {
        console.log(`Fetching playlist info: ${playlistId}`);
        // Remove --extract-flat and use --flat-playlist with --print-json
        const command = `yt-dlp --no-check-certificate --no-warnings --flat-playlist --print-json "https://www.youtube.com/playlist?list=${playlistId}"`;
        
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('yt-dlp error:', error);
                return res.status(500).json({ 
                    error: 'Failed to fetch playlist',
                    details: error.message
                });
            }
            
            try {
                // Process each line as a separate JSON object
                const videos = stdout.trim().split('\n')
                    .map(line => JSON.parse(line))
                    .map(entry => ({
                        id: entry.id,
                        title: entry.title,
                        description: entry.description || '',
                        thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
                        duration: entry.duration || 0,
                        url: `https://youtube.com/watch?v=${entry.id}`
                    }));

                const playlistInfo = {
                    title: videos[0]?.playlist_title || 'Playlist',
                    videos: videos,
                    totalVideos: videos.length
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

// Video streaming endpoint
app.get('/video/:videoId', async (req, res) => {
    const { videoId } = req.params;
    
    if (!videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    try {
        console.log(`Processing video request for ID: ${videoId}`);
        // Simplified command for direct video URL
        const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
            --no-check-certificate \
            --no-warnings \
            --no-playlist \
            --no-call-home \
            --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
            -j "https://youtube.com/watch?v=${videoId}"`;
            
        console.log('Executing command:', command);

        exec(command, { 
            timeout: 60000,
            env: {
                ...process.env,
                PYTHONHTTPSVERIFY: '0',
                PYTHONWARNINGS: 'ignore:Unverified HTTPS request'
            }
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('Command execution error:', error);
                console.error('stderr:', stderr);
                return res.status(500).json({ 
                    error: 'Failed to fetch video info',
                    details: stderr || error.message,
                    videoId: videoId
                });
            }
            
            try {
                const info = JSON.parse(stdout);
                const formats = info.formats
                    .filter(f => f.ext === 'mp4' && f.url && f.vcodec !== 'none')
                    .map(f => ({
                        url: f.url,
                        ext: f.ext,
                        height: f.height || 0,
                        width: f.width || 0,
                        filesize: f.filesize || 0,
                        format_note: f.format_note || '',
                        vcodec: f.vcodec || 'none',
                        acodec: f.acodec || 'none',
                        tbr: f.tbr || 0,
                        fps: f.fps || 0
                    }))
                    .sort((a, b) => b.height - a.height);

                if (formats.length === 0) {
                    // Try to get direct URL if no formats found
                    formats.push({
                        url: info.url,
                        ext: 'mp4',
                        height: info.height || 720,
                        width: info.width || 1280,
                        filesize: 0,
                        format_note: 'Default'
                    });
                }

                const response = {
                    formats,
                    title: info.title || 'Untitled',
                    description: info.description || '',
                    thumbnail: info.thumbnail || '',
                    duration: info.duration || 0,
                    videoId: videoId
                };

                console.log(`Found ${formats.length} valid formats`);
                res.json(response);
            } catch (e) {
                console.error('Parse error:', e);
                console.error('Raw stdout:', stdout);
                res.status(500).json({ 
                    error: 'Failed to parse video info',
                    details: e.message,
                    videoId: videoId
                });
            }
        });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message,
            videoId: videoId
        });
    }
});

// Add this test endpoint
app.get('/test', (req, res) => {
    res.json({
        message: 'Test endpoint working',
        headers: req.headers,
        apiKey: req.headers['x-api-key'] === process.env.API_KEY ? 'valid' : 'invalid'
    });
});

// Update test endpoints
app.get('/test-ytdlp', (req, res) => {
    console.log('Testing yt-dlp version...');
    exec('yt-dlp --version', (error, stdout, stderr) => {
        if (error) {
            console.error('Error testing yt-dlp:', error);
            return res.status(500).json({
                error: 'yt-dlp test failed',
                details: error.message,
                stderr: stderr
            });
        }
        console.log('yt-dlp version:', stdout.trim());
        res.json({
            status: 'ok',
            version: stdout.trim(),
            message: 'yt-dlp is working'
        });
    });
});

app.get('/test-ytdlp-path', (req, res) => {
    console.log('Testing yt-dlp path...');
    exec('which yt-dlp', (error, stdout, stderr) => {
        const response = {
            error: error?.message,
            stdout: stdout?.trim(),
            stderr: stderr,
            path: process.env.PATH,
            message: error ? 'yt-dlp not found' : 'yt-dlp found at: ' + stdout.trim()
        };
        console.log('Test response:', response);
        res.json(response);
    });
});

// Add a test endpoint for direct video info
app.get('/test-video/:videoId', async (req, res) => {
    const { videoId } = req.params;
    
    try {
        // Simple command to test video info fetching
        const command = `yt-dlp -j "https://youtube.com/watch?v=${videoId}"`;
        exec(command, (error, stdout, stderr) => {
            res.json({
                error: error?.message,
                stdout: stdout?.trim(),
                stderr: stderr,
                command: command
            });
        });
    } catch (error) {
        res.status(500).json({
            error: 'Test failed',
            details: error.message
        });
    }
});

// Add this test endpoint
app.get('/test-video-formats/:videoId', async (req, res) => {
    const { videoId } = req.params;
    
    try {
        // Add environment variables and SSL options
        const env = {
            ...process.env,
            PYTHONHTTPSVERIFY: '0',
            REQUESTS_CA_BUNDLE: '',
            SSL_CERT_FILE: ''
        };
        
        const command = `yt-dlp --no-check-certificate --no-warnings -F "https://youtube.com/watch?v=${videoId}"`;
        exec(command, { env: env }, (error, stdout, stderr) => {
            res.json({
                error: error?.message,
                formats: stdout?.trim(),
                stderr: stderr,
                command: command,
                path: process.env.PATH,
                cwd: process.cwd()
            });
        });
    } catch (error) {
        res.status(500).json({
            error: 'Test failed',
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
