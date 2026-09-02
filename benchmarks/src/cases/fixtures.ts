/**
 * Concrete synthetic code fixtures for the 10 benchmark cases (§28).
 */
export const BENCHMARK_FIXTURES: Record<string, { path: string; content: string }> = {
  "ARGUS-BM-01": {
    path: ".github/workflows/ci.yml",
    content: `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v2
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
`,
  },
  "ARGUS-BM-02": {
    path: ".github/workflows/test.yml",
    content: `name: Test
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Run test
        run: npm test
`,
  },
  "ARGUS-BM-03": {
    path: ".github/workflows/deploy.yml",
    content: `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Push to production
        env:
          API_TOKEN: ghp_1234567890abcdef1234567890abcdef123456
        run: ./deploy.sh
`,
  },
  "ARGUS-BM-04": {
    path: ".github/workflows/main.yml",
    content: `name: Main
on: [push]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Starting setup..."
          sudo apt-get update
          sudo apt-get install -y libpq-dev
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          echo "Starting setup..."
          sudo apt-get update
          sudo apt-get install -y libpq-dev
`,
  },
  "ARGUS-BM-05": {
    path: ".github/workflows/build.yml",
    content: `name: Build Pipeline
on: [push]
jobs:
  monolith:
    runs-on: ubuntu-latest
    steps:
      - run: echo step 1
      - run: echo step 2
      - run: echo step 3
      - run: echo step 4
      - run: echo step 5
      - run: echo step 6
      - run: echo step 7
      - run: echo step 8
      - run: echo step 9
      - run: echo step 10
      - run: echo step 11
      - run: echo step 12
      - run: echo step 13
      - run: echo step 14
      - run: echo step 15
      - run: echo step 16
      - run: echo step 17
      - run: echo step 18
      - run: echo step 19
      - run: echo step 20
      - run: echo step 21
      - run: echo step 22
      - run: echo step 23
      - run: echo step 24
      - run: echo step 25
      - run: echo step 26
      - run: echo step 27
      - run: echo step 28
      - run: echo step 29
      - run: echo step 30
      - run: echo step 31
`,
  },
  "ARGUS-BM-06": {
    path: "Dockerfile",
    content: `FROM node:latest
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "index.js"]
`,
  },
  "ARGUS-BM-07": {
    path: "Dockerfile",
    content: `FROM ubuntu
WORKDIR /app
COPY . .
CMD ["./run.sh"]
`,
  },
  "ARGUS-BM-08": {
    path: "Dockerfile",
    content: `FROM alpine:3.18
RUN apk update
RUN apk add curl
RUN apk add git
RUN apk add nodejs
RUN apk add npm
RUN apk add python3
RUN apk add py3-pip
RUN apk add bash
RUN apk add gcc
RUN apk add make
RUN apk add g++
RUN apk add openjdk17
RUN apk add maven
RUN apk add gradle
RUN apk add zlib-dev
WORKDIR /app
`,
  },
  "ARGUS-BM-09": {
    path: "Dockerfile",
    content: `FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y curl git
WORKDIR /app
COPY . .
CMD ["./app"]
`,
  },
  "ARGUS-BM-10": {
    path: "Dockerfile",
    content: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
EXPOSE 3000
ENTRYPOINT ["node", "server.js"]
`,
  },
};
