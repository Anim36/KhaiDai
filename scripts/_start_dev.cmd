@echo off
rem scripts/_start_dev.cmd — boot the dev server.
rem DATABASE_URL is read from .env (or the inherited shell env);
rem it is never hardcoded in this script.
cd /d D:\KhaiDai\khaidai
if not defined DATABASE_URL (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
  )
)
npx next dev -p 3000
