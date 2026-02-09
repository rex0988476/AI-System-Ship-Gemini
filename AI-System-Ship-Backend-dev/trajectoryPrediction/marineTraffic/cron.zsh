crontab -e

# Add the following lines to run every minute.
# Do NOT hardcode secrets in repo. Set MT_API_KEY in your shell profile:
#   export MT_API_KEY="your_api_key"
# Cron typically uses a minimal environment, so pass MT_API_KEY inline.
* * * * * MT_API_KEY="$MT_API_KEY" /usr/bin/python3 /Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/vesselPosition.py >> /Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/cron.out.log 2>> /Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/cron.err.log

# Check if running:
# crontab -l -> shows the current cron jobs
# pgrep -x cron -> shows if cron is running
