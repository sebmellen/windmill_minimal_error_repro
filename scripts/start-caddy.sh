#!/bin/sh

# Fetch environment variable
SERVICE_URL="${SERVICE_URL:-localhost}"  # Default fallback if not set

# Create the Caddyfile with dynamic content based on CADDY_SSL environment variable
if [ -f /etc/caddy/cert.pem ] && [ -f /etc/caddy/key.pem ]; then
echo "SSL certificate and key found. Setting up HTTPS..."
cat <<EOF > /etc/caddy/Caddyfile
windmill.local.cerebrum.com {
    reverse_proxy $SERVICE_URL
    tls /etc/caddy/cert.pem /etc/caddy/key.pem
    log {
        level ERROR  # Set logging level to ERROR to hide warnings
    }
}
:80 {
        reverse_proxy $SERVICE_URL
}
EOF
else
echo "No SSL certificate and key found. Setting up HTTP..."
cat <<EOF > /etc/caddy/Caddyfile
:80 {
    reverse_proxy $SERVICE_URL
}
EOF
fi

# Start Caddy
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
