#!/bin/bash
# Usage: ./add-host.sh [subdomain]
# Example: ./add-host.sh windmill

set -e

HOSTS_FILE="/etc/hosts"
BASE_DOMAIN="local.cerebrum.com"
IP="127.0.0.1"

if [ -z "$1" ]; then
    echo "Please provide a subdomain."
    exit 1
fi

SUBDOMAIN="$1"
HOST_ENTRY="$IP $SUBDOMAIN.$BASE_DOMAIN"

if ! grep -q " $SUBDOMAIN.$BASE_DOMAIN" "$HOSTS_FILE"; then
    echo "$HOST_ENTRY" | sudo tee -a "$HOSTS_FILE" > /dev/null
    echo "Entry added for $SUBDOMAIN.$BASE_DOMAIN in $HOSTS_FILE"
else
    echo "Entry for $SUBDOMAIN.$BASE_DOMAIN already exists in $HOSTS_FILE"
fi
