@echo off
IF NOT EXIST .git (
    echo WARNING: This is not a git repository! 1>&2
    echo {"hash": ""} > src/git-version.json
    exit /b 0
)

git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo WARNING: git is not installed! 1>&2
    echo {"hash": ""} > src/git-version.json
    exit /b 0
)

for /f "delims=" %%v in ('git --version') do set v=%%v
if "%v:~0,11%" == "git version 2" (
    node grab-git-info
) else (
    echo {"hash": ""} > src/git-version.json
)