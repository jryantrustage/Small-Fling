   'powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    [Parameter(Mandatory=$true)]
    [string]$Include
}

$files = Get-ChildItem -Path $Path -File -Recurse -Include $Include
foreach($file in $files) {
   $fileName = $file.name
    Write-Host "===: $fileName
    Get-Content $file.FullName
    Write-Host "'n"
}