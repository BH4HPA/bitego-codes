FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN yarn install --immutable
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN yarn build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN yarn workspaces focus --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s CMD node -e 'require(\"http\").get(\"http://localhost:3000/health\",r=>process.exit(r.statusCode===200?0:1)).on(\"error\",()=>process.exit(1))'
CMD ["node", "dist/index.js"]
