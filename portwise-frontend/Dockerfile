# Build the static site, then serve it with nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines these at build time: changing them requires a rebuild.
ARG VITE_API_URL
ARG VITE_USE_MOCKS=false
ARG VITE_SITE_URL
ENV VITE_API_URL=$VITE_API_URL VITE_USE_MOCKS=$VITE_USE_MOCKS VITE_SITE_URL=$VITE_SITE_URL
RUN npx vite build

FROM nginx:1.27-alpine
# The official image renders /etc/nginx/templates/*.template with env vars at start-up,
# so the platform's $PORT is honoured (default 80).
ENV PORT=80
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
