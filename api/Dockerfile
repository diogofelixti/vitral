FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# The token volume is created from this directory on first mount, owner
# included. Left to Docker it would belong to root, and the unprivileged
# process below could not store the Google grant it was just given.
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
EXPOSE 3100
CMD ["node", "src/server.js"]
