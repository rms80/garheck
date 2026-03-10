# Arena Brawl - Developer Notes

## Restarting the dev server (Windows)

Run `restart-dev.bat` in the project root to kill any running node processes and restart the server in solo mode. Use this instead of manually running taskkill + npm run dev.

```
./restart-dev.bat
```

This script is safe to run without confirmation — it only kills node.exe processes and restarts the dev server.
