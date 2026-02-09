# 1) 把 API key 丟進 launchd 環境
launchctl setenv MT_API_KEY "你的APIKey"

# 2) 建立 plist（不含 API key, need to create .plist first）
# Create file: eg. touch ~/Library/LaunchAgents/com.ai.vesselposition.plist
cat <<'EOF' > ~/Library/LaunchAgents/com.ai.vesselposition.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ai.vesselposition</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/vesselPosition.py</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/jacob/Desktop/AI-System-Ship</string>

  <key>StartInterval</key>
  <integer>60</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/launchd.err.log</string>
</dict>
</plist>
EOF

# 3) 載入並啟動
launchctl load -w ~/Library/LaunchAgents/com.ai.vesselposition.plist

# End
# launchctl unload -w ~/Library/LaunchAgents/com.ai.vesselposition.plist

# Check if running:
# launchctl list | grep com.ai.vesselposition

# Check logs:
# tail -n 50 /Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/launchd.out.log
# tail -n 50 /Users/jacob/Desktop/AI-System-Ship/trajectoryPrediction/marineTraffic/launchd.err.log
