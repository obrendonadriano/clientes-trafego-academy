# Deploy do dashboard na VPS

## 1. Preparar servidor

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Publicar projeto

```bash
sudo mkdir -p /var/www/trafegoacademy-dashboard
sudo chown -R $USER:$USER /var/www/trafegoacademy-dashboard
cd /var/www/trafegoacademy-dashboard
git clone https://github.com/obrendonadriano/clientes-trafego-academy.git .
npm install
```

## 3. Variáveis de ambiente

Crie `.env.production` com base em `.env.example`.

Campos principais:

- `NEXT_PUBLIC_APP_URL=https://dashboard.trafegoacademy.online`
- `NEXT_PUBLIC_APP_DOMAIN=dashboard.trafegoacademy.online`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`

## 4. Build e start

```bash
cd /var/www/trafegoacademy-dashboard
cp .env.production .env.local
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 5. Nginx

Copie `deploy/nginx-dashboard.conf` para:

```bash
sudo cp deploy/nginx-dashboard.conf /etc/nginx/sites-available/trafegoacademy-dashboard
sudo ln -s /etc/nginx/sites-available/trafegoacademy-dashboard /etc/nginx/sites-enabled/trafegoacademy-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.trafegoacademy.online
```

## 7. Cron de 15 minutos

```bash
crontab -e
```

Adicione:

```bash
*/15 * * * * APP_URL=https://dashboard.trafegoacademy.online CRON_SECRET=seu_segredo /var/www/trafegoacademy-dashboard/deploy/meta-sync.sh >> /var/log/trafegoacademy-meta-sync.log 2>&1
```

## 8. Atualizações futuras

```bash
cd /var/www/trafegoacademy-dashboard
git pull origin main
cp .env.production .env.local
npm install
npm run build
pm2 restart trafegoacademy-dashboard
```
