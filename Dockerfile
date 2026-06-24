FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Only copy package.json — the lockfile contains Replit-internal proxy URLs and must not be used outside Replit
COPY package.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Expose the health check port from src/app.js
EXPOSE 3000

# Start the bot
CMD [ "npm", "start" ]
