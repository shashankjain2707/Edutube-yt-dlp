FROM node:16

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Install yt-dlp
RUN pip3 install yt-dlp

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

EXPOSE 3000
CMD [ "node", "server.js" ]
