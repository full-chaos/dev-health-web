param([Parameter(Mandatory = $true)][string]$StatusPath)

$manifest = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json

Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class OwnedWindowsProcess {
    const uint CreateSuspended = 0x00000004;
    const uint JobObjectExtendedLimitInformation = 9;
    const uint JobObjectLimitKillOnClose = 0x00002000;
    const uint Infinite = 0xffffffff;
    const uint MoveFileReplaceExisting = 0x00000001;
    const uint MoveFileWriteThrough = 0x00000008;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct StartupInfo { public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError; }
    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessInformation { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    public struct BasicLimitInformation { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)]
    public struct IoCounters { public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount; public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)]
    public struct ExtendedLimitInformation { public BasicLimitInformation BasicLimitInformation; public IoCounters IoInfo; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, uint informationClass, IntPtr information, uint length);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool MoveFileEx(string existingFileName, string newFileName, uint flags);

    static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static void AppendQuotedArgument(StringBuilder commandLine, string argument) {
        commandLine.Append('"');
        int slashCount = 0;
        foreach (char character in argument) {
            if (character == '\\') { slashCount++; continue; }
            if (character == '"') {
                commandLine.Append('\\', slashCount * 2 + 1).Append(character);
                slashCount = 0;
                continue;
            }
            commandLine.Append('\\', slashCount).Append(character);
            slashCount = 0;
        }
        commandLine.Append('\\', slashCount * 2).Append('"');
    }
    public static IntPtr CreateKillOnCloseJob() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null); if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var limits = new ExtendedLimitInformation(); limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnClose;
        int length = Marshal.SizeOf(limits); IntPtr pointer = Marshal.AllocHGlobal(length); Marshal.StructureToPtr(limits, pointer, false);
        try { Check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, pointer, (uint)length)); return job; } catch { CloseHandle(job); throw; } finally { Marshal.FreeHGlobal(pointer); }
    }
    public static ProcessInformation CreateSuspended(string command, string[] args) {
        var startupInfo = new StartupInfo(); startupInfo.cb = Marshal.SizeOf(startupInfo);
        var commandLine = new StringBuilder(); AppendQuotedArgument(commandLine, command); foreach (string arg in args) { commandLine.Append(' '); AppendQuotedArgument(commandLine, arg); }
        ProcessInformation processInformation; Check(CreateProcess(command, commandLine, IntPtr.Zero, IntPtr.Zero, true, CreateSuspended, IntPtr.Zero, null, ref startupInfo, out processInformation)); return processInformation;
    }
    public static void ReplaceFileAtomically(string source, string destination) { Check(MoveFileEx(source, destination, MoveFileReplaceExisting | MoveFileWriteThrough)); }
    public static void WaitForProcess(IntPtr process) { Check(WaitForSingleObject(process, Infinite) == 0); }
    public static void TerminateAndWait(IntPtr process) { TerminateAndWait(process, 1); }
    public static void TerminateAndWait(IntPtr process, uint exitCode) { Check(TerminateProcess(process, exitCode)); WaitForProcess(process); uint observedExitCode; Check(GetExitCodeProcess(process, out observedExitCode)); if (observedExitCode == 259) throw new InvalidOperationException("Target process remained active after termination."); }
}
'@

$job = [IntPtr]::Zero
$process = $null
function Publish-Status([hashtable]$status) {
    $temporaryPath = "$StatusPath.$PID.$([Guid]::NewGuid().ToString('N')).tmp"
    $stream = $null
    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($status | ConvertTo-Json -Compress))
        $stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
    [OwnedWindowsProcess]::ReplaceFileAtomically($temporaryPath, $StatusPath)
}
try {
    $job = [OwnedWindowsProcess]::CreateKillOnCloseJob()
    $commandInfo = Get-Command -Name $manifest.command -CommandType Application -ErrorAction Stop
    $commandPath = [IO.Path]::GetFullPath($commandInfo.Path)
    if (-not [string]::Equals([IO.Path]::GetExtension($commandPath), ".exe", [StringComparison]::OrdinalIgnoreCase)) { throw "Owned Windows target must resolve to an executable .exe file." }
    $process = [OwnedWindowsProcess]::CreateSuspended($commandPath, [string[]]$manifest.args)
    if (-not [OwnedWindowsProcess]::AssignProcessToJobObject($job, $process.hProcess)) {
        $assignmentError = [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
        try { [OwnedWindowsProcess]::TerminateAndWait($process.hProcess) } catch { throw [InvalidOperationException]::new("Unable to terminate a target whose Job Object assignment failed.", $_.Exception) }
        throw $assignmentError
    }
    if ([OwnedWindowsProcess]::ResumeThread($process.hThread) -eq 0xffffffff) { throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
    Publish-Status @{ state = "ready"; targetProcessId = $process.dwProcessId }
    [OwnedWindowsProcess]::WaitForProcess($process.hProcess)
    $exitCode = 1; [OwnedWindowsProcess]::GetExitCodeProcess($process.hProcess, [ref]$exitCode) | Out-Null
    exit $exitCode
} catch {
    Publish-Status @{ state = "failed" }
    exit 1
} finally {
    if ($null -ne $process) { [OwnedWindowsProcess]::CloseHandle($process.hThread) | Out-Null; [OwnedWindowsProcess]::CloseHandle($process.hProcess) | Out-Null }
    if ($job -ne [IntPtr]::Zero) { [OwnedWindowsProcess]::CloseHandle($job) | Out-Null }
}
