# Build the static site, then serve it with an unprivileged nginx (no root in the container).
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

FROM nginxinc/nginx-unprivileged:1.28-alpine
ARG VITE_API_URL
# The image renders /etc/nginx/templates/*.template with env vars at start-up:
# $PORT is the platform's port, $API_ORIGIN feeds the Content-Security-Policy connect-src.
ENV PORT=8080 API_ORIGIN=$VITE_API_URL
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
