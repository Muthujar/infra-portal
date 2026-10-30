# One image for both the API and the worker (the command decides which one runs).
FROM node:22-bookworm-slim

# Terraform CLI, used by the worker when PROVISIONER=local
ARG TERRAFORM_VERSION=1.9.8
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates openssl \
    && curl -fsSL -o /tmp/tf.zip https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip \
    && unzip /tmp/tf.zip -d /usr/local/bin && rm /tmp/tf.zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 4000
CMD ["node", "dist/server.js"]
