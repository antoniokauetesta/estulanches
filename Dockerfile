FROM node:22-alpine AS dependencias
ENV NODE_ENV=production
WORKDIR /srv/estulanches
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM dependencias AS servico
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "src/main.js"]

FROM dependencias AS verificacao
COPY src ./src
COPY tests ./tests
USER node
CMD ["npm", "test"]
