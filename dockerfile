FROM node:16

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg

# Install yt-dlp with specific version and verify installation
RUN pip3 install --no-cache-dir yt-dlp==2023.11.16 && \
    yt-dlp --version

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Test yt-dlp again after setup
RUN yt-dlp --version

EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
