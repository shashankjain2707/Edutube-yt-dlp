FROM python:3.8-slim

# Install Node.js and other dependencies
RUN apt-get update && \
    apt-get install -y \
    curl \
    ffmpeg \
    gnupg \
    ca-certificates \
    openssl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update certificates and create SSL directory
RUN update-ca-certificates
RUN mkdir -p /etc/ssl/certs

# Install yt-dlp with specific options
RUN pip install --no-cache-dir yt-dlp==2023.11.16 requests urllib3 certifi

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Final verification
RUN which yt-dlp
RUN yt-dlp --version
RUN node --version
RUN python3 --version

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
