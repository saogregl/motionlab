@echo off
setlocal

:: Find vcvarsall.bat — try BuildTools first, then Community
set "VCVARSALL="
for %%d in (
    "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
    "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat"
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat"
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat"
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat"
) do (
    if exist %%d (
        set "VCVARSALL=%%~d"
        goto :found
    )
)
echo ERROR: Could not find vcvarsall.bat
echo Install Visual Studio Build Tools or set up a Developer Command Prompt
exit /b 1

:found
echo Using: %VCVARSALL%
call "%VCVARSALL%" x64 > nul 2>&1

:: Navigate to engine directory (script location)
cd /d "%~dp0\.."

:: Configure if build directory doesn't exist
if not exist "build\msvc-dev\build.ninja" (
    echo Configuring CMake...
    cmake --preset msvc-dev
    if errorlevel 1 exit /b 1
)

:: Build
echo Building...
cmake --build build/msvc-dev
if errorlevel 1 exit /b 1

echo Build complete.
