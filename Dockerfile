# If the bot runs poorly or errors,
# remove -slim from the image name
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/bin/python3 /usr/bin/python \
  && npm ci --omit=dev

COPY . .

CMD ["npm", "start"]
