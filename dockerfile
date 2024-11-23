FROM node:16

# Install Python, pip, and Chrome dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp with specific version and verify installation
RUN pip3 install --no-cache-dir yt-dlp==2023.11.16 && \
    python3 -m pip install --upgrade yt-dlp

# Create symbolic links to yt-dlp in Python's bin directory
RUN ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp

# Create Chrome data directory
RUN mkdir -p /root/.config/chromium

# Verify installation
RUN yt-dlp --version

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Final verification
RUN which yt-dlp || true
RUN yt-dlp --version || true
RUN chromium --version || true

EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
