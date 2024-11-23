FROM python:3.11-slim

# Install system dependencies including Chrome
RUN apt-get update && \
    apt-get install -y \
    curl \
    ffmpeg \
    gnupg \
    ca-certificates \
    openssl \
    wget \
    python3-pip \
    chromium \
    chromium-driver && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update certificates
RUN update-ca-certificates --fresh

# Install yt-dlp
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create Chrome user directory and cookies
RUN mkdir -p /root/.config/chromium/Default && \
    echo '{ \
        "timestamp": 0, \
        "cookies": [ \
            { \
                "name": "CONSENT", \
                "value": "YES+", \
                "domain": ".youtube.com", \
                "path": "/" \
            }, \
            { \
                "name": "VISITOR_INFO1_LIVE", \
                "value": "random", \
                "domain": ".youtube.com", \
                "path": "/" \
            } \
        ] \
    }' > /root/.config/chromium/Default/Cookies

# Set permissions
RUN chmod -R 777 /root/.config/chromium

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

EXPOSE 3000

CMD [ "node", "server.js" ]
