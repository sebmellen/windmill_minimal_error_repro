#!/bin/bash

set -e

# Check that mkcert is installed
if ! command -v mkcert &> /dev/null
then
    echo "mkcert could not be found, please run just install-deps..."
fi

mkdir -p ./.temp

# Create certificates
mkcert -cert-file "./.temp/cert.pem" -key-file "./.temp/key.pem" windmill.local.cerebrum.com

# Print success message
echo "Certificates created and placed in ./.temp directory"
