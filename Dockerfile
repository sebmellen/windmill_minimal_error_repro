FROM ghcr.io/windmill-labs/windmill-ee:1.381.0

# Run this to avoid Hash Sum mismatch errors on Mac during the playwright install - see https://stackoverflow.com/q/67732260
RUN echo "Acquire::http::Pipeline-Depth 0;" > /etc/apt/apt.conf.d/99custom && \
  echo "Acquire::http::No-Cache true;" >> /etc/apt/apt.conf.d/99custom && \
  echo "Acquire::BrokenProxy    true;" >> /etc/apt/apt.conf.d/99custom

RUN apt-get update && apt-get upgrade -y

# Install python playwright
RUN pip install playwright
RUN playwright install
RUN playwright install-deps

# Install chromium in base
RUN apt-get install -y chromium

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
  apt-get install -y nodejs

RUN npm install -g playwright
# Only install chromium, not all browsers
RUN npx playwright install --with-deps chromium

CMD ["windmill"]
