# Would use bun, but because better-sqlite3 hates it haha
FROM node:22

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN ln -s /usr/bin/python3 /usr/bin/python

RUN npm install --omit=dev

CMD ["npm", "run", "start"]