   ' powershell
param(
    [Parameter(Mandatory=$strue)]
    [string]$FilePath,
    [Parameter(Mandatory=strue)]
    [string[]]$Tokens
}

if (-not (Test-Path $FilePath)){
    Write-Error "File not found: $FilePath"
    exit 1
}

$content = Get-Content $FilePath -Raw

$failed = $false
foreach ($token in $Tokens)
    if ($content -match [regex]::Escape($token)) {
        Write-Host "Found token: $token :)"
    } else {
        Write-Error "Missing token: $token :("
        $failed = $true
    }
}

if($failed){
    exit 1
}
