# GLPI MCP Server — Configuration Guide

## Prerequisites

- Node.js 18+
- GLPI instance with REST API enabled
- GLPI App Token and User Token (or username/password)

---

## Build

```bash
npm install
npm run build
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GLPI_BASE_URL` | Yes | Base URL of the GLPI REST API (e.g. `http://localhost:8080/api.php/v1`) |
| `GLPI_APP_TOKEN` | Yes | Application token from GLPI (API > Application tokens) |
| `GLPI_USER_TOKEN` | No* | User API token (preferred auth method) |
| `GLPI_USERNAME` | No* | Username (alternative to user token) |
| `GLPI_PASSWORD` | No* | Password (alternative to user token) |

\* At least one auth method (`GLPI_USER_TOKEN` or `GLPI_USERNAME`+`GLPI_PASSWORD`) must be provided at session init time.

---

## Option 1 — Local stdio (Claude Desktop / Windsurf / VS Code)

This is the standard MCP transport. The host application spawns the server process and communicates over stdin/stdout.

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "glpi": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-glpi/dist/index.js"],
      "env": {
        "GLPI_BASE_URL": "http://your-glpi-host/api.php/v1",
        "GLPI_APP_TOKEN": "your_app_token",
        "GLPI_USER_TOKEN": "your_user_token"
      }
    }
  }
}
```

### Windsurf / VS Code (`~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "glpi": {
      "type": "stdio",
      "command": "node",
      "args": ["/home/orw33ll84/mcp-server-glpi/dist/index.js"],
      "env": {
        "GLPI_BASE_URL": "http://localhost:8080/api.php/v1",
        "GLPI_APP_TOKEN": "your_app_token",
        "GLPI_USER_TOKEN": "your_user_token"
      }
    }
  }
}
```

### Using `npx` (without cloning)

```json
{
  "mcpServers": {
    "glpi": {
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-server-glpi"],
      "env": {
        "GLPI_BASE_URL": "http://your-glpi-host/api.php/v1",
        "GLPI_APP_TOKEN": "your_app_token",
        "GLPI_USER_TOKEN": "your_user_token"
      }
    }
  }
}
```

### Using username/password instead of user token

```json
"env": {
  "GLPI_BASE_URL": "http://your-glpi-host/api.php/v1",
  "GLPI_APP_TOKEN": "your_app_token",
  "GLPI_USERNAME": "glpi_admin",
  "GLPI_PASSWORD": "your_password"
}
```

---

## Option 2 — Remote HTTP/SSE server (shared team access)

To expose the MCP server over HTTP so multiple clients or CI pipelines can connect, wrap it with [`@modelcontextprotocol/server-sse`](https://github.com/modelcontextprotocol/typescript-sdk) or use a proxy like [`mcp-proxy`](https://github.com/sparfenyuk/mcp-proxy).

### Using mcp-proxy

```bash
npm install -g mcp-proxy
```

```bash
GLPI_BASE_URL=http://your-glpi-host/api.php/v1 \
GLPI_APP_TOKEN=your_app_token \
GLPI_USER_TOKEN=your_user_token \
mcp-proxy --port 3100 -- node /path/to/mcp-server-glpi/dist/index.js
```

The proxy exposes:
- `http://localhost:3100/sse` — SSE stream (MCP over HTTP)
- `http://localhost:3100/message` — POST endpoint for client messages

### Client config for HTTP/SSE

```json
{
  "mcpServers": {
    "glpi": {
      "type": "sse",
      "url": "http://your-server:3100/sse"
    }
  }
}
```

### Docker deployment (HTTP mode)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
EXPOSE 3100
CMD ["sh", "-c", "npx mcp-proxy --port 3100 -- node dist/index.js"]
```

```bash
docker build -t mcp-server-glpi .
docker run -d \
  -p 3100:3100 \
  -e GLPI_BASE_URL=http://your-glpi-host/api.php/v1 \
  -e GLPI_APP_TOKEN=your_app_token \
  -e GLPI_USER_TOKEN=your_user_token \
  mcp-server-glpi
```

---

## How to get GLPI tokens

1. **App Token** — GLPI admin panel > Setup > General > API > Add application token
2. **User Token** — GLPI user profile > Settings > Remote access keys > API token (regenerate if empty)

Make sure **Enable REST API** is checked in Setup > General > API.

---

## Verify the connection

Run the server manually to confirm it starts without errors:

```bash
GLPI_BASE_URL=http://localhost:8080/api.php/v1 \
GLPI_APP_TOKEN=your_app_token \
GLPI_USER_TOKEN=your_user_token \
node dist/index.js
```

Expected output: the process blocks waiting for MCP messages on stdin (no error = success).
