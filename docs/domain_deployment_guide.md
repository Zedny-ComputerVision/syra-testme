# Complete Deployment Guide for `testme.zedny.ai`

This guide covers the exact steps from beginning to end to point your domain to the server, configure SSL (HTTPS), and bring up the SYRA LMS application.

---

## 1. Configure DNS Records (At your Domain Registrar)

You must tell the internet that `testme.zedny.ai` points to your VM's IP address (`167.172.169.79`).

1. Log into your domain registrar (e.g., GoDaddy, Namecheap, Cloudflare, Route53).
2. Go to the **DNS Management** for `zedny.ai`.
3. Add a **new A Record**:
   - **Type**: `A`
   - **Name**: `testme`
   - **Value**: `167.172.169.79`
   - **TTL**: `300` or `Auto`.

---

## 2. Server Preparation (SSH)

SSH into your server:
```bash
ssh root@167.172.169.79
```

### Install Certbot
```bash
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### Stop existing services to free port 80/443
```bash
cd /opt/syra-testme
docker compose down
```

---

## 3. SSL Configuration (Certbot)

### Issue the SSL Certificate
```bash
sudo certbot certonly --standalone -d testme.zedny.ai
```

### Download missing Nginx SSL configurations
Since we used `--standalone`, we must manually add these common SSL files used in Nginx:
```bash
sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > /etc/letsencrypt/options-ssl-nginx.conf
sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > /etc/letsencrypt/ssl-dhparams.pem
```

---

## 4. Host Nginx Setup

### Install Nginx
```bash
sudo apt update && sudo apt install -y nginx
```

### Create the Domain Config
```bash
nano /etc/nginx/sites-available/testme.zedny.ai
```

Paste the following:
```nginx
server {
    listen 80;
    server_name testme.zedny.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name testme.zedny.ai;

    ssl_certificate /etc/letsencrypt/live/testme.zedny.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/testme.zedny.ai/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 512M;

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 30s;
    }

    # FastAPI Docs
    location /docs {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /redoc {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend Proxy
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Activate & Test Nginx
```bash
sudo ln -s /etc/nginx/sites-available/testme.zedny.ai /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 5. Docker Port Configuration

The host Nginx listens on ports 80/443 and proxies internally to the Docker containers. The `docker-compose.yml` must expose the containers on different ports:

### Backend (Port 8000) — bound to localhost only
```yaml
backend:
  ports:
    - "127.0.0.1:8000:8000"
```

### Frontend (Port 8080) — bound to localhost only
```yaml
frontend:
  ports:
    - "8080:80"
```

---

## 6. Push & Deploy

Once codes are pushed to `main`, the GitHub Actions workflow automatically:
1. SSHs into the VM
2. Pulls the latest code via `git fetch` + `git reset --hard`
3. Runs `scripts/deploy-linux.sh` which rebuilds Docker containers and verifies health

The workflow sets these environment variables for production:
```bash
export SYRA_FRONTEND_URL="https://testme.zedny.ai"
export SYRA_BACKEND_URL="https://testme.zedny.ai/api"
```

---

## 7. Useful URLs

| URL | Description |
|-----|-------------|
| `https://testme.zedny.ai` | Frontend (React SPA) |
| `https://testme.zedny.ai/api/health` | Backend health check |
| `https://testme.zedny.ai/docs` | Swagger API docs |
| `https://testme.zedny.ai/redoc` | ReDoc API docs |
