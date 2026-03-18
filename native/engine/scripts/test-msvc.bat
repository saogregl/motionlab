@echo off
setlocal

:: Find vcvarsall.bat using vswhere (ships with VS 2017+ installer)
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
    echo ERROR: vswhere.exe not found. Install Visual Studio Build Tools.
    exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    set "VS_PATH=%%i"
)

if not defined VS_PATH (
    echo ERROR: Could not find a Visual Studio installation with C++ tools.
    exit /b 1
)

set "VCVARSALL=%VS_PATH%\VC\Auxiliary\Build\vcvarsall.bat"
if not exist "%VCVARSALL%" (
    echo ERROR: vcvarsall.bat not found at %VCVARSALL%
    exit /b 1
)

call "%VCVARSALL%" x64 > nul 2>&1

cd /d "%~dp0\.."

:: Build first (tests need latest code)
cmake --build build/msvc-dev
if errorlevel 1 exit /b 1

:: Run tests
echo Running tests...
ctest --preset msvc-dev
