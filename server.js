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

// Update CORS configuration at the top of the file
const corsOptions = {
    origin: '*',
    methods: ['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Accept', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Add preflight handler for all routes
app.options('*', cors(corsOptions));

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
        req.path === '/test-ytdlp' || 
        req.path === '/test-ytdlp-path' ||
        req.path === '/test' ||
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

// Add custom headers middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Accept, Authorization');
    next();
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
        
        // Validate response before sending
        if (!videoInfo.formats || videoInfo.formats.length === 0) {
            throw new Error('No valid formats available');
        }

        console.log(`Successfully fetched video info. Found ${videoInfo.formats.length} formats`);
        res.json(videoInfo);
    } catch (error) {
        console.error('Error fetching video:', error);
        // Send more detailed error response
        res.status(500).json({ 
            error: 'Failed to fetch video info',
            details: error.message,
            videoId: videoId
        });
    }
});

function getVideoInfo(videoId) {
    return new Promise((resolve, reject) => {
        // Use absolute path to yt-dlp and add more options for debugging
        const command = `/usr/local/bin/yt-dlp -J --verbose "https://youtube.com/watch?v=${videoId}"`;
        console.log('Starting command execution:', command);
        
        exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
            console.log('Command execution completed');
            console.log('stdout:', stdout);
            console.log('stderr:', stderr);
            
            if (error) {
                console.error('yt-dlp execution error:', error);
                console.error('stderr:', stderr);
                reject(new Error(`yt-dlp failed: ${stderr || error.message}`));
                return;
            }
            
            if (!stdout) {
                console.error('No output from yt-dlp');
                reject(new Error('No output from yt-dlp'));
                return;
            }

            try {
                console.log('Parsing JSON output');
                const info = JSON.parse(stdout);
                
                if (!info) {
                    console.error('Parsed info is null or undefined');
                    reject(new Error('Failed to parse video info'));
                    return;
                }

                console.log('Processing formats');
                // Filter and validate formats
                const formats = info.formats
                    .filter(f => {
                        console.log('Format:', f);
                        return f.ext === 'mp4' && f.url;
                    })
                    .map(f => ({
                        url: f.url,
                        ext: f.ext,
                        height: f.height || 0,
                        width: f.width || 0,
                        filesize: f.filesize || 0,
                        format_note: f.format_note || ''
                    }));

                console.log(`Found ${formats.length} valid formats`);

                if (formats.length === 0) {
                    reject(new Error('No valid formats found'));
                    return;
                }

                const response = {
                    formats,
                    title: info.title || 'Untitled',
                    description: info.description || '',
                    thumbnail: info.thumbnail || '',
                    duration: info.duration || 0
                };

                console.log('Sending response:', response);
                resolve(response);
            } catch (e) {
                console.error('Parse error:', e);
                reject(new Error(`Failed to parse video info: ${e.message}`));
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
