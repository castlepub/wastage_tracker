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
        
        # Function to download entries with retries
        download_entries() {
          local max_attempts=3
          local attempt=1
          local wait_time=10
          
          while [ $attempt -le $max_attempts ]; do
            echo "Attempt $attempt of $max_attempts..."
            
            # Test endpoint first
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $EXPORT_TOKEN" "$APP_URL/api/export-entries")
            echo "Response code: $HTTP_CODE"
            
            if [ "$HTTP_CODE" = "200" ]; then
              # Download the actual data
              echo "Downloading data..."
              RESPONSE=$(curl -s -H "Authorization: Bearer $EXPORT_TOKEN" "$APP_URL/api/export-entries")
              echo "$RESPONSE" > data/entries.json
              
              # Validate JSON
              if jq empty data/entries.json 2>/dev/null; then
                COUNT=$(jq length data/entries.json)
                if [ "$COUNT" -gt 0 ]; then
                  echo "✅ Successfully downloaded $COUNT entries"
                  return 0
                else
                  echo "⚠️ Got 0 entries, will retry..."
                fi
              else
                echo "⚠️ Invalid JSON response, will retry..."
              fi
            else
              echo "⚠️ Endpoint returned $HTTP_CODE, will retry..."
            fi
            
            if [ $attempt -lt $max_attempts ]; then
              echo "Waiting ${wait_time} seconds before next attempt..."
              sleep $wait_time
              wait_time=$((wait_time * 2))
            fi
            
            attempt=$((attempt + 1))
          done
          
          return 1
        }
        
        # Try to download entries
        if download_entries; then
          echo "Download successful"
          echo "First entry:"
          jq '.[0]' data/entries.json
        else
          echo "❌ Failed to download entries after multiple attempts"
          exit 1
        fi

    - name: Commit changes
      run: |
        git config --global user.name "github-actions[bot]"
        git config --global user.email "github-actions[bot]@users.noreply.github.com"
        git add data/entries.json
        git commit -m "Update entries.json [skip ci]" || echo "No changes to commit"
        git push || echo "No changes to push" 
