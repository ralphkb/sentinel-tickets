# Would use bun, but because better-sqlite3 hates it haha
FROM node:22-alpine AS builder

WORKDIR /app

# Install system dependencies needed for compiling better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files first to leverage Docker layer cache
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Production stage, no build tools
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app .

# Run as non-root user
RUN chown -R node:node /app
USER node

CMD ["node", "index.js"]