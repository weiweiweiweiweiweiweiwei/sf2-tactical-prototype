FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs friends.mjs ./
ENV PORT=8787 HOST=0.0.0.0 DATA_DIR=/data TRUST_PROXY=1
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
