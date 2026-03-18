@echo off
setlocal

:: Find vcvarsall.bat
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
exit /b 1

:found
call "%VCVARSALL%" x64 > nul 2>&1

cd /d "%~dp0\.."

:: Build first (tests need latest code)
cmake --build build/msvc-dev
if errorlevel 1 exit /b 1

:: Run tests
echo Running tests...
ctest --preset msvc-dev
