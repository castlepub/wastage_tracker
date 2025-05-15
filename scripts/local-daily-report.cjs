name: Sync Entries from Railway

on:
  schedule:
    - cron: '55 5 * * *'  # Run at 5:55 AM UTC daily (just before the report)
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync-entries:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: write
    
    steps:
    - uses: actions/checkout@v3
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Create data directory
      run: mkdir -p data
        
    - name: Download entries from Railway
      env:
        APP_URL: ${{ vars.APP_URL || 'https://wastagetracker-production.up.railway.app' }}
        EXPORT_TOKEN: ${{ secrets.EXPORT_TOKEN }}
      run: |
        echo "Downloading entries from Railway..."
        echo "Using URL: $APP_URL/api/export-entries"
        
        # First test the endpoint
        echo "Testing endpoint..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $EXPORT_TOKEN" "$APP_URL/api/export-entries")
        echo "Initial response code: $HTTP_CODE"
        
        if [ "$HTTP_CODE" = "401" ]; then
          echo "❌ Authentication failed. Please check EXPORT_TOKEN"
          exit 1
        fi
        
        if [ "$HTTP_CODE" != "200" ]; then
          echo "❌ Endpoint returned $HTTP_CODE"
          # Try without token to see if endpoint exists
          TEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/export-entries")
          echo "Test without token: $TEST_CODE"
          exit 1
        fi
        
        # Download the actual data
        echo "Downloading data..."
        RESPONSE=$(curl -s -H "Authorization: Bearer $EXPORT_TOKEN" "$APP_URL/api/export-entries")
        echo "$RESPONSE" > data/entries.json
        
        # Validate JSON and entry count
        echo "Validating downloaded data..."
        if ! jq empty data/entries.json 2>/dev/null; then
          echo "❌ Downloaded file is not valid JSON"
          echo "Raw response:"
          cat data/entries.json
          exit 1
        fi
        
        COUNT=$(jq length data/entries.json)
        echo "✅ Successfully downloaded $COUNT entries"
        
        # Show sample of data
        echo "First entry:"
        jq '.[0]' data/entries.json

    - name: Commit changes
      run: |
        git config --global user.name "github-actions[bot]"
        git config --global user.email "github-actions[bot]@users.noreply.github.com"
        git add data/entries.json
        git commit -m "Update entries.json [skip ci]" || echo "No changes to commit"
        git push || echo "No changes to push" 
