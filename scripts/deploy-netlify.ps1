param(
    [string]$SiteId = "",
    [switch]$Prod
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$resolvedSiteId = if ($SiteId) { $SiteId } elseif ($env:NETLIFY_SITE_ID) { $env:NETLIFY_SITE_ID } else { "6af3e075-821c-4952-a9b8-465eba01e238" }
$authToken = $env:NETLIFY_AUTH_TOKEN

if (-not $authToken) {
    throw "Falta NETLIFY_AUTH_TOKEN. Configuralo en la terminal antes de ejecutar el deploy."
}

Write-Host "Building project..."
npm run build

if (-not (Test-Path ".\\dist")) {
    throw "No se encontro la carpeta dist despues del build."
}

$deployTempDir = Join-Path $projectRoot ".netlify-deploy"
$zipPath = Join-Path $deployTempDir "site.zip"

if (Test-Path $deployTempDir) {
    Remove-Item $deployTempDir -Recurse -Force
}

New-Item -ItemType Directory -Path $deployTempDir | Out-Null
Compress-Archive -Path ".\\dist\\*" -DestinationPath $zipPath -Force

$headers = @{
    Authorization = "Bearer $authToken"
    ContentType = "application/zip"
}

$query = if ($Prod) { "" } else { "?draft=true" }
$deployUrl = "https://api.netlify.com/api/v1/sites/$resolvedSiteId/deploys$query"

Write-Host "Uploading deploy to Netlify site '$resolvedSiteId'..."
$response = Invoke-RestMethod `
    -Method Post `
    -Uri $deployUrl `
    -Headers $headers `
    -InFile $zipPath `
    -ContentType "application/zip"

$deployId = if ($response.id) { $response.id } else { "unknown" }
$deployState = if ($response.state) { $response.state } else { "unknown" }
$deployUrlResult = if ($response.deploy_url) { $response.deploy_url } elseif ($response.url) { $response.url } else { "" }

Write-Host "Deploy creado."
Write-Host "ID: $deployId"
Write-Host "Estado: $deployState"

if ($deployUrlResult) {
    Write-Host "URL: $deployUrlResult"
}
