<#
    AutoWorkshop AI — register the backup schedule on a Windows workstation (T-0018).

    The production target is a Linux Docker host using
    `schedule/autoworkshop-backup.cron`. This script is the local equivalent, so
    that the machine where the stack actually runs today also runs its backups
    unattended rather than only when someone remembers.

    Both schedules call the SAME `run-scheduled.sh`, so behaviour, locking,
    logging and status files are identical on either platform. The scheduler is
    the only platform-specific piece, which is the point.

    Usage (from an elevated PowerShell):
        .\install-windows.ps1
        .\install-windows.ps1 -Remove
        .\install-windows.ps1 -WhatIf      # show what would be registered

    Tasks registered (all under the \AutoWorkshop\ folder):
        AutoWorkshop-Backup-Health   every 6 hours
        AutoWorkshop-Backup-Daily    02:15 daily
        AutoWorkshop-Backup-Weekly   03:15 Sundays
        AutoWorkshop-Restore-Drill   04:15 Saturdays (weekly — deliberately more
                                     often than production's monthly cron, because
                                     this cluster is where regressions appear first)
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Remove,
    [string]$BashPath = "C:\Program Files\Git\bin\bash.exe"
)

$ErrorActionPreference = 'Stop'

$BackupDir = Split-Path -Parent $PSScriptRoot
$TaskFolder = '\AutoWorkshop\'

if (-not (Test-Path $BashPath)) {
    throw "Git Bash not found at '$BashPath'. Pass -BashPath with the correct location."
}
if (-not (Test-Path (Join-Path $BackupDir 'run-scheduled.sh'))) {
    throw "run-scheduled.sh not found under '$BackupDir'."
}

# Git Bash needs a POSIX path. C:\a\b -> /c/a/b
function ConvertTo-PosixPath([string]$WindowsPath) {
    $p = $WindowsPath -replace '\\', '/'
    if ($p -match '^([A-Za-z]):(.*)$') { return "/$($Matches[1].ToLower())$($Matches[2])" }
    return $p
}

$PosixDir = ConvertTo-PosixPath $BackupDir

$Tasks = @(
    @{ Name = 'AutoWorkshop-Backup-Health'
       Job  = 'health'
       Desc = 'Backup health check - notices a schedule that has silently stopped firing.'
       Trigger = { $t = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
                        -RepetitionInterval (New-TimeSpan -Hours 6); $t } }

    @{ Name = 'AutoWorkshop-Backup-Daily'
       Job  = 'daily'
       Desc = 'Daily encrypted physical + logical backup with off-host copy.'
       Trigger = { New-ScheduledTaskTrigger -Daily -At '02:15' } }

    @{ Name = 'AutoWorkshop-Backup-Weekly'
       Job  = 'weekly'
       Desc = 'Weekly full backup (retention label differs from daily).'
       Trigger = { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:15' } }

    @{ Name = 'AutoWorkshop-Restore-Drill'
       Job  = 'drill'
       # ASCII only: the registered description is mangled to mojibake otherwise
       # (the live task currently reads "Monthly restore drill a<80><94> proves ...").
       Desc = 'Weekly restore drill (spec 37 requires monthly as a MINIMUM) - proves the backups are actually restorable.'
       # Task Scheduler has no native "1st of the month" trigger via
       # New-ScheduledTaskTrigger, so this runs WEEKLY rather than monthly. The
       # drill takes ~2 minutes and never touches the live cluster, so running it
       # more often than §37 requires costs nothing and catches regressions on the
       # cluster where they appear first. Production cron runs it monthly (1st,
       # 04:15) per §37 — the two cadences differ deliberately.
       Trigger = { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At '04:15' } }
)

if ($Remove) {
    foreach ($t in $Tasks) {
        $existing = Get-ScheduledTask -TaskName $t.Name -TaskPath $TaskFolder -ErrorAction SilentlyContinue
        if ($existing) {
            if ($PSCmdlet.ShouldProcess($t.Name, 'Unregister scheduled task')) {
                Unregister-ScheduledTask -TaskName $t.Name -TaskPath $TaskFolder -Confirm:$false
                Write-Output "removed  $($t.Name)"
            }
        } else {
            Write-Output "absent   $($t.Name)"
        }
    }
    return
}

foreach ($t in $Tasks) {
    # -lc so the login shell sets up the Git Bash environment; the script is
    # invoked by its POSIX path with the job name as its single argument.
    $argument = '-lc "' + $PosixDir + '/run-scheduled.sh ' + $t.Job + '"'
    $action   = New-ScheduledTaskAction -Execute $BashPath -Argument $argument -WorkingDirectory $BackupDir
    $trigger  = & $t.Trigger

    # Run whether or not the user is logged on would need stored credentials;
    # this deliberately runs as the interactive user instead, so no password is
    # captured. On the production Linux host, cron runs as a service account and
    # this limitation does not apply.
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
        -MultipleInstances IgnoreNew

    if ($PSCmdlet.ShouldProcess($t.Name, 'Register scheduled task')) {
        Register-ScheduledTask -TaskName $t.Name -TaskPath $TaskFolder `
            -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
            -Description $t.Desc -Force | Out-Null
        Write-Output "registered  $($t.Name)  ->  $($t.Job)"
    }
}

Write-Output ''
Write-Output 'Registered under Task Scheduler folder \AutoWorkshop\.'
Write-Output 'Verify:  Get-ScheduledTask -TaskPath \AutoWorkshop\ | Format-Table TaskName,State'
Write-Output 'Run now: Start-ScheduledTask -TaskName AutoWorkshop-Backup-Health -TaskPath \AutoWorkshop\'
Write-Output 'Logs:    infrastructure/backup/logs/   Status: infrastructure/backup/status/'
