# Voyage-Editor: the map, item, NPC and quest editor
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Fails the image build if the page can't be built; the server builds it again on start.
RUN node build.mjs

# Run as uid 1000, which rebuilds public/Editor.js on start, writes /conf/editor.conf, keeps your drafts in
# /app/data and writes the assets' customs folder.
RUN mkdir -p /conf data && chown -R 1000:1000 /conf public data
USER 1000:1000

# The editor listens on 3001 by default (Editor.Port in editor.conf)
EXPOSE 3001

# The assets folder is mounted at runtime at /voyage-assets (see docker-compose.yml), which Editor.AssetsDir's
# default (../voyage-assets, from /app) finds. Settings are /conf/editor.conf, made from the template on the first start.
CMD ["node", "server.js", "--conf", "/conf"]
