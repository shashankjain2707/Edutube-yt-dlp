FROM python:3.11-slim

# Install system dependencies
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
RUN mkdir -p /etc/ssl/certs

# Install yt-dlp and dependencies
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    pip3 install --no-cache-dir requests urllib3 certifi selenium

# Create Chrome data directory
RUN mkdir -p /root/.config/chromium

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Test installations
RUN python3 --version
RUN pip3 --version
RUN /usr/local/bin/yt-dlp --version || true
RUN node --version
RUN chromium --version || true

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
