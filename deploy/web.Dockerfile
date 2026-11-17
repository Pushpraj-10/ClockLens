FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install && pnpm --filter @clocklens/web build
CMD ["pnpm", "--filter", "@clocklens/web", "start"]
