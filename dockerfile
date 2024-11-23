FROM node:16

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg

# Install yt-dlp with specific version
RUN pip3 install --no-cache-dir yt-dlp==2023.11.16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Verify yt-dlp installation
RUN yt-dlp --version

EXPOSE 3000
CMD [ "node", "server.js" ]
