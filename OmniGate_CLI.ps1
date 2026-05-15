# ===========================================================
#                OMNIGATE CLI - Version 2.5
#           Modern UI Refactor | Vidcore + *Arr
# ===========================================================

$ErrorActionPreference = "Stop"

$OmniContext = @{
    Season        = "01"
    IsMovie       = $false
    SelectedItems = @()
    Service       = "None"
}

# --- 1. CORE FUNCTIONS ---

function Invoke-OmniApi {
    param($Method, $Uri, $ApiKey, $Body = $null)
    $params = @{
        Method = $Method; Uri = $Uri; Headers = @{"X-Api-Key" = $ApiKey}; ContentType = "application/json"; TimeoutSec = 15
    }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
    try { return Invoke-RestMethod @params } catch { return $null }
}

function Get-OmniChoice {
    param($Max, $Prompt)
    [int]$val = -1
    while ($val -lt 0 -or $val -gt $Max) {
        Write-Host "`n  $Prompt " -NoNewline -ForegroundColor Cyan
        $input = Read-Host "(0-$Max)"
        if ($input -match '^\d+$') { $val = [int]$input }
    }
    return $val
}

function Get-OmniGateUrl {
    param($Item, $IsMovie, $S = "1", $E = "1")
    $id = ""
    if ($Item.imdbId -and $Item.imdbId -ne "") { $id = $Item.imdbId }
    elseif ($Item.tmdbId) { $id = $Item.tmdbId }
    elseif ($Item.tvdbId) { $id = $Item.tvdbId }
    
    if ($IsMovie) { return "https://vidcore.net/movie/$id" } 
    else { return "https://vidcore.net/tv/$id/$S/$E" }
}

# --- 2. CONFIG CHECK ---
if (!(Test-Path "config.json")) { 
    Write-Host " [!] FATAL: config.json missing!" -ForegroundColor Red
    exit 
}
$Config = Get-Content "config.json" | ConvertFrom-Json

# --- 3. UI COMPONENTS ---
function Show-Header {
    Clear-Host
    Write-Host "  ┌───────────────────────────────────────────┐" -ForegroundColor Magenta
    Write-Host "  │        OMNIGATE INTERFACE v2.6            │" -ForegroundColor Magenta
    Write-Host "  └───────────────────────────────────────────┘" -ForegroundColor Magenta
    
    $statusColor = if ($OmniContext.SelectedItems.Count -gt 0) { "Green" } else { "DarkGray" }
    $title = if ($OmniContext.SelectedItems.Count -eq 1) { $OmniContext.SelectedItems[0].title } 
              elseif ($OmniContext.SelectedItems.Count -gt 1) { "$($OmniContext.SelectedItems.Count) items selected" }
              else { "None" }
    
    $QueueCount = if (Test-Path $Config.General.CommandFile) { (Get-Content $Config.General.CommandFile | Where-Object { $_.Trim() -ne "" }).Count } else { 0 }
    $QueueColor = if ($QueueCount -gt 0) { "Yellow" } else { "DarkGray" }
    
    Write-Host "   SERVICE : " -NoNewline -ForegroundColor Gray
    Write-Host "$($OmniContext.Service)" -ForegroundColor White
    Write-Host "   TARGET  : " -NoNewline -ForegroundColor Gray
    Write-Host "[$title]" -ForegroundColor $statusColor
    Write-Host "   QUEUE   : " -NoNewline -ForegroundColor Gray
    Write-Host "$QueueCount pending" -ForegroundColor $QueueColor
    Write-Host "  " + ("─" * 43) -ForegroundColor DarkGray
}

