#!/bin/bash

cd ./f || exit

# Find all directories ending with .dir within ./f
find . -type d -name "*tmpgenlockfiledotflow" | while read dir
do
    echo "Processing directory: $dir"
    
    # Find and rename .script.lock files to .inline_script.lock
    find "$dir" -type f -name "*.script.lock" | while read filename
    do
        mv "$filename" "${filename%.script.lock}.inline_script.lock"
        echo "Renamed $filename to ${filename%.script.lock}.inline_script.lock"
    done
    
    # Find and delete .script.yaml files
    find "$dir" -type f -name "*.script.yaml" -exec rm {} \;
    echo "Deleted .script.yaml files in $dir"
    
    # Replace text "tmpdirending" with "" in all files within the directory
    # find "$dir" -type f -exec sed -i 's/tmpdirending//g' {} \;
    # echo "Replaced 'tmpdirending' in files within $dir"
done