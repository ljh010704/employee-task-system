param(
  [string]$AgentDir = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [string]$NodePath = "node.exe"
)

$taskName = "EmployeeTaskSystem Collector Agent"
$agentScript = Join-Path $AgentDir "agent.mjs"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$agentScript`" run" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs the local read-only multi-store collector agent." -Force
Write-Host "Registered: $taskName"
