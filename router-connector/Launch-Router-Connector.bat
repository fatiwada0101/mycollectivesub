@echo off
title MyCollectiveSub Plug & Play Router Connector
cd /d "%~dp0\.."
echo Starting MyCollectiveSub Local Router Connector on http://127.0.0.1:4782 ...
start "" http://127.0.0.1:4782
node router-connector/server.mjs
pause
