FROM node:24-alpine
WORKDIR /app
COPY package.json worker.mjs ui.mjs server.mjs ./
COPY drizzle ./drizzle
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
