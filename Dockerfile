# -------------------------------
# Stage 1: Build the app
# -------------------------------
    FROM node:20-bullseye AS build

    # Set working directory
    WORKDIR /app
    
    # Copy package files
    COPY package*.json ./
    
    # Install dependencies
    RUN npm install
    
    # Copy source files
    COPY . .
    
    # Build the app
    RUN npm run build
    
    # -------------------------------
    # Stage 2: Final image with ffmpeg + ffprobe
    # -------------------------------
    FROM node:20-bullseye
    
    # Install ffmpeg and ffprobe
    RUN apt-get update && \
        apt-get install -y ffmpeg && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/*
    
    # Set working directory
    WORKDIR /app
    
    # Copy app from build stage
    COPY --from=build /app/package*.json ./
    COPY --from=build /app/node_modules ./node_modules
    COPY --from=build /app/dist ./dist
    COPY --from=build /app/config/ssl ./config/ssl
    
    # Environment variables
    ENV FFMPEG_PATH=/usr/bin/ffmpeg
    ENV FFPROBE_PATH=/usr/bin/ffprobe
    
    # Expose app port
    EXPOSE 3000
    
    # Start the app
    CMD ["node", "dist/main.js"]
    