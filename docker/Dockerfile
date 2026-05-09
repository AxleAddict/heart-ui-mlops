# ---- build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL is empty — nginx proxies /predict directly
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template

# nginx envsubst replaces ${HEART_API_URL} at container start
ENV HEART_API_URL=http://heart-api-svc:8000

EXPOSE 80
CMD ["/bin/sh", "-c", "envsubst '${HEART_API_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
