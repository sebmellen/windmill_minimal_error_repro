#!/bin/bash

# Define the file path
file_path="$HOME/.deno/bin/wmill"

# Ensure the file exists
if [[ ! -f "$file_path" ]]; then
    echo "File does not exist: $file_path"
    exit 1
fi

# Extract the existing semver version
version=$(grep -oP 'wmill@v\K([0-9]+\.[0-9]+\.[0-9]+)' "$file_path")

# Check if a version was found
if [[ -z "$version" ]]; then
    echo "No version found, using a default version."
    version="1.0.0"  # Set default version or handle the error as needed
fi

# Create the new content with the existing or default version
new_content="#!/bin/sh
# generated by deno install
exec deno run --unsafely-ignore-certificate-errors --allow-read --allow-write --allow-net --allow-env --no-config 'https://deno.land/x/wmill@v$version/main.ts' \"\$@\""

# Write the new content to the file
echo "$new_content" > "$file_path"

echo "File has been updated with version $version."
