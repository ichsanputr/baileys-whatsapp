@echo off
echo Cleaning WhatsApp authentication files...
if exist auth_info (
    rmdir /s /q auth_info
    echo Auth files deleted successfully!
) else (
    echo No auth files found.
)
echo.
echo Please restart the server with: npm start
echo Then visit: http://localhost:5000/qr/display
pause
