# Heart Disease Classifier — React UI

A React-based web interface for the Heart Disease Classifier API. Users can enter the 13 UCI clinical features through a guided form and receive an instant binary prediction (disease / no disease) with a confidence score. The app is built with Vite, served by nginx in production, and ships through its own Jenkins CI/CD pipeline to Kubernetes.

---

## Table of Contents

- [Project Overview](#project-overview)
- [How It Connects to the API](#how-it-connects-to-the-api)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
  - [1. Install dependencies](#1-install-dependencies)
  - [2. Start the dev server (with API proxy)](#2-start-the-dev-server-with-api-proxy)
  - [3. Point to a running API](#3-point-to-a-running-api)
- [Building for Production](#building-for-production)
- [Docker](#docker)
  - [Build the image](#build-the-image)
  - [Run locally with Docker](#run-locally-with-docker)
  - [Run against a local API instance](#run-against-a-local-api-instance)
  - [How the API URL is injected](#how-the-api-url-is-injected)
- [CI/CD Pipeline](#cicd-pipeline)
  - [CI pipeline (Jenkinsfile)](#ci-pipeline-jenkinsfile)
  - [Prod pipeline (Jenkinsfile.prod)](#prod-pipeline-jenkinsfileprod)
- [Kubernetes Manifests](#kubernetes-manifests)
- [nginx Configuration](#nginx-configuration)

---

## Project Overview

| Concern | Tooling |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 5 |
| Production server | nginx 1.27 (Alpine) |
| API proxying | nginx `proxy_pass` (in production) / Vite dev proxy (in development) |
| Containerisation | Docker multi-stage build |
| CI/CD | Jenkins (shared instance with the API pipeline) |
| Orchestration | Kubernetes — blue/green deployment strategy |

---

## How It Connects to the API

The UI **never calls the API directly from the browser** using a hardcoded hostname. Instead, nginx (or the Vite dev server) acts as a reverse proxy:

```
Browser
  │
  ├── GET  /            → serves React bundle (static files)
  ├── POST /predict     ─────────────────────────────────────────────────┐
  ├── GET  /health      → nginx proxies these paths to the API service   │
  ├── GET  /ready       ─────────────────────────────────────────────────┘
  └── GET  /metrics                                                       │
                                                                          ▼
                                                               heart-api-svc:8000
                                                               (Kubernetes Service)
```

**Why this approach?**

- The React bundle is purely static — no API URL is baked in at build time
- The nginx container receives `HEART_API_URL` as an environment variable at startup (`envsubst` writes it into the nginx config). This means the same Docker image works in every environment; only the env var differs.
- In Kubernetes, `HEART_API_URL` resolves to `http://heart-api-svc:8000` — the cluster-internal DNS name for the API Service. This keeps API traffic inside the cluster and avoids an extra network hop through a LoadBalancer.

---

## Project Structure

```
heart-ui/
├── src/
│   ├── main.jsx          # React entry point — mounts <App /> into #root
│   ├── App.jsx           # Main component: form + prediction result display
│   └── index.css         # Global styles
│
├── public/               # Static assets served as-is by Vite
│
├── docker/
│   ├── Dockerfile        # Two-stage build: node:20-alpine → nginx:1.27-alpine
│   └── nginx.conf        # nginx config template (uses ${HEART_API_URL})
│
├── k8s/
│   ├── deployment-nonprod.yaml   # Non-prod: 1 replica, LoadBalancer Service
│   └── deployment-prod.yaml      # Prod: blue + green Deployments + Service
│
├── index.html            # Vite HTML entry point
├── vite.config.js        # Vite config including dev proxy
├── package.json
├── package-lock.json
├── Jenkinsfile           # CI pipeline
├── Jenkinsfile.prod      # Prod blue/green deploy pipeline
└── .gitignore
```

### Key files

| File | Purpose |
|---|---|
| `src/App.jsx` | Renders the 13-field patient form. Each field is either a `<select>` dropdown (categorical features) or a `<input type="number">` (numeric features). On submit, calls `POST /predict` and displays the result with a confidence bar. Sensible defaults are pre-filled so the form is usable immediately. |
| `docker/nginx.conf` | nginx config **template** — contains `${HEART_API_URL}` placeholder that is replaced at container startup by `envsubst`. Proxies `/predict`, `/health`, `/ready`, and `/metrics` to the API. Serves the React bundle for all other paths with `try_files $uri $uri/ /index.html` (required for React Router). |
| `docker/Dockerfile` | Stage 1 (`builder`): uses `node:20-alpine` to run `npm ci && npm run build`, producing the static `dist/` folder. Stage 2 (`runtime`): copies `dist/` into `nginx:1.27-alpine` and runs `envsubst` on the config template at container startup. |
| `vite.config.js` | Configures the Vite dev server proxy: requests to `/api/*` are forwarded to `VITE_API_URL` (default `http://localhost:8000`) with the `/api` prefix stripped. |

---

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (for containerised runs)
- A running instance of the Heart Disease API (see the `project/` README)

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server (with API proxy)

```bash
npm run dev
```

Vite starts a hot-reloading dev server at `http://localhost:5173`.

### 3. Point to a running API

The dev server proxies `/api/*` to the API backend. You need the API running locally (see the `project/` README):

```bash
# In a separate terminal, from the project/ directory:
PYTHONPATH=src uvicorn heart.api:app --host 0.0.0.0 --port 8000
```

The form submits to `/predict` (no `/api` prefix) — this goes directly through the Vite proxy defined in `vite.config.js` when running with `npm run dev`.

If your API is running on a different host or port, set `VITE_API_URL` before starting Vite:

```bash
VITE_API_URL=http://my-api-host:8000 npm run dev
```

---

## Building for Production

```bash
npm run build
```

Vite compiles and bundles the React app into `dist/`. The output is fully static HTML, CSS, and JavaScript — no Node.js is needed to serve it.

To preview the production build locally (served by Vite's built-in preview server, **not** nginx):

```bash
npm run preview
```

---

## Docker

### Build the image

```bash
# From the heart-ui/ root directory
docker build -f docker/Dockerfile -t heart-ui:latest .
```

> The build context must be the `heart-ui/` directory (not `docker/`) so that the `Dockerfile` can copy `package*.json`, the source tree, and the `docker/nginx.conf` template.

### Run locally with Docker

```bash
docker run --rm -p 3000:80 heart-ui:latest
```

Open `http://localhost:3000`. By default the container will try to proxy API calls to `http://heart-api-svc:8000` — a Kubernetes DNS name that does not resolve outside the cluster. Override it for local testing:

```bash
docker run --rm -p 3000:80 \
  -e HEART_API_URL=http://host.docker.internal:8000 \
  heart-ui:latest
```

`host.docker.internal` resolves to your Mac/Windows host from inside a container, so this lets the containerised nginx reach a locally running API.

On Linux (where `host.docker.internal` is not available by default):

```bash
docker run --rm -p 3000:80 \
  --add-host=host.docker.internal:host-gateway \
  -e HEART_API_URL=http://host.docker.internal:8000 \
  heart-ui:latest
```

### Run against a local API instance

Full end-to-end test with both services in Docker (no Kubernetes required):

```bash
# Start the API (from the project/ directory)
docker build -f docker/Dockerfile -t heart-api:latest .
docker run -d --name heart-api -p 8000:8000 heart-api:latest

# Start the UI, pointing at the API container
docker run --rm -p 3000:80 \
  --link heart-api \
  -e HEART_API_URL=http://heart-api:8000 \
  heart-ui:latest

# Open http://localhost:3000
```

### How the API URL is injected

The nginx config is a template (`docker/nginx.conf`) with `${HEART_API_URL}` as a placeholder. When the container starts, the Docker `CMD` runs:

```sh
envsubst '${HEART_API_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf
nginx -g 'daemon off;'
```

This writes the real URL into the nginx config before nginx starts. The default value (`http://heart-api-svc:8000`) is set in the `Dockerfile` as `ENV HEART_API_URL` so it works out-of-the-box in Kubernetes without any extra configuration.

---

## CI/CD Pipeline

The UI has its own Jenkins pipelines on the same Jenkins instance as the API. The two pipelines are independent — a code change in the UI repository triggers only the UI pipeline.

### CI pipeline (`Jenkinsfile`)

Triggers automatically on every push to `main`. Stages:

```
Checkout → Build Docker Image → Push to Registry → Deploy to Non-Prod
```

1. **Build Docker Image**: runs the two-stage Docker build (Node.js compile → nginx runtime) and tags the image with the git commit SHA and `latest`.
2. **Push to Registry**: authenticates to the container registry using a GCP service account key stored as a Jenkins credential and pushes both tags.
3. **Deploy to Non-Prod**: authenticates to Kubernetes, updates the non-prod Deployment's image, and waits for the rollout to complete.

Jenkins credentials used:

| Credential ID | Type | Purpose |
|---|---|---|
| `gcp-service-account-key` | Secret file | Authenticate to container registry and Kubernetes |

### Prod pipeline (`Jenkinsfile.prod`)

Triggered **manually** with two parameters:

| Parameter | Description |
|---|---|
| `IMAGE_TAG` | The git commit SHA from a passing CI build |
| `SLOT` | `blue` or `green` — which deployment to update |

Stages:

```
Deploy Slot → Smoke Test → ── Manual approval gate ──► Patch Service Selector
```

The manual gate pauses the pipeline so an operator can verify the new slot is serving traffic correctly. Once approved, the prod `Service` selector is patched to point at the new slot — completing the **blue/green cutover** with zero downtime.

**Roll back**: re-run the prod pipeline pointing `IMAGE_TAG` at the previous image and the same `SLOT`, or manually patch the Service selector back to the old slot:

```bash
kubectl patch service heart-ui-svc -n prod \
  --type=json \
  -p='[{"op":"replace","path":"/spec/selector/slot","value":"blue"}]'
```

---

## Kubernetes Manifests

| File | Purpose |
|---|---|
| `k8s/deployment-nonprod.yaml` | Single Deployment with 1 replica + LoadBalancer Service in the `nonprod` namespace. The `HEART_API_URL` env var is set to the cluster-internal API service URL. |
| `k8s/deployment-prod.yaml` | Two Deployments (`slot: blue` and `slot: green`), each with 2 replicas, plus a Service whose `selector.slot` is patched to point at the live slot during cutover. |

The `HEART_API_URL` env var in both manifests points to `http://heart-api-svc:8000` — the Kubernetes DNS name of the API Service in the same namespace. Traffic never leaves the cluster for the UI→API call.

---

## nginx Configuration

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # Forward API paths to the backend service
    location ~ ^/(predict|health|ready|metrics) {
        proxy_pass ${HEART_API_URL};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # React Router — always serve index.html for unknown paths
    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
}
```

`${HEART_API_URL}` is replaced by `envsubst` at container startup. The `try_files` directive is essential for React Router — without it, refreshing any non-root route would return a 404 from nginx.
