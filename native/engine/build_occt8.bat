@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
cd /d C:\Dev\motionlab\native\engine
cmake --preset msvc-dev > build\occt8_build.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> build\occt8_build.log
