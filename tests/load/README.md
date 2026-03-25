# Run k6 Load Tests — Quick Reference

## Prerequisites

Install k6 on your machine:

```bash
# macOS
brew install k6

# Windows
choco install k6
# or
winget install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Running Tests

From the project root:

```bash
# Smoke Test — verify the system works (30s, 2 VUs)
k6 run -e SCENARIO=smoke tests/load/loadtest.js

# Baseline Test — normal performance (2min, 5 VUs)
k6 run -e SCENARIO=baseline tests/load/loadtest.js

# Load Test — expected production traffic (5min, 20 VUs)
k6 run -e SCENARIO=load tests/load/loadtest.js

# Stress Test — beyond limits (5min, 50 VUs)
k6 run -e SCENARIO=stress tests/load/loadtest.js

# Spike Test — sudden traffic burst (3min, 40 VUs)
k6 run -e SCENARIO=spike tests/load/loadtest.js
```

## Custom Configuration

Override defaults via environment variables:

```bash
k6 run \
  -e SCENARIO=load \
  -e BASE_URL=https://testme.zedny.ai \
  -e TEST_EMAIL=admin@syra.local \
  -e TEST_PASS=admin123 \
  tests/load/loadtest.js
```

## Output Formats

```bash
# JSON output for post-analysis
k6 run -e SCENARIO=load --out json=results.json tests/load/loadtest.js

# CSV output
k6 run -e SCENARIO=load --out csv=results.csv tests/load/loadtest.js
```
