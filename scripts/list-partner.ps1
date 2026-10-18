Get-ChildItem 'D:\KhaiDai\khaidai\app\api\restaurants' -Recurse -Filter *.ts | Select-Object FullName
"----"
Get-ChildItem 'D:\KhaiDai\khaidai\components\partner' -Recurse -Filter *.tsx | Select-Object FullName
"----"
Get-ChildItem 'D:\KhaiDai\khaidai\components\restaurants' -Recurse -Filter *.tsx | Select-Object FullName | Select-Object -First 20
