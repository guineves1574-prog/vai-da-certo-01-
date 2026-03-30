$log = "C:\Users\Guilherme Neves\Downloads\crypto-trading-bot-certo-main\start-server.log"
"start $(Get-Date -Format o)" | Set-Content $log
Set-Location "C:\Users\Guilherme Neves\Downloads\crypto-trading-bot-certo-main"
"cwd $(Get-Location)" | Add-Content $log
& "C:\Program Files\nodejs\node.exe" "dist\index.js" *>> $log