# ============================================================
# MAIN LOOP
# ============================================================
while ($true) {
    Show-Header
    
    Write-Host "    [1] SELECT  " -NoNewline -ForegroundColor Cyan
    Write-Host "Choose Media (Sonarr/Radarr)"
    Write-Host "    [2] BRIDGE  " -NoNewline -ForegroundColor Cyan
    Write-Host "Scrape Stream Links"
    Write-Host "    [3] INGEST  " -NoNewline -ForegroundColor Cyan
    Write-Host "Download Queue"
    Write-Host "    [4] CLEAR   " -NoNewline -ForegroundColor Yellow
    Write-Host "Clear Download Queue"
    Write-Host "    [0] EXIT    " -NoNewline -ForegroundColor Red
    Write-Host "Close Session"
    Write-Host ""

    $Action = Get-OmniChoice -Max 4 -Prompt "OmniGate >>"
    if ($Action -eq 0) { break }

    # --- ACTION 1: SELECT ---
    if ($Action -eq 1) {
        Write-Host "`n  Choose Service Type:" -ForegroundColor Gray
        Write-Host "  1. Sonarr (TV)  |  2. Radarr (Movies)" -ForegroundColor Yellow
        $svcType = Get-OmniChoice -Max 2 -Prompt "Service Index"
        
        $OmniContext.Service = if ($svcType -eq 1) { "Sonarr" } else { "Radarr" }
        $OmniContext.IsMovie = ($svcType -eq 2)
        $OmniContext.SelectedItems = @()
        
        $Settings = $Config.$($OmniContext.Service)
        $Endpoint = if($OmniContext.IsMovie){"movie"}else{"series"}
        
        Write-Host "`n  Fetching Library..." -ForegroundColor DarkGray
        $Items = Invoke-OmniApi -Method "Get" -Uri "$($Settings.BaseUrl)/$Endpoint" -ApiKey $Settings.ApiKey | Sort-Object title
        
        while ($true) {
            Show-Header
            Write-Host "`n  --- CURRENT LIBRARY ---" -ForegroundColor Magenta
            Write-Host "  0. [ DONE SELECTING ]" -ForegroundColor Green
            Write-Host " 99. [ SEARCH NEW MEDIA ]" -ForegroundColor Yellow
            for ($i=0; $i -lt $Items.Count; $i++) { 
                $prefix = if ($OmniContext.SelectedItems -contains $Items[$i]) { "[x]" } else { "[ ]" }
                Write-Host ("  {0,2}. {1} {2} ({3})" -f ($i+1), $prefix, $Items[$i].title, $Items[$i].year)
            }
            
            Write-Host "`n  Current selection: $($OmniContext.SelectedItems.Count) item(s)" -ForegroundColor Cyan
            $Choice = Get-OmniChoice -Max 99 -Prompt "Toggle selection (0 to finish, 99 to search)"

            if ($Choice -eq 0) { break }
            
            if ($Choice -eq 99) {
                $SearchTerm = Read-Host "  Enter Search Title"
                $LookupResults = Invoke-OmniApi -Method "Get" -Uri "$($Settings.BaseUrl)/$Endpoint/lookup?term=$([uri]::EscapeDataString($SearchTerm))" -ApiKey $Settings.ApiKey
                
                if ($null -eq $LookupResults -or $LookupResults.Count -eq 0) {
                    Write-Host "  No results found." -ForegroundColor Red; Pause; continue
                }

                while ($true) {
                    Show-Header
                    Write-Host "`n  --- SEARCH RESULTS ---" -ForegroundColor Cyan
                    Write-Host "  0. [ BACK TO LIBRARY ]" -ForegroundColor Green
                    for ($j=0; $j -lt [Math]::Min(10, $LookupResults.Count); $j++) {
                        $Res = $LookupResults[$j]
                        $prefix = if ($OmniContext.SelectedItems -contains $Res) { "[x]" } else { "[ ]" }
                        Write-Host ("  {0,2}. {1} {2} ({3})" -f ($j+1), $prefix, $Res.title, $Res.year)
                    }
                    
                    $LIdx = Get-OmniChoice -Max 10 -Prompt "Toggle selection (0 to go back)"

                    if ($LIdx -eq 0) { break }
                    
                    $Target = $LookupResults[$LIdx-1]
                    if ($OmniContext.SelectedItems -contains $Target) {
                        $OmniContext.SelectedItems = $OmniContext.SelectedItems | Where-Object { $_ -ne $Target }
                        Write-Host "  Removed: $($Target.title)" -ForegroundColor DarkGray
                    } else {
                        $AddBody = @{
                            title = $Target.title; qualityProfileId = $Settings.QualityProfileId
                            rootFolderPath = $Settings.RootPath; monitored = $true
                            addOptions = @{ searchForMissingEpisodes = $false }
                        }
                        if ($OmniContext.IsMovie) { $AddBody.tmdbId = $Target.tmdbId; $AddBody.year = $Target.year } 
                        else { $AddBody.tvdbId = $Target.tvdbId }

                        $AddedItem = Invoke-OmniApi -Method "Post" -Uri "$($Settings.BaseUrl)/$Endpoint" -ApiKey $Settings.ApiKey -Body $AddBody
                        if ($AddedItem) { 
                            Write-Host "  ✓ Added to library: $($AddedItem.title)" -ForegroundColor Green
                            $OmniContext.SelectedItems += $AddedItem
                        } else {
                            Write-Host "  ✗ Failed to add: $($Target.title)" -ForegroundColor Red
                        }
                    }
                    Start-Sleep -Milliseconds 500
                }
                continue
            }
            
            $Item = $Items[$Choice-1]
            if ($OmniContext.SelectedItems -contains $Item) {
                $OmniContext.SelectedItems = $OmniContext.SelectedItems | Where-Object { $_ -ne $Item }
                Write-Host "  Removed: $($Item.title)" -ForegroundColor DarkGray
            } else {
                $OmniContext.SelectedItems += $Item
                Write-Host "  Added: $($Item.title)" -ForegroundColor Green
            }
            Start-Sleep -Milliseconds 500
        }
    }

   # --- ACTION 2: BRIDGE (AUTOMATED) ---
    if ($Action -eq 2) {
        if ($OmniContext.SelectedItems.Count -eq 0) { Write-Host "  ERR: No media selected!" -ForegroundColor Red; Pause; continue }
        
        $Commands = @()
        
        foreach ($SelectedItem in $OmniContext.SelectedItems) {
            $TargetUrls = @()
            if ($OmniContext.IsMovie) { 
                $TargetUrls += Get-OmniGateUrl -Item $SelectedItem -IsMovie $true 
            } else {
                $s = Read-Host "  Season for $($SelectedItem.title) (e.g. 1)"; $Season = $s.PadLeft(2, '0')
                $start = [int](Read-Host "  Ep Start"); $end = [int](Read-Host "  Ep End")
                for ($e = $start; $e -le $end; $e++) { 
                    $TargetUrls += Get-OmniGateUrl -Item $SelectedItem -IsMovie $false -S $s -E $e 
                }
            }

            Write-Host "`n  Processing: $($SelectedItem.title)" -ForegroundColor Cyan
            Write-Host "  [!] GHOST SCRAPER ACTIVE" -ForegroundColor Magenta

            foreach ($Url in $TargetUrls) {
                Write-Host "  > Sniffing: $Url ... " -NoNewline -ForegroundColor Gray
                $Result = node omni-bridge.js "$Url" | Out-String
                $Result = $Result.Trim()
                
                try {
                    $Json = $Result | ConvertFrom-Json
                    if ($Json.success -eq $true) {
                        Write-Host "FOUND" -ForegroundColor Green
                        $Metadata = @{
                            streamUrl = $Json.streamUrl
                            originalUrl = $Json.originalUrl
                            title = $SelectedItem.title
                            year = $SelectedItem.year
                            isMovie = $OmniContext.IsMovie
                            season = if ($OmniContext.IsMovie) { "" } else { $Season }
                        }
                        $Cmd = $Metadata | ConvertTo-Json -Compress
                        $Commands += $Cmd
                    } else {
                        Write-Host "FAILED" -ForegroundColor Red
                    }
                } catch {
                    Write-Host "ERROR" -ForegroundColor Red
                }
            }
        }

        if ($Commands.Count -gt 0) {
            $Commands | Out-File $Config.General.CommandFile -Append
            Write-Host "`n  ✓ $($Commands.Count) links added to Command Queue." -ForegroundColor Green
        }
        Pause
    }

    # --- ACTION 3: INGEST ---
    if ($Action -eq 3) {
        if ($OmniContext.SelectedItems.Count -eq 0) { Write-Host "  ERR: No media selected!" -ForegroundColor Red; Pause; continue }
        
        $RawLines = Get-Content $Config.General.CommandFile | Where-Object { $_.Trim() -ne "" }
        if ($RawLines.Count -eq 0) { Write-Host "  ERR: No commands in queue!" -ForegroundColor Red; Pause; continue }

        Write-Host "`n  Found $($RawLines.Count) download(s) in queue." -ForegroundColor Cyan
        $Concurrent = Read-Host "  Max concurrent downloads (1-8)"
        if ($Concurrent -notmatch '^\d+$' -or $Concurrent -lt 1 -or $Concurrent -gt 8) { $Concurrent = 3 }

        $Jobs = @()
        $Processed = New-Object System.Collections.Generic.HashSet[string]
        $ScannedFolders = New-Object System.Collections.Generic.HashSet[string]

        foreach ($Line in $RawLines) {
            try {
                $Metadata = $Line | ConvertFrom-Json
                $SafeTitle = $Metadata.title -replace '[\\\/\:\*\?\"<>\|]', ''
                $FolderName = if ($Metadata.isMovie) { "$SafeTitle ($($Metadata.year))" } else { $SafeTitle }
                $TargetFolder = Join-Path $Config.General.DownloadTempPath $FolderName

                if (!(Test-Path $TargetFolder)) { 
                    New-Item -ItemType Directory -Path $TargetFolder -Force | Out-Null 
                }

                if ($Metadata.originalUrl -match '/tv/[^/]+/[^/]+/(\d+)') { 
                    $Ep = $matches[1].PadLeft(2, '0')
                    $Season = if ($Metadata.originalUrl -match '/tv/[^/]+/(\d+)/') { $matches[1].PadLeft(2, '0') } else { $Metadata.season }
                } else {
                    $Ep = "01"
                    $Season = $Metadata.season
                }

                $FileKey = "$SafeTitle-$Season-$Ep"
                if ($Processed.Contains($FileKey)) { continue }
                [void]$Processed.Add($FileKey)

                $FileName = if ($Metadata.isMovie) { "$SafeTitle ($($Metadata.year))" } else { "$SafeTitle`_S${Season}E$Ep" }
                
                $ScriptBlock = {
                    param($Url, $TargetFolder, $FileName)
                    $Args = @("`"$Url`"", "-H", "`"Referer: https://vidcore.net/`"", "-H", "`"User-Agent: Mozilla/5.0`"", "--save-dir", "`"$TargetFolder`"", "--save-name", "`"$FileName`"", "--auto-select", "--binary-merge", "--del-after-done", "true", "--thread-count", "16")
                    $Proc = [System.Diagnostics.Process]::Start((New-Object System.Diagnostics.ProcessStartInfo -Property @{ FileName = "N_m3u8DL-RE.exe"; Arguments = $Args -join ' '; UseShellExecute = $false }))
                    $Proc.WaitForExit()
                    return $FileName
                }

                Write-Host "  >>> QUEUED: $FileName" -ForegroundColor Cyan
                $Jobs += Start-Job -ScriptBlock $ScriptBlock -ArgumentList $Metadata.streamUrl, $TargetFolder, $FileName
                [void]$ScannedFolders.Add($TargetFolder)

                while ((Get-Job -State Running).Count -ge $Concurrent) {
                    Start-Sleep -Seconds 1
                    $Completed = Get-Job -State Completed
                    foreach ($Job in $Completed) {
                        $Result = Receive-Job -Job $Job
                        Write-Host "  ✓ COMPLETED: $Result" -ForegroundColor Green
                        Remove-Job -Job $Job
                    }
                }
            } catch {
                Write-Host "  ERROR parsing line: $Line" -ForegroundColor Red
            }
        }

        while ((Get-Job -State Running).Count -gt 0) {
            Start-Sleep -Seconds 1
            $Completed = Get-Job -State Completed
            foreach ($Job in $Completed) {
                $Result = Receive-Job -Job $Job
                Write-Host "  ✓ COMPLETED: $Result" -ForegroundColor Green
                Remove-Job -Job $Job
            }
        }

        Get-Job | Remove-Job

        $Settings = $Config.$($OmniContext.Service)
        $CmdName = if($OmniContext.IsMovie){"DownloadedMoviesScan"}else{"DownloadedEpisodesScan"}
        
        foreach ($Folder in $ScannedFolders) {
            Write-Host "  Scanning: $Folder" -ForegroundColor Gray
            Invoke-OmniApi -Method "Post" -Uri "$($Settings.BaseUrl)/command" -ApiKey $Settings.ApiKey -Body @{ name = $CmdName; path = $Folder }
        }
        
        Clear-Content $Config.General.CommandFile
        Write-Host "`n  INGESTION COMPLETE. API Scan Triggered." -ForegroundColor Green; Pause
    }

    # --- ACTION 4: CLEAR QUEUE ---
    if ($Action -eq 4) {
        if (Test-Path $Config.General.CommandFile) {
            $Count = (Get-Content $Config.General.CommandFile | Where-Object { $_.Trim() -ne "" }).Count
            if ($Count -gt 0) {
                Write-Host "`n  Clearing $Count items from queue..." -ForegroundColor Yellow
                Clear-Content $Config.General.CommandFile
                Write-Host "  ✓ Queue cleared." -ForegroundColor Green
            } else {
                Write-Host "  Queue is already empty." -ForegroundColor Gray
            }
        } else {
            Write-Host "  Queue file does not exist." -ForegroundColor Gray
        }
        Pause
    }
}