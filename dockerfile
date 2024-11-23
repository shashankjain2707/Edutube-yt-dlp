FROM node:16

# Install dependencies and add deadsnakes PPA for Python 3.8
RUN apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y \
        python3.8 \
        python3.8-distutils \
        python3-pip \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install pip for Python 3.8
RUN curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && \
    python3.8 get-pip.py && \
    rm get-pip.py

# Set Python 3.8 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 1

# Install yt-dlp
RUN python3.8 -m pip install --no-cache-dir --upgrade pip && \
    python3.8 -m pip install --no-cache-dir yt-dlp==2023.11.16

# Verify installation
RUN python3.8 -m yt_dlp --version

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Final verification
RUN which python3.8
RUN python3.8 -m yt_dlp --version

EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD [ "node", "server.js" ]
