# Setup scheduled task to run build_cloud_index.py every hour starting at 12 PM
# This runs 1 hour after the CI scraper uploads new data

$TaskName = "Build_Cloud_Index"
$ScriptPath = "C:\package-confirmation-app\build_cloud_index.py"
$PythonPath = "python.exe"
$WorkingDir = "C:\package-confirmation-app"

Write-Host "Setting up scheduled task: $TaskName" -ForegroundColor Cyan
Write-Host "Script: $ScriptPath" -ForegroundColor Gray
Write-Host "Schedule: Every hour starting at 12:00 PM" -ForegroundColor Gray
Write-Host ""

# Remove existing task if it exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create trigger - daily at 12pm with hourly repetition
$trigger = New-ScheduledTaskTrigger -Daily -At "12:00PM"

# Add repetition - every 1 hour for 12 hours (12pm to midnight)
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "12:00PM" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition

# Create action
$action = New-ScheduledTaskAction -Execute $PythonPath -Argument $ScriptPath -WorkingDirectory $WorkingDir

# Create settings
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Register the task
try {
    Register-ScheduledTask -TaskName $TaskName -Trigger $trigger -Action $action -Settings $settings -Description "Builds cloud tracking index every hour (12pm-midnight) - runs after CI scraper uploads" -RunLevel Highest
    Write-Host ""
    Write-Host "SUCCESS! Task '$TaskName' created." -ForegroundColor Green
    Write-Host ""
    Write-Host "Schedule:" -ForegroundColor Cyan
    Write-Host "  - Runs every hour from 12:00 PM to 12:00 AM" -ForegroundColor White
    Write-Host "  - First run: 12:00 PM (1 hour after CI scraper at 11 AM)" -ForegroundColor White
    Write-Host "  - Last run: ~11:00 PM or 12:00 AM" -ForegroundColor White
    Write-Host ""
    Write-Host "To verify, run: Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: Failed to create task" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Try running PowerShell as Administrator" -ForegroundColor Yellow
}

