# ADrenaline CRM для Railway. Внешних зависимостей нет — нужен только Node.js 22.13+ (встроенный SQLite).
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY . .
# База живёт на Volume Railway, смонтированном в /srv/data (переменная DATA_DIR)
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.mjs"]
