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
    python3-pip && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update certificates
RUN update-ca-certificates --fresh
RUN mkdir -p /etc/ssl/certs

# Install yt-dlp using pip
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir yt-dlp

# Create symbolic link
RUN ln -sf $(which yt-dlp) /usr/local/bin/yt-dlp

# Install Python dependencies
RUN pip3 install --no-cache-dir requests urllib3 certifi

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
RUN yt-dlp --version
RUN node --version

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
