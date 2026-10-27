#!/usr/bin/env bash
set -e

# ==============================================================================
# DMD World — Hostinger Deployment Script
# Run this script inside public_html (e.g. ~/public_html or ~/websites/xxx/public_html)
# ==============================================================================

echo "=================================================="
echo "  Deploying DMD World to Hostinger..."
echo "=================================================="

ROOT_DIR="$(pwd)"

# 1. Pull latest changes if this is a git clone
if [ -d ".git" ]; then
    echo ">> Fetching and pulling latest code from git..."
    git pull origin laravel-migration
fi

# 2. Setup backend .env if not exists
if [ ! -f "backend/.env" ]; then
    echo ">> Creating backend/.env from .env.example..."
    cp backend/.env.example backend/.env
    echo ""
    echo "⚠️  IMPORTANT: Please update backend/.env with your MySQL credentials:"
    echo "    DB_DATABASE=your_hostinger_database"
    echo "    DB_USERNAME=your_hostinger_user"
    echo "    DB_PASSWORD=your_hostinger_password"
    echo "    APP_URL=https://yourdomain.com"
    echo "    FRONTEND_URL=https://yourdomain.com"
    echo "    ADMIN_URL=https://yourdomain.com/admin"
    echo "    SANCTUM_STATEFUL_DOMAINS=yourdomain.com"
    echo ""
    cd backend && php artisan key:generate && cd "$ROOT_DIR"
fi

# 3. Publish Storefront (dist -> public_html)
echo ">> Publishing Storefront assets..."
mkdir -p "$ROOT_DIR/assets"
cp -rf dist/* "$ROOT_DIR/"

# 4. Publish Admin Panel (admin/dist -> public_html/admin)
echo ">> Publishing Admin Panel..."
mkdir -p "$ROOT_DIR/admin"
cp -rf admin/dist/* "$ROOT_DIR/admin/"

# 5. Configure Hostinger Apache .htaccess and API entry point
echo ">> Configuring .htaccess and api.php..."
cp -f deploy/hostinger/.htaccess "$ROOT_DIR/.htaccess"
cp -f api.php "$ROOT_DIR/api.php"

# 6. Install / update PHP dependencies
echo ">> Installing backend composer dependencies..."
cd "$ROOT_DIR/backend"
composer install --no-dev --optimize-autoloader --no-interaction

# 7. Setup storage link & permissions
echo ">> Setting up storage directories and symlink..."
mkdir -p storage/app/public storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chmod -R 775 storage bootstrap/cache

cd "$ROOT_DIR"
rm -f storage
ln -sf backend/storage/app/public storage

# 8. Run migrations & cache Laravel configuration
echo ">> Running database migrations..."
cd "$ROOT_DIR/backend"
php artisan migrate --force

echo ">> Caching configuration and routes for production..."
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

echo ""
echo "=================================================="
echo "  ✅ Deployment completed successfully!"
echo "  Storefront: https://yourdomain.com/"
echo "  Admin Panel: https://yourdomain.com/admin/"
echo "  API Health: https://yourdomain.com/api/v1/health"
echo "=================================================="
