/**
 * dsh-bat-runner 宿主半（Node）。
 *
 * 两条职责（b18 起第二条是新增的，插件由此与 BatRunner 启动器解耦）：
 *  A. 老本行：连 BatRunner 的命名管道服务端（BatRunner 是服务端、本插件是唯一客户端），按 NDJSON 收
 *     hello / line / entry / ping 四类报文，维护一个环形缓冲；
 *  B. 自己跑 bat：浏览器半发来 run / stop / pick / cfg 四种命令，本半真的去执行——
 *     无窗口执行 cmd /d /c call "<bat>"（工作目录 = bat 所在目录）、按源码编码判定怎么解码、
 *     停止 = taskkill /F /T 杀整棵进程树、选文件走系统原生对话框（Electron 有就用，没有退回
 *     PowerShell 的 WinForms 对话框）、退出 DSH 时按用户勾选连子进程一起收。
 *     ⚠️ 只管插件自己 spawn 的进程；BatRunner 启动器那边跑的 bat 一条都不碰。
 * 再自注册一条官方信封的 RPC 通道 `/dsh-batrunner-logs/<method>` 供浏览器半调用（method = 末段）。
 *
 * 四条硬规矩（前三条来自本项目踩过的坑，第四条是本轮新增）：
 *  - 管道读不到就静默重连，任何异常都不许冒到 DSH 主流程（插件挂了不能带崩客户端）。
 *  - 心跳 2 秒一条，超过 PING_STALE_MS 没收到就判断开——这是 BatRunner 侧刻意设计的断线探针。
 *  - 只缓存最近 keepLines 行，实时流语义，不补历史（BatRunner 侧通道满即丢）。
 *  - 插件这边有正在跑的 bat 时，转发过来的 line 直接丢（用户定档：本地在跑就不收启动器的日志），
 *    本地全停再接回。丢弃发生在源头，面板不会两路混着显示。
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// 发布包名：client id 与 cordis 补丁行名必须与它一致。
const PACKAGE = 'dsh-bat-runner';
// 内部命名空间：保持 dsh-batrunner-logs 不变（%TEMP% 下的台账/设置、临时文件前缀、RPC 通道），
// 这样从旧名升级上来时已有的勾选与任务台账不会丢。改它等于换一套存储。
const PLUGIN = 'dsh-batrunner-logs';
const CHANNEL = '/' + PLUGIN;
const DEFAULT_PIPE = 'dsh.batrunner.logs';
const RECONNECT_MS = 2000;
const PING_STALE_MS = 7000;
const MAX_BODY_BYTES = 1 << 20;
const SEGMENT = /^[A-Za-z0-9_$.-]+$/;
const GBK_CP = 936;                       // 本机 OEM 代码页；判定编码、转副本都用它
const METHODS = new Set(['state', 'run', 'stop', 'pick', 'cfg', 'warm', 'openDir']);

// ---- b39：面板内存上限与落盘 ----
// 用户定档：面板里留「1 万行」，再老的滚出内存；但**磁盘文件不截断**（保存开着时它就是全量）。
// 传输跟着改成增量：state 每拍只带 since 之后的新行，换通道时才整段重发。
const MAX_LINES = 10000;
const MAX_BUFS = 6;                       // 最多留几份脚本缓冲（停了还能回看最后几行），超出按最近使用回收
const LOG_FLUSH_BYTES = 64 * 1024;        // 攒够这么多字符就落盘
const LOG_FLUSH_MS = 500;                 // 或者每 500ms 落一次（先到哪个算哪个）
const KEEP_FOREVER = -1;                  // 永久：一直写盘，不自动清理
const KEEP_DAYS = [0, 1, 3, 7, 30, KEEP_FOREVER]; // 0 = 不保存；正数 = 保留几天；-1 = 永久
const LOG_DIR = process.env.DSH_BATRUNNER_LOG_DIR || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), PACKAGE, 'logs');

// ---- b21：插件自己跑的 bat，输出不再挂在宿主管道上 ----
// 脚本的屏幕输出直接进一个副本文件（写文件不会失败），宿主改成定期去看这个文件长出来多少。
// 于是 DSH 关了脚本也不会有"写不进去"这回事，能真的继续跑下去；DSH 回来时按台账认领。
// 三个位置都能用环境变量挪走，离线自测靠这个跑在自己的目录里，不去踩真宿主的台账。
const RUN_LOG_DIR = process.env.DSH_BATRUNNER_RUN_LOG_DIR || path.join(os.tmpdir(), PLUGIN, 'run-logs');
const TASKS_FILE = process.env.DSH_BATRUNNER_TASKS_FILE || path.join(os.tmpdir(), PLUGIN, 'tasks.json');
// 副本长到多大就往面板提醒一次。为什么不是"超了就截断"：cmd 正握着这个文件的时候，别的进程
// 去截它会 EBUSY（实测），硬截反而让后面写进去的内容带着零洞把文件撑得更大。空间回收靠别的
// 两件事：脚本一停副本就删，DSH 重启时把没人握着的残留副本清掉。
const COPY_WARN_BYTES = Number(process.env.DSH_BATRUNNER_COPY_WARN_BYTES) > 0
  ? Number(process.env.DSH_BATRUNNER_COPY_WARN_BYTES) : 4 * 1024 * 1024;
const TAIL_MS = 400;                     // 宿主多久去看一眼副本长出来多少
const ADOPT_POLL_MS = 2000;              // 认领来的老任务多久判一次活
const REPLAY_WINDOW = 64 * 1024;         // 认领时只回放副本末尾这一段，当作退出前的画面
// 勾选状态另存一份（和台账同目录，所以自测改环境变量时它跟着挪）：宿主自己启动时先读它，
// 不等浏览器半把值推过来——认领时要靠这个值决定「上一代没带走的残留」是接上还是补一刀。
const SETTINGS_FILE = path.join(path.dirname(TASKS_FILE), 'settings.json');
// 宿主往启动器 stdin 写去留意图的间隔。启动器只在管道断掉（EOF）那一刻按最后一个意图动手，
// 而管道断掉是操作系统的保证：宿主管道另一头的进程没了，读端立刻就知道，跟宿主怎么死的无关。
const INTENT_MS = 500;
const STORE_KEY = '__DSH_BATRUNNER_LOGS_STORE__';   // 运行中的任务表挂在进程级，宿主换 apply 也不丢

export const name = PACKAGE;

/** 命名管道的 Windows 路径；反斜杠用字符码拼，免得再被哪一层转义吃掉。 */
function pipePath(name) {
  const bs = String.fromCharCode(92);
  return bs + bs + '.' + bs + 'pipe' + bs + name;
}

/** 一条日志通道的环形缓冲：rows 按 seq 递增，超出 keep 从头部丢（客户端靠 first/seq 判断能不能续上）。 */
function newBuf() {
  return { rows: [], seq: 0, first: 1, lastAt: 0 };
}

/** 按 id 取缓冲（proc 的、或某条启动失败留下的一小段）。多留几份但封顶，避免跑过的脚本无限堆积。 */
function bufFor(store, id) {
  let buf = store.bufs.get(id);
  if (!buf) {
    buf = newBuf();
    store.bufs.set(id, buf);
    pruneBufs(store, id);
  }
  return buf;
}

function pruneBufs(store, keepId) {
  if (store.bufs.size <= MAX_BUFS) return;
  const victims = [...store.bufs.entries()]
    .filter(([id]) => id !== keepId && !store.procs.has(id))
    .sort((a, b) => a[1].lastAt - b[1].lastAt);
  while (store.bufs.size > MAX_BUFS && victims.length) store.bufs.delete(victims.shift()[0]);
}

function pushRow(store, buf, row) {
  buf.seq += 1;
  row.seq = buf.seq;
  buf.rows.push(row);
  buf.lastAt = row.at;
  while (buf.rows.length > store.keep) { buf.rows.shift(); buf.first += 1; }
}

function createStore(keep) {
  return {
    keep,
    relay: newBuf(),                   // 启动器转发来的那一路（b39 之前叫 store.lines）
    entries: [],
    server: null,
    connected: false,
    connectedAt: 0,
    lastPingAt: 0,
    lastLineAt: 0,
    reconnects: 0,
    lastError: '',
    // ---- b18：插件自己跑的 bat 走这一套，和启动器转发的 lines 互不覆盖 ----
    procs: new Map(),                  // id -> 运行中的任务；b21 起带 logPath / offset / adopted（认领来的）
    bufs: new Map(),                   // id -> 日志缓冲（b39：每个脚本一份，面板只显示选中的那个）
    sel: '',                           // b39：当前选中的脚本 id（面板跟着它换日志）
    keepDays: 0,                       // b39：0 = 不保存；正数 = 保留天数；-1 = 永久
    local: { keep, lastExit: null, lastError: '' },
    picker: null,                      // b32：设置窗开着时预热好的选文件进程（见 pickViaWarm）
    haltOnExit: false,                 // 用户勾了「退出 DSH 时停止正在运行的 bat」才真退出时收进程
    haltStored: false,                 // settings.json 存过没有；没存过浏览器半才搬老版本的 localStorage 勾选
  };
}

/** 本地行的时间戳与转发口径一致（面板 title 里两者要能并排看）。 */
function stamp(d) {
  const x = d || new Date();
  const p = (n, w) => String(n).padStart(w, '0');
  return p(x.getFullYear(), 4) + '-' + p(x.getMonth() + 1, 2) + '-' + p(x.getDate(), 2) + ' '
    + p(x.getHours(), 2) + ':' + p(x.getMinutes(), 2) + ':' + p(x.getSeconds(), 2) + '.' + p(x.getMilliseconds(), 3);
}

/**
 * 插件本地的一条输出行进环形缓冲。脚本自己吐出来的行**逐字**：不_add_时间戳、不加级别、不着色。
 * note 只给「插件自己写的那类行」带：{k: 语言表编号, p: 参数}，p 里的值还可以再是一个 {k,p}（嵌套现拼）。
 * 界面按用户当下的语言现拼这句话；text 仍留一份简体中文，老界面和落盘的日志照样看得懂。
 */
function pushLocal(store, id, name, text, note) {
  const row = { seq: 0, id: id, name: name, ts: stamp(), text: String(text ?? ''), at: Date.now(), note: note || null };
  pushRow(store, bufFor(store, id), row);
  const proc = store.procs.get(id);
  // 落盘是「每条脚本一份文件」，所以只有真正在跑、且开了保存的那个 proc 有 writer
  if (proc && proc.writer) writeLogLine(proc.writer, row.text);
}

/** 收一行 NDJSON，按类型落到 store；未知类型忽略（协议向前兼容）。 */
function ingest(store, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'hello':
      store.server = { pid: msg.pid, version: msg.version, startedUtc: msg.startedUtc };
      store.entries = Array.isArray(msg.entries) ? msg.entries : [];
      store.connected = true;
      store.connectedAt = Date.now();
      store.lastPingAt = Date.now();
      break;
    case 'entry': {
      const i = store.entries.findIndex((e) => e.path === msg.path);
      const rec = { name: msg.name, path: msg.path, forward: !!msg.forward };
      if (i >= 0) store.entries[i] = rec; else store.entries.push(rec);
      break;
    }
    case 'line':
      // 插件本地有正在跑的 bat → 转发来的行在源头丢掉（用户定档：本地在跑就不收启动器的日志）。
      // 丢在这里而不是丢在 UI 里，面板才不会两路混着显示；本地全停后自然接回。
      if (store.procs.size) break;
      pushRow(store, store.relay, {
        seq: 0, id: 'relay', name: String(msg.entry || ''), ts: String(msg.ts || ''),
        text: String(msg.text ?? ''), at: Date.now(), note: null,
      });
      store.lastLineAt = Date.now();
      break;
    case 'ping':
      store.lastPingAt = Date.now();
      store.connected = true;
      break;
    default: break;
  }
}

/** 起一条永不抛的管道读取循环；返回 dispose 交 ctx.effect 清理。 */
function watchPipe(ctx, store, pipeName) {
  let closed = false;
  let sock = null;
  let timer = null;
  const log = ctx.logger || console;

  const connect = () => {
    if (closed) return;
    try { sock = net.connect(pipePath(pipeName)); } catch (err) {
      store.lastError = String(err && err.message || err);
      timer = setTimeout(connect, RECONNECT_MS);
      return;
    }
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('connect', () => {
      store.connected = true;
      store.lastError = '';
      log.info && log.info(`${PLUGIN}: connected ${pipeName}`);
    });
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) { try { ingest(store, line); } catch (err) { store.lastError = String(err && err.message || err); } }
      }
      if (buf.length > 4 << 20) buf = '';
    });
    const down = (why) => {
      const wasConnected = store.connected;
      store.connected = false;
      if (wasConnected && !closed) store.reconnects += 1;
      if (why) store.lastError = String(why);
      if (!closed) { clearTimeout(timer); timer = setTimeout(connect, RECONNECT_MS); }
    };
    sock.on('error', (err) => down(err && err.code || 'pipe-error'));
    sock.on('close', () => down('closed'));
  };

  connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    try { sock && sock.destroy(); } catch { /* 已断开 */ }
  };
}

// ---------------------------------------------------------------------------
// 本地运行：插件自己启动的 bat，不依赖启动器在不在跑
//
// 命令行是 cmd.exe /d /c call "路径"，工作目录取脚本所在目录，和启动器一致。
// 输出按 GBK 或 UTF-8 增量解码成行，插件不加时间戳、级别、颜色。编码判定沿用
// 启动器那套：先看 BOM，再试严格 UTF-8，最后按 GBK；脚本里出现 chcp 65001 的按
// UTF-8 解。GBK 脚本先复制成同目录的 GBK + CRLF 副本再执行（cmd 的批处理解析器
// 不认 UTF-8 里的中文），副本在进程结束后删掉；放同目录是为了保住 %~dp0 的语义。
// ---------------------------------------------------------------------------

const RUN_EXTS = new Set(['.bat', '.cmd']);
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];

function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// ---------------------------------------------------------------------------
// bat 到底怎么被带起来
//
// 弹窗这件事（b20 解决的）：以前 Node 直接 spawn cmd.exe，要让它活过 DSH 就得 detach，
// 而 Windows 上 detached 的进程会被新开一个控制台，cmd.exe 又自己把这个控制台显示出来。
// 现在 Node 只起 PowerShell 当启动器，走"选文件对话框"那条已验证不弹窗的路，由 PowerShell
// 用 CreateNoWindow（= Windows 的 CREATE_NO_WINDOW，语义就是"别建窗口"）把 cmd 带起来。
//
// 输出走哪儿（b21 改的）：cmd 的屏幕输出由 cmd 自己在命令行里 >> 进一个副本文件，
// 宿主不再用管道接它。以前 cmd 的输出是一条通到宿主管道的匿名管道，宿主一没，管道另一头
// 就凭空消失，cmd 下一次 echo 写不进去会当场把自己中止（实测：宿主死后脚本只多写一拍就没了）
// ——「退出 DSH 时不勾选就不停止」那条勾选当时名不副实。写文件不存在失败，所以脚本从此真的
// 独立于 DSH。两种编码照旧完好：GBK 脚本写进去的是 GBK 字节，脚本自己 chcp 65001 的写进去的
// 是 UTF-8 字节，都不出现问号（这条实测还在，见 tools/probe/probe-launch.mjs 的原始字节）。
//
// 启动器顺手把 cmd 的 pid 写进一个小文件，宿主读回来存着：宿主换了以后还要靠它判活和下刀。
// cmd 跑完自己把退出码写进 exitFile（命令行末尾那句 echo），所以哪怕启动器正堵在别处，
// 宿主也能从文件里把真实退出码捞出来。
//
// b23 起启动器还兼一个看门狗：它读宿主管道（stdin），宿主每半秒写一个字母进去——K 是「我走了
// 就把脚本带走」，N 是「别管」。管道断掉（读到 EOF）时按最后一个字母决定要不要下刀。
//
// b26：**EOF 那条路在本机永远抢不到**。实测宿主被 TerminateProcess 强杀时，Node 的 'exit'
// 钩子一行都不会跑（tools/probe/probe-halt.mjs），而 spawn 出来的启动器是 libuv 作业对象的
// 成员，宿主一没它会被一起带走——脚本的 Read() 根本来不及返回 EOF（tools/probe/probe-stdin.mjs
// 的 kill 组停在最后一次读字符）。所以真正的兜底改成**作业对象**：启动器建一个 Job Object、
// 把 cmd 塞进去，勾着「退出即停」时打开 KILL_ON_JOB_CLOSE——启动器一消失（不管是谁杀的），
// 句柄一关，操作系统当场把 cmd 连同它已经 spawn 的子孙收掉，不跑任何 JS、不依赖 EOF。不勾选时
// 把那个标志摘掉，脚本照旧活过 DSH（进程还在，只是 KILL_ON_JOB_CLOSE 关着）。EOF/字母那条路
// 保留：它负责运行中改勾选，以及启动器活得比宿主久的场合能收得更早。
//
// 脚本源码必须纯 ASCII——路径经 -EncodedCommand 的 UTF-16LE base64 传，不受控制台代码页影响。
// ---------------------------------------------------------------------------
/** 作业对象这套 P/Invoke 只给启动器用：建 Job、挂 cmd、按勾选开关 KILL_ON_JOB_CLOSE。 */
function jobHelperLines() {
  return [
    '$job = [IntPtr]::Zero',
    'try {',
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class BrlJob {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct LIM { public long A; public long B; public uint Flags; public UIntPtr C; public UIntPtr D; public uint E; public UIntPtr F; public uint G; public uint H; }',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct IOC { public ulong A1; public ulong A2; public ulong A3; public ulong A4; public ulong A5; public ulong A6; }',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct EXT { public LIM Basic; public IOC Io; public UIntPtr P1; public UIntPtr P2; public UIntPtr P3; public UIntPtr P4; }',
    '  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr CreateJobObject(IntPtr a, string n);',
    '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetInformationJobObject(IntPtr j, int c, IntPtr i, uint l);',
    '  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);',
    '  public static IntPtr Make() { return CreateJobObject(IntPtr.Zero, null); }',
    '  public static bool Arm(IntPtr j, bool on) {',
    '    if (j == IntPtr.Zero) return false;',
    '    EXT e = new EXT(); e.Basic.Flags = on ? 0x2000u : 0u;',
    '    int size = Marshal.SizeOf(typeof(EXT));',
    '    IntPtr m = Marshal.AllocHGlobal(size);',
    '    try { Marshal.StructureToPtr(e, m, false); return SetInformationJobObject(j, 9, m, (uint)size); }',
    '    finally { Marshal.FreeHGlobal(m); }',
    '  }',
    '  public static bool Put(IntPtr j, IntPtr p) { if (j == IntPtr.Zero) return false; return AssignProcessToJobObject(j, p); }',
    '}',
    '"@',
    '} catch {}',
    'try { $job = [BrlJob]::Make() } catch {}',
    'function SetJob($on) { if ($job -ne [IntPtr]::Zero) { try { [void][BrlJob]::Arm($job, $on) } catch {} } }',
    'function PutJob($proc) { if ($job -ne [IntPtr]::Zero) { try { [void][BrlJob]::Put($job, $proc.Handle) } catch {} } }',
  ];
}

// 导出是给离线自测用的（tools/watchdog-test.mjs 直接把这段喂给 PowerShell，单独验机制本体，
// 不用把整个宿主拖进来）。
export function launcherScript(execPath, dir, pidFile, logPath, exitFile, haltAtStart) {
  return [
    '$ErrorActionPreference = "Continue"',
    ...jobHelperLines(),
    '$bat = ' + psQuote(execPath),
    '$dir = ' + psQuote(dir),
    '$pidFile = ' + psQuote(pidFile),
    '$log = ' + psQuote(logPath),
    '$exitFile = ' + psQuote(exitFile),
    '$halt = ' + (haltAtStart ? '$true' : '$false'),
    '$si = New-Object System.Diagnostics.ProcessStartInfo',
    '$si.FileName = "cmd.exe"',
    '$si.Arguments = \'/d /v:on /c call "\' + $bat + \'" >> "\' + $log + \'" 2>&1 < NUL & echo !ERRORLEVEL!> "\' + $exitFile + \'"\'',
    '$si.WorkingDirectory = $dir',
    '$si.UseShellExecute = $false',
    '$si.CreateNoWindow = $true',
    // 先上刀再起进程：host 万一在 Start 前后就没了，kill-on-close 也已经生效
    'SetJob $halt',
    '$p = [System.Diagnostics.Process]::Start($si)',
    'PutJob $p',
    'try { [System.IO.File]::WriteAllText($pidFile, [string]$p.Id) } catch {}',
    '$intent = "N"',
    'if ($halt) { $intent = "K" }',
    '$reader = [Console]::In',
    'while ($true) {',
    '  $c = $reader.Read()',
    '  if ($c -lt 0) { break }',
    '  if ($c -eq 75) { if ($intent -ne "K") { $intent = "K"; SetJob $true } }',
    '  elseif ($c -eq 78) { if ($intent -ne "N") { $intent = "N"; SetJob $false } }',
    '}',
    'if ($intent -eq "K") {',
    '  $tk = New-Object System.Diagnostics.ProcessStartInfo',
    '  $tk.FileName = $env:SystemRoot + "\\System32\\taskkill.exe"',
    '  $tk.Arguments = "/F /T /PID " + [string]$p.Id',
    '  $tk.UseShellExecute = $false',
    '  $tk.CreateNoWindow = $true',
    '  try { $tkr = [System.Diagnostics.Process]::Start($tk); $tkr.WaitForExit() } catch {}',
    '  exit 9',
    '}',
    // 放行：先把刀收起来再退，否则进程一退句柄一关，cmd 还是会被带走
    'SetJob $false',
    '$p.WaitForExit()',
    'exit $p.ExitCode',
  ].join('\n');
}

// 同步跑一小段 PowerShell（只用于转码，几十毫秒），脚本源码必须纯 ASCII：
// 路径走 -EncodedCommand 的 UTF-16LE base64，不受控制台代码页影响。
function runPowerShell(script, timeoutMs = 20000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', [...PS_ARGS, encoded], {
    encoding: 'buffer', windowsHide: true, timeout: timeoutMs,
  });
  const out = result.stdout ? result.stdout.toString('latin1') : '';
  const err = result.stderr ? result.stderr.toString('latin1') : '';
  if (result.error) return { ok: false, code: -1, out, err: String(result.error.message || result.error) };
  return { ok: result.status === 0, code: result.status, out, err };
}

// 异步跑一段 PowerShell（文件对话框要等人点，不能阻塞宿主事件循环）
function runPowerShellAsync(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', [...PS_ARGS, encoded], { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.setEncoding('latin1');
    child.stderr.setEncoding('latin1');
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function decodeStrict(buf, label) {
  try { return new TextDecoder(label, { fatal: true }).decode(buf); } catch { return null; }
}

// 脚本里是否真的执行了 chcp 65001。只看会执行的那几行：rem 与 :: 注释里提一句
// "chcp 65001" 不改变输出码页，算进去会把该转副本的脚本误判成原样执行。
function hasChcp65001(text) {
  const lines = String(text).split(/\r\n?|\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(rem\b|::)/i.test(line)) continue;
    if (/@?chcp\s+65001\b/i.test(line)) return true;
  }
  return false;
}

// 判编码：返回 { codec, needsCopy, text }。needsCopy 时 text 是解出来的原文，
// 要转成 GBK 副本再跑；needsCopy 为假就原样执行，codec 决定怎么解输出。
function planEncoding(srcPath) {
  const buf = fs.readFileSync(srcPath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { codec: 'gbk', needsCopy: true, text: new TextDecoder('utf-16le').decode(buf.subarray(2)) };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { codec: 'gbk', needsCopy: true, text: new TextDecoder('utf-16be').decode(buf.subarray(2)) };
  }
  const hasUtf8Bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = decodeStrict(hasUtf8Bom ? buf.subarray(3) : buf, 'utf-8');
  if (text === null) {
    if (!hasUtf8Bom) return { codec: 'gbk', needsCopy: false, text: null };
    return { codec: 'gbk', needsCopy: true, text: new TextDecoder('gbk').decode(buf.subarray(3)) };
  }
  if (!/[\u0080-\uFFFF]/.test(text)) return { codec: 'gbk', needsCopy: false, text };
  if (hasChcp65001(text)) return { codec: 'utf-8', needsCopy: false, text };
  return { codec: 'gbk', needsCopy: true, text };
}

// UTF-8 原文 → 同目录 GBK + CRLF 副本，交给 PowerShell 的 GetEncoding(936) 编码
function toGbkCopy(text, destPath) {
  const tmp = destPath + '.u8.tmp';
  fs.writeFileSync(tmp, text, { encoding: 'utf8' });
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$t = [System.IO.File]::ReadAllText(${psQuote(tmp)}, [System.Text.Encoding]::UTF8)`,
    '$t = $t -replace "`r`n", "`n" -replace "`n", "`r`n"',
    `[System.IO.File]::WriteAllText(${psQuote(destPath)}, $t, [System.Text.Encoding]::GetEncoding(${GBK_CP}))`,
    'Write-Output BRL-OK',
  ].join('\n');
  const result = runPowerShell(script);
  try { fs.unlinkSync(tmp); } catch {}
  if (!result.ok || !/BRL-OK/.test(result.out)) {
    throw new Error('转 GBK 副本失败：' + (result.err.trim() || 'powershell 退出码 ' + result.code));
  }
}

// ---------------------------------------------------------------------------
// 副本文件（b21）：脚本的屏幕输出落在这里，宿主定期去看它长出来多少。
// 谁握着一个副本，看它的命令行就认得——命令行里带这个目录路径的 cmd 一定是本插件起的，
// 所以 pid 被别人复用顶包也不会认错，副本也不会越攒越多。
// ---------------------------------------------------------------------------
function ensureRunLogDir() {
  try { fs.mkdirSync(RUN_LOG_DIR, { recursive: true }); } catch { /* 已经在 */ }
}

function runLogPath(seed) {
  const safe = String(seed).replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 40) || 'task';
  return path.join(RUN_LOG_DIR, `${safe}-${process.pid}-${Date.now()}.log`);
}

/* ---------- b39：日志落盘 ----------
 * 一次运行一个文件，边跑边写（攒够 64 KB 或每 500ms 刷一次），**不攒到结束再写**：
 * 脚本被强杀、DSH 崩了、断电，最多丢最后半秒；攒着写既怕丢又吃内存。
 * 文件头建文件时写一次（脚本名 / 路径 / 启动时间 / 运行总时长）；
 * 「运行总时长」是**定宽 8 字符**（HH:MM:SS）的原地覆盖字段：跑到一半看到的是当下时长，
 * 结束时盖成最终值，同时在文末追加一行结束记录兜底（被强杀来不及回填也查得到）。
 * 所有写入都带显式 offset（pwrite），这样原地覆盖不会挪动追加的位置。
 */
function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* 已经在 */ }
}

function safeFileStem(name) {
  return String(name || 'bat').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^[._]+/, '').slice(0, 40) || 'bat';
}

function compactStamp(d) {
  const x = d || new Date();
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return p(x.getFullYear(), 4) + p(x.getMonth() + 1) + p(x.getDate())
    + '-' + p(x.getHours()) + p(x.getMinutes()) + p(x.getSeconds());
}

/** 定宽 HH:MM:SS。改宽度要连 openLogWriter 里那 8 字节一起改。 */
function hmsText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.min(99, Math.floor(s / 3600))) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}

function openLogWriter(store, proc, resume) {
  if (!store.keepDays) return null;
  try {
    ensureLogDir();
    pruneOldLogs(store.keepDays);      // 顺手清一遍：只在启动时清的话，长期不重启就永远不清
    // 认领回来的老任务接着写同一份文件（DSH 重启不该把一次运行切成两个文件）
    if (resume && resume.file) {
      let size = 0;
      try { size = fs.statSync(resume.file).size; } catch { size = 0; }
      if (size > 0) {
        const fd = fs.openSync(resume.file, 'r+');
        const writer = {
          fd, file: resume.file, off: size, pend: '',
          durOff: Number(resume.durOff) || 0, t0: Number(resume.t0) || Date.now(), timer: null, done: false,
        };
        writeLogLine(writer, '# ---- 插件重载，继续写 ----');
        writer.timer = setInterval(() => flushLog(writer), LOG_FLUSH_MS);
        if (writer.timer.unref) writer.timer.unref();
        return writer;
      }
    }
    const file = path.join(LOG_DIR, safeFileStem(proc.name) + '-' + compactStamp(new Date()) + '.log');
    const head = '# ===== dsh-bat-runner 运行日志 =====\n'
      + '# 脚本名称  : ' + String(proc.name || '') + '\n'
      + '# 脚本路径  : ' + String(proc.srcPath || '') + '\n'
      + '# 启动时间  : ' + String(proc.startedAt || stamp()).slice(0, 19) + '\n'
      + '# 运行总时长: ';
    const durOff = Buffer.byteLength(head, 'utf8');
    const buf = Buffer.from(head + '00:00:00' + '\n# ==================================\n', 'utf8');
    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, buf, 0, buf.length, 0);
    const writer = { fd, file, off: buf.length, pend: '', durOff, t0: Date.now(), timer: null, done: false };
    writer.timer = setInterval(() => flushLog(writer), LOG_FLUSH_MS);
    if (writer.timer.unref) writer.timer.unref();
    return writer;
  } catch {
    return null;                       // 盘写不进去不该连带脚本都起不来
  }
}

function flushLog(writer) {
  if (!writer || writer.done || writer.fd < 0) return;
  if (writer.pend) {
    const payload = writer.pend;
    writer.pend = '';
    try {
      const buf = Buffer.from(payload, 'utf8');
      fs.writeSync(writer.fd, buf, 0, buf.length, writer.off);
      writer.off += buf.length;
    } catch { /* 这一批丢了就丢了，下次接着写 */ }
  }
  try { fs.writeSync(writer.fd, Buffer.from(hmsText(Date.now() - writer.t0), 'utf8'), 0, 8, writer.durOff); }
  catch { /* 覆盖失败不影响正文 */ }
}

function writeLogLine(writer, text) {
  if (!writer || writer.done) return;
  writer.pend += String(text) + '\n';
  if (writer.pend.length >= LOG_FLUSH_BYTES) flushLog(writer);
}

function closeLogWriter(writer, info) {
  if (!writer || writer.done) return '';
  const dur = hmsText(Date.now() - writer.t0);
  flushLog(writer);                    // 先把 pending 刷掉（done 置位后它就不干活了）
  writer.done = true;
  if (writer.timer) { try { clearInterval(writer.timer); } catch {} writer.timer = null; }
  try { fs.writeSync(writer.fd, Buffer.from(dur, 'utf8'), 0, 8, writer.durOff); } catch {}
  const why = (info && info.why) || '退出码 未知';
  const tail = '# ===== 结束 ' + String((info && info.at) || stamp()).slice(0, 19) + ' · 总时长 ' + dur + ' · ' + why + ' =====\n';
  try {
    const buf = Buffer.from(tail, 'utf8');
    fs.writeSync(writer.fd, buf, 0, buf.length, writer.off);
    writer.off += buf.length;
  } catch {}
  try { fs.closeSync(writer.fd); } catch {}
  writer.fd = -1;
  return writer.file;
}

/** 删掉超过 keepDays 的 .log；返回删了几个（自测要看这个数）。 */
function pruneOldLogs(days) {
  const n = Number(days);
  if (!(n > 0)) return 0;
  const cut = Date.now() - n * 86400000;
  let killed = 0;
  try {
    for (const file of fs.readdirSync(LOG_DIR)) {
      if (!/\.log$/i.test(file)) continue;
      const full = path.join(LOG_DIR, file);
      try {
        if (fs.statSync(full).mtimeMs < cut) { fs.rmSync(full, { force: true }); killed += 1; }
      } catch { /* 被别的进程占着就下次再说 */ }
    }
  } catch { /* 目录还不存在 */ }
  return killed;
}

/** 目录概况给设置窗看：几个文件、多大、最早那份什么时候。 */
function logDirInfo() {
  let files = 0, bytes = 0, oldest = 0;
  try {
    for (const file of fs.readdirSync(LOG_DIR)) {
      if (!/\.log$/i.test(file)) continue;
      try {
        const st = fs.statSync(path.join(LOG_DIR, file));
        files += 1;
        bytes += st.size;
        if (!oldest || st.mtimeMs < oldest) oldest = st.mtimeMs;
      } catch {}
    }
  } catch { /* 目录还不存在 */ }
  return { dir: LOG_DIR, files, bytes, oldest };
}

/** 跑一个"发完就撒手"的子进程，并且**把失败变成可回报的结果**。
 *  Node 的 spawn 失败是异步 'error' 事件，`try/catch` 抓不到——之前那版就是这么"回 ok、其实啥也没发生"的。 */
function runDetached(file, args, opts) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, err) => { if (!settled) { settled = true; resolve({ ok: ok, err: err || '' }); } };
    try {
      const child = spawn(file, args, Object.assign({ stdio: 'ignore' }, opts || {}));
      child.on('error', (e) => done(false, String((e && e.message) || e)));
      child.on('spawn', () => setTimeout(() => done(true), 120));   // 起得来就算成功（GUI 没有可靠的"窗口出现了"信号）
      child.on('exit', () => done(true));
      if (child.unref) child.unref();
      setTimeout(() => done(true), 1500);
    } catch (e) { done(false, String((e && e.message) || e)); }
  });
}

/** 能拿到 electron 的 shell 就用它：`shell.openPath` 走 ShellExecute，由系统自己去开文件夹。 */
async function loadElectronShell() {
  if (!process.versions.electron) return null;
  try {
    const mod = await import('electron');
    const shell = mod.shell || (mod.default && mod.default.shell);
    return shell && typeof shell.openPath === 'function' ? shell : null;
  } catch { return null; }
}

/** 打开日志目录。自测里用 DSH_BATRUNNER_OPEN_MOCK 拦掉，不许真去拉窗口。
 *
 *  ⚠️ 这里连着踩了三个坑（b43/b44，用户三次"打不开磁盘"），别再改回"直接 spawn explorer"：
 *  ① `windowsHide: true` 对 GUI 程序同样生效（explorer 的文件夹窗口被建成隐藏的）；
 *  ② 去掉它也没用——在 DSH 的宿主进程里 `spawn('explorer.exe', [dir])` 依然不弹窗：
 *     进程确实起来了，但那是个 `/factory,{75dff2b7-…} -Embedding` 的 COM 宿主，窗口没建出来
 *     （`Get-Process explorer` 里没有带 MainWindowTitle 的进程）。同样的调用从普通 node 里是能弹的，
 *     差别在调用方是不是"交互式外壳的客户端"，这点没法在代码里查，只能按实测选路。
 *  ③ `cmd /c start ""` 也不行：cmd 带 windowsHide 时，"隐藏"会一路传给被启动的窗口（实测无窗口）。
 *  实测**唯一稳定**的一条是"经 cmd 去拉 explorer"：`cmd /c explorer.exe "<dir>"`——和插件跑 bat 是同一个形状。
 *  所以主路固定走它；`shell.openPath` 和"直接 spawn explorer"只当兜底，而且成功与否如实回报给 UI。 */
async function openLogDir() {
  ensureLogDir();
  if (process.env.DSH_BATRUNNER_OPEN_MOCK !== undefined) return { ok: true, via: 'mock' };
  /* 经 cmd 拉 explorer：路径自己加引号、并且用 verbatim（Node 默认会把参数里的引号转义成 \"，
   * cmd.exe 不认那一套）。LOG_DIR 在别的机器上可能带空格（用户名带空格），不这样写就会开错地方。 */
  const viaCmd = await runDetached('cmd.exe', ['/c', 'explorer.exe "' + LOG_DIR + '"'],
    { windowsHide: true, windowsVerbatimArguments: true });
  if (viaCmd.ok) return { ok: true, via: 'cmd-explorer' };
  const shell = await loadElectronShell();
  if (shell) {
    try {
      const err = await shell.openPath(LOG_DIR);
      if (!err) return { ok: true, via: 'shell' };
    } catch { /* 落到最后一条 */ }
  }
  const abs = path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'explorer.exe');
  const direct = await runDetached(abs, [LOG_DIR]);
  return { ok: direct.ok, via: 'explorer', err: direct.err || viaCmd.err || '' };
}


/** 勾选状态的小文件：宿主起来时先读它，不等浏览器半把值推过来（认领时要靠它决定接上还是补刀）。
 *  stored 告诉浏览器半「这台机器上到底存过没有」：没存过它才把老版本存在 localStorage 里的勾选
 *  搬过来；存过就以这份为准，不再让它拿自己 profile 的缓存覆盖（b25 修的就是这个）。 */
function loadSettings() {
  const stored = fs.existsSync(SETTINGS_FILE);
  if (!stored) return { haltOnExit: false, keepDays: 0, stored: false };
  try {
    const o = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
    const days = Number(o.keepDays);
    return {
      haltOnExit: o.haltOnExit === true,
      // 只认 0/1/3/7/30/-1：存档被手改过也不会照着一个乱数去删文件
      keepDays: KEEP_DAYS.includes(days) ? days : 0,
      stored: true,
    };
  } catch { return { haltOnExit: false, keepDays: 0, stored: true }; }
}

function saveSettings(store) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ haltOnExit: !!store.haltOnExit, keepDays: Number(store.keepDays) || 0 }));
  } catch { /* 写不进去顶多下次不记得，不该为这个把功能带崩 */ }
}

function loadTasks() {
  try {
    const rows = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

/** 台账从当前进程表现场生成：进程没了就是从台账划掉，不留死条目。 */
function saveTasks(store) {
  const rows = [...store.procs.values()].map((proc) => ({
    id: proc.id, name: proc.name, srcPath: proc.srcPath, execPath: proc.execPath,
    copyPath: proc.copyPath || '', codec: proc.codec, cmdPid: proc.cmdPid || 0,
    launcherPid: proc.launcherPid || 0, logPath: proc.logPath, startedAt: proc.startedAt,
    // b39：日志文件也记一笔，DSH 重启认领回来时接着写同一份，不把一次运行切成两个文件
    logFile: (proc.writer && proc.writer.file) || proc.logFile || '',
    logDurOff: (proc.writer && proc.writer.durOff) || 0,
    logT0: (proc.writer && proc.writer.t0) || 0,
  }));
  try {
    fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch (err) {
    store.local.lastError = `任务台账写不下去：${String(err && err.message || err)}`;
  }
}

/** 一段副本字节进面板：增量解码，多字节字符跨块也不会裂成半个。 */
function emitBytes(store, proc, chunk) {
  if (!chunk || !chunk.length) return;
  let text = '';
  try { text = proc.decoder.decode(chunk, { stream: true }); } catch { text = chunk.toString('latin1'); }
  proc.lineBuf += text.replace(/\r\n?/g, '\n');
  let at = proc.lineBuf.indexOf('\n');
  while (at >= 0) {
    const line = proc.lineBuf.slice(0, at);
    proc.lineBuf = proc.lineBuf.slice(at + 1);
    pushLocal(store, proc.id, proc.name, line);
    at = proc.lineBuf.indexOf('\n');
  }
}

/** 收尾时把最后一行没有换行符的尾巴也放出来，别吞掉脚本临死前写的那半行。 */
function flushTailLine(store, proc) {
  const rest = proc.lineBuf.replace(/\r/g, '').replace(/\n+$/, '');
  proc.lineBuf = '';
  if (rest) pushLocal(store, proc.id, proc.name, rest);
}

/** 读一轮副本：按 proc.offset 接着上次读的地方往下，只读新长出来的那段。 */
function tailLog(store, proc) {
  let size = 0;
  try { size = fs.statSync(proc.logPath).size; } catch { return; }
  if (size < proc.offset) {
    // 副本被换过或被截断（外部手段或磁盘清理）：从文件头重新读，并明说一句丢了内容
    proc.offset = 0;
    proc.lineBuf = '';
    pushLocal(store, proc.id, proc.name, '（副本被换过或截断了，从文件头重新读，中间那段丢了）', { k: 'copyRestarted' });
  }
  let start = proc.offset;
  if (proc.replay) start = Math.max(0, size - REPLAY_WINDOW);   // 认领来的只回放末尾这一段
  proc.offset = start;
  if (size <= start) { proc.replay = false; return; }
  const len = Math.min(size - start, 256 * 1024);
  const buf = Buffer.alloc(len);
  let fd = 0;
  let got = 0;
  try {
    fd = fs.openSync(proc.logPath, 'r');
    got = fs.readSync(fd, buf, 0, len, start);
  } catch (err) {
    proc.tailErr = String(err && err.message || err);
    return;
  } finally {
    if (fd) try { fs.closeSync(fd); } catch { /* 已经关了 */ }
  }
  proc.offset += got;
  let slice = buf.subarray(0, got);
  if (proc.replay) {
    // 从窗口中间起读，头一段多半是半行，丢掉再解，免得进来一个残字符
    const nl = slice.indexOf(0x0a);
    if (nl >= 0 && start > 0) slice = slice.subarray(nl + 1);
    proc.replay = false;
  }
  emitBytes(store, proc, slice);
  if (size > COPY_WARN_BYTES && !proc.capWarned) {
    // cmd 正握着副本，外部截不断（实测 EBUSY），所以只把话说在前面，不动它的文件
    proc.capWarned = true;
    pushLocal(store, proc.id, proc.name,
      `（副本已超 ${Math.round(COPY_WARN_BYTES / 1024 / 1024)} MB：面板只留最近 ${store.local.keep} 行，脚本停下时这份会被删掉）`,
      { k: 'copyOverCap', p: { mb: Math.round(COPY_WARN_BYTES / 1024 / 1024), keep: store.local.keep } });
  }
}

function startProc(store, entry) {
  const srcPath = String(entry && entry.path || '').trim();
  if (!srcPath) throw new Error('没有脚本路径');
  if (!RUN_EXTS.has(path.extname(srcPath).toLowerCase())) {
    throw new Error('只能运行 .bat / .cmd 脚本：' + srcPath);
  }
  let stat;
  try { stat = fs.statSync(srcPath); } catch { throw new Error('脚本不存在：' + srcPath); }
  if (!stat.isFile()) throw new Error('这不是文件：' + srcPath);

  const plan = planEncoding(srcPath);
  const dir = path.dirname(srcPath);
  let execPath = srcPath;
  let copyPath = '';
  if (plan.needsCopy) {
    const stem = path.basename(srcPath, path.extname(srcPath));
    copyPath = path.join(dir, `${stem}.brl-${process.pid}.bat`);
    toGbkCopy(plan.text, copyPath);
    execPath = copyPath;
  }

  // 副本文件先建一个空的：脚本的屏幕输出由 cmd 自己在命令行里 >> 进来，宿主只看这个文件。
  // 于是宿主不在了，脚本也不会有"写不进去"这回事——b21 就是为了这一条（以前宿主一没，
  // cmd 下一次 echo 就把自己中止，实测只多写一拍）。
  // stdin 这一头留给看门狗用（b23）：宿主往里写「走了以后带不带脚本」的意图字母，脚本本体
  // 自己的 stdin 在命令行里直接接 NUL，所以 bat 里的 pause/set /p 都不会去抢这根管道。
  // stdout ignore（cmd 的输出已经自己拐进副本），stderr 也 ignore：以前留着是想抄启动器的
  // 抱怨，但那根管道一断启动器自己会崩，不如不要。
  ensureRunLogDir();
  const stampSeed = `${process.pid}-${Date.now()}`;
  const pidFile = path.join(os.tmpdir(), `${PLUGIN}-cmd-${stampSeed}.txt`);
  const exitFile = path.join(os.tmpdir(), `${PLUGIN}-exit-${stampSeed}.txt`);
  const logPath = runLogPath(path.basename(srcPath));
  for (const file of [pidFile, exitFile]) { try { fs.rmSync(file, { force: true }); } catch { /* 本来就不在 */ } }
  try { fs.writeFileSync(logPath, ''); } catch (err) {
    if (copyPath) { try { fs.rmSync(copyPath, { force: true }); } catch {} }
    throw new Error('副本文件建不起来：' + String(err && err.message || err));
  }
  const encoded = Buffer.from(launcherScript(execPath, dir, pidFile, logPath, exitFile, !!store.haltOnExit), 'utf16le').toString('base64');
  const child = spawn('powershell.exe', [...PS_ARGS, encoded], {
    cwd: dir, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
  });

  // 启动时先把当下的勾选写过去，别等第一个心跳周期——窄窗口里宿主可能马上就走了。
  // 这根管道随时可能先没（脚本跑完、启动器退出），往里写字节会 EPIPE：不挂个 error 监听
  // 它会变成未捕获异常，把整个宿主掀掉。
  if (child.stdin) child.stdin.on('error', () => {});
  writeIntent(child, store.haltOnExit);

  const proc = {
    id: String(entry.id || srcPath), name: String(entry.name || path.basename(srcPath)),
    srcPath, execPath, copyPath, codec: plan.codec, child, pid: child.pid,
    decoder: new TextDecoder(plan.codec, { fatal: false }), lineBuf: '',
    stopping: false, startedAt: stamp(new Date()), exitPromise: null, done: null,
    detached: false, cmdPid: 0, pidFile, logPath, offset: 0, replay: false,
    launcherPid: child.pid, adopted: false, finished: false, exitFile,
    tailTimer: null, adoptTimer: null, pidTimer: null, intentTimer: null, aliveTimer: null,
    capWarned: false, tailErr: '', launcherErr: '',
  };
  proc.exitPromise = new Promise((resolve) => { proc.done = resolve; });
  store.procs.set(proc.id, proc);
  // 保存开着就先建文件、写头，再写「已启动」——这样日志文件第一行之后紧跟的就是启动那条
  proc.writer = openLogWriter(store, proc);
  pushLocal(store, proc.id, proc.name, `已启动 ${srcPath}${plan.needsCopy ? '（GBK 副本 ' + path.basename(copyPath) + '）' : ''}`,
    plan.needsCopy ? { k: 'startedCopyLine', p: { path: srcPath, copy: path.basename(copyPath) } }
                   : { k: 'startedLine', p: { path: srcPath } });
  saveTasks(store);

  // 心跳：每半秒把当下的勾选写进管道。中途改勾选不用重启也不用重跑脚本——下一个心跳就换字母，
  // 启动器只在管道断掉那一刻按收到的最后一个字母决定去留。
  proc.intentTimer = setInterval(() => { writeIntent(child, store.haltOnExit); }, INTENT_MS);
  if (proc.intentTimer.unref) proc.intentTimer.unref();

  // 脚本本体什么时候算结束：cmd 自己写的退出码文件出现了（最准，只有 bat 真跑完才会有），
  // 或者判活说不在了（兜底，比如 bat 里写 exit 让 cmd 直接走掉、echo 就没跑）。两个都查是因为
  // pid 会被别的进程捡走复用：光看 pid 能把早就结束的任务当成还在跑。
  proc.aliveTimer = setInterval(() => {
    if (proc.finished || proc.stopping) return;
    const code = readExitCode(proc.exitFile);
    if (code !== null) { finishProc(store, proc, `进程结束（退出码 ${code}）`, code, null, { k: 'endedAtExit', p: { why: { k: 'whyCode', p: { code: code } } } }); return; }
    if (proc.cmdPid && !pidAlive(proc.cmdPid)) {
      finishProc(store, proc, '进程结束（退出码 未知：脚本本体不在了）', null, null, { k: 'endedUnknownGone' });
    }
  }, ADOPT_POLL_MS);
  if (proc.aliveTimer.unref) proc.aliveTimer.unref();

  // 把脚本本体（cmd）的真 pid 读回来：启动器把它写进 pidFile 也要一两秒，所以轮询。
  // 它是「退出即停」和重启认领两把刀共同的把手，所以一读到就立刻记进台账。
  let polls = 0;
  const pidTimer = setInterval(() => {
    polls += 1;
    if (proc.cmdPid || polls > 45) { clearInterval(pidTimer); return; }
    try {
      const n = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (Number.isFinite(n) && n > 0) { proc.cmdPid = n; clearInterval(pidTimer); saveTasks(store); }
    } catch { /* 启动器还没写出来 */ }
  }, 120);
  if (pidTimer.unref) pidTimer.unref();
  proc.pidTimer = pidTimer;

  const tailTimer = setInterval(() => { tailLog(store, proc); }, TAIL_MS);
  if (tailTimer.unref) tailTimer.unref();
  proc.tailTimer = tailTimer;
  tailLog(store, proc);

  child.once('error', (error) => {
    const message = String(error && error.message || error);
    store.local.lastError = `${proc.name}：${message}`;
    finishProc(store, proc, `启动失败：${message}`, 'error', null, { k: 'hostStartFailed', p: { msg: message } });
  });

  child.once('exit', (code, signal) => {
    const why = signal ? `信号 ${signal}` : `退出码 ${code}`;
    const whyNote = signal ? { k: 'whySignal', p: { signal: signal } } : { k: 'whyCode', p: { code: code } };
    finishProc(store, proc, proc.stopping ? `已停止（${why}）` : `进程结束（${why}）`, code, signal,
      proc.stopping ? { k: 'stoppedAtExit', p: { why: whyNote } } : { k: 'endedAtExit', p: { why: whyNote } });
  });

  return proc;
}

/** pid 还在不在。找不到返回 false；权限不够算它在（宁可多留一眼，也别误判成已经结束）。 */
function pidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return !(err && err.code === 'ESRCH'); }
}

/** 往启动器那头的管道写当下该用哪种去留意图：K=宿主一走就把脚本带走，N=别管。 */
function writeIntent(child, haltOnExit) {
  const stream = child && child.stdin;
  if (!stream || stream.destroyed || !stream.writable) return;
  try { stream.write(haltOnExit ? 'K' : 'N'); } catch { /* 管道断了，宿主也没几步路了 */ }
}

/** cmd 跑完会把退出码写进这个文件；文件不在或读不出整数就返回 null（不代表失败，只代表还没有）。 */
function readExitCode(file) {
  if (!file) return null;
  try {
    const n = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isInteger(n) ? n : null;
  } catch { return null; }
}

// 两个 pid 都要打：proc.pid 是启动器（PowerShell），proc.cmdPid 是脚本本体（cmd）。
// 平时它们是一棵树上前后脚的两个节点；认领来的任务只有 cmdPid 可用（上一个宿主的启动器
// 早跟 cmd 一起退了），那边 proc.pid 是 0，会自动跳过。
function killTree(proc) {
  const pids = [proc.cmdPid, proc.pid];
  for (const pid of pids) {
    if (!pid) continue;
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
    killer.once('error', () => {});
    killer.once('close', () => {});
  }
}

/** 一个任务收尾：最后再读一轮副本、把结束行报出去、清掉它的临时文件并从台账划掉。 */
function finishProc(store, proc, noteText, code, signal, note) {
  if (proc.finished) return;
  proc.finished = true;
  const timers = [proc.tailTimer, proc.adoptTimer, proc.pidTimer, proc.intentTimer, proc.aliveTimer];
  for (const timer of timers) { if (timer) clearInterval(timer); }
  tailLog(store, proc);                       // 收尾前再读一轮，别把已经落进副本的行漏掉
  flushTailLine(store, proc);
  pushLocal(store, proc.id, proc.name, noteText, note);
  if (!proc.stopping) store.local.lastError = '';
  // 调用方没给退出码时再去 cmd 自己写的那份里捞一把：那句 echo 排在副本写完之后，
  // 所以捞到的就是脚本的真实退出码（bat 里自己 exit 的情况不会有这个文件，才落到「未知」）。
  const real = (code === undefined || code === null) ? readExitCode(proc.exitFile) : code;
  store.local.lastExit = {
    name: proc.name,
    code: signal ? String(signal) : (real === undefined || real === null ? '未知' : real),
    at: stamp(new Date()),
  };
  // 落盘收尾：总时长原地盖上去 + 文末追加结束行（顺序要紧：先让最后几条行进文件，再关）
  proc.logFile = closeLogWriter(proc.writer, {
    at: stamp(new Date()),
    why: signal ? '信号 ' + signal : '退出码 ' + (real === undefined || real === null ? '未知' : real),
  });
  proc.writer = null;
  for (const file of [proc.pidFile, proc.exitFile, proc.copyPath, proc.logPath]) {
    if (!file) continue;
    try { fs.rmSync(file, { force: true }); } catch { /* 本来就不在 */ }
  }
  store.procs.delete(proc.id);
  saveTasks(store);
  proc.done();
}

async function stopProc(store, id) {
  const proc = store.procs.get(id);
  if (!proc) return false;
  proc.stopping = true;
  killTree(proc);
  if (proc.adopted) {
    // 认领来的任务手里没有管道可等，只能盯 pid 消失：taskkill 之后一般一两拍就没了，
    // 最多等 5 秒就按「已停止」收尾。
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!pidAlive(proc.cmdPid)) {
        finishProc(store, proc, '已停止（退出码 未知：它是被「停止」带走的）', null, 'SIGKILL', { k: 'stoppedUnknownByStop' });
        break;
      }
    }
  }
  await proc.exitPromise;
  return true;
}

function killAllSync(store) {
  for (const proc of store.procs.values()) {
    for (const pid of [proc.cmdPid, proc.pid]) {
      if (!pid) continue;
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true, timeout: 2000 });
      } catch {}
    }
  }
}

/**
 * 现在有哪些 cmd 的命令行里带着副本目录的路径。带这个路径就等于「本插件起的、而且还在跑」，
 * 比单看 pid 可靠得多——pid 会被别的进程复用顶包，命令行里的路径不会。
 * 结果用 UTF-8 文件回传，不靠 PowerShell 的 stdout（它一旦掺进 CLIXML 就不可信了）。
 */
function liveCmdLines() {
  const outFile = path.join(os.tmpdir(), `${PLUGIN}-live-${process.pid}-${Date.now()}.txt`);
  const script = [
    '$dir = ' + psQuote(RUN_LOG_DIR),
    '$out = ' + psQuote(outFile),
    '$rows = @(Get-CimInstance Win32_Process -Filter "Name=\'cmd.exe\'" | Where-Object { $_.CommandLine -and ($_.CommandLine -like (\'*\' + $dir + \'*\')) } | ForEach-Object { [string]$_.ProcessId + [char]9 + $_.CommandLine })',
    '[System.IO.File]::WriteAllLines($out, $rows, (New-Object System.Text.UTF8Encoding($false)))',
  ].join('\n');
  return runPowerShellAsync(script, 15000).then(() => {
    const rows = [];
    try {
      const text = fs.readFileSync(outFile, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf('\t');
        if (at <= 0) continue;
        const pid = Number(line.slice(0, at));
        if (Number.isFinite(pid) && pid > 0) rows.push({ pid, cmd: line.slice(at + 1) });
      }
    } catch { /* 查不到就当没有 */ }
    try { fs.rmSync(outFile, { force: true }); } catch { /* 本来就不在 */ }
    return rows;
  }).catch(() => []);
}

function logInUse(lines, fullPath) {
  for (const row of lines) if (row.cmd && row.cmd.indexOf(fullPath) >= 0) return true;
  return false;
}

/** 认领：把上次退出时还在跑的任务接回来，继续读它的副本、继续按 pid 能停它。 */
function adoptProc(store, task, pid) {
  const codec = task.codec === 'utf-8' ? 'utf-8' : 'gbk';
  const proc = {
    id: String(task.id), name: String(task.name), srcPath: String(task.srcPath),
    execPath: String(task.execPath || task.srcPath), copyPath: String(task.copyPath || ''),
    codec, decoder: new TextDecoder(codec, { fatal: false }), lineBuf: '',
    stopping: false, startedAt: String(task.startedAt || stamp(new Date())),
    exitPromise: null, done: null, detached: false,
    cmdPid: pid, pid: 0, launcherPid: 0, child: null, pidFile: '',
    logPath: String(task.logPath), offset: 0, replay: true, adopted: true, finished: false,
    tailTimer: null, adoptTimer: null, pidTimer: null, capWarned: false, tailErr: '', launcherErr: '',
  };
  proc.exitPromise = new Promise((resolve) => { proc.done = resolve; });
  store.procs.set(proc.id, proc);
  // 认领回来的接着写上次那份日志文件（存在就 append，不存在就当新文件重新建头）
  proc.writer = openLogWriter(store, proc, { file: task.logFile, durOff: task.logDurOff, t0: task.logT0 });
  proc.tailTimer = setInterval(() => { tailLog(store, proc); }, TAIL_MS);
  if (proc.tailTimer.unref) proc.tailTimer.unref();
  proc.adoptTimer = setInterval(() => {
    if (pidAlive(proc.cmdPid)) return;
    finishProc(store, proc, '进程结束（退出码 未知：它在 DSH 关着的那段时间里结束了）', null, null, { k: 'endedUnknownWhileClosed' });
  }, ADOPT_POLL_MS);
  if (proc.adoptTimer.unref) proc.adoptTimer.unref();
  tailLog(store, proc);        // 先把"退出前的画面"放出来，别给用户一个空面板
  // 这句说明放在回放之后推：回放动辄几十行，先推的那句会被环形缓冲挤掉，用户反倒看不见它
  pushLocal(store, proc.id, proc.name, `已接上 DSH 重启前就在跑的 ${proc.name}（脚本 pid ${pid}）`,
    { k: 'reclaimedLine', p: { name: proc.name, pid: pid } });
  return proc;
}

/**
 * DSH 起来时做一次：把上次退出时还在跑的任务认领回来，并把没有任何进程握着的副本清掉。
 * 台账里划掉的、以及目录里没人握的副本都删——磁盘不能因为跑过很多 bat 就一直涨。
 */
export async function adoptTasks(store) {
  const tasks = loadTasks();
  ensureRunLogDir();
  const lines = await liveCmdLines();
  const alive = [];
  const strays = [];      // 勾了「退出即停」却还活着的：上一代没带走（宿主多半是被强杀的），这一代补一刀
  for (const task of tasks) {
    if (!task || typeof task.logPath !== 'string' || !task.logPath) continue;
    const row = lines.find((r) => r.cmd.indexOf(task.logPath) >= 0);
    if (!row) {
      for (const file of [task.logPath, task.copyPath]) {     // 进程已经没了：副本和 GBK 副本一起清
        if (!file) continue;
        try { fs.rmSync(file, { force: true }); } catch { /* 本来就不在 */ }
      }
      continue;
    }
    if (!store.haltOnExit) { alive.push({ task, pid: row.pid }); continue; }
    strays.push({ task, pid: row.pid });
  }
  let names = [];
  try { names = fs.readdirSync(RUN_LOG_DIR); } catch { /* 目录还没建 */ }
  for (const entry of names) {
    if (!/\.log$/i.test(entry)) continue;
    const full = path.join(RUN_LOG_DIR, entry);
    if (logInUse(lines, full)) continue;                    // 还有脚本握着它，别删
    if (alive.some((row) => row.task.logPath === full)) continue;
    try { fs.rmSync(full, { force: true }); } catch { /* 别人正删 */ }
  }
  for (const row of alive) adoptProc(store, row.task, row.pid);
  for (const row of strays) {
    await sweepOrphan(row.task, row.pid);
    pushLocal(store, row.task.id, row.task.name,
      `已按「退出 DSH 时停止」收掉上一代没带走的 ${row.task.name}（脚本 pid ${row.pid}）`,
      { k: 'haltedLine', p: { name: row.task.name, pid: row.pid } });
  }
  saveTasks(store);
  return alive.length;
}

/** 把「勾了退出即停却还活着」的残留收掉：先杀干净，等它咽气放开副本句柄，再把副本删掉。 */
async function sweepOrphan(task, pid) {
  for (const victim of [pid, task.launcherPid]) {
    if (!victim) continue;
    try { spawnSync('taskkill', ['/F', '/T', '/PID', String(victim)], { windowsHide: true, timeout: 4000 }); }
    catch { /* 进程早就没了 */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 400));  // 等进程真咽气：cmd 还握着 >> 时删不掉
  for (const file of [task.logPath, task.copyPath]) {
    if (!file) continue;
    try { fs.rmSync(file, { force: true }); } catch { /* 本来就不在 */ }
  }
}

// 原生文件对话框：能拿到 electron 的 dialog 就用它，否则退回 PowerShell 的
// WinForms OpenFileDialog。结果用 base64 回传，绕开控制台代码页对中文的干扰。
async function loadElectronDialog() {
  if (!process.versions.electron) return null;
  try {
    const mod = await import('electron');
    const dialog = mod.dialog || (mod.default && mod.default.dialog);
    return dialog && typeof dialog.showOpenDialog === 'function' ? dialog : null;
  } catch { return null; }
}

// 对话框结果怎么拿回来——实机踩过的坑：PowerShell 往 stdout 写 base64 这条路，在真的弹出对话框之后
// 会被控制台塞进来的东西污染（同样的脚本不弹框时 stdout 干净，弹框后解出来全是 U+FFFD）。
// 所以改成让 PowerShell 把选中的路径写进一个 UTF-8 临时文件，宿主读文件，完全不碰控制台；
// stdout 里的 base64 只当兜底，并且要在杂串里挑出合法的那一段、解完还带替换字符就当没拿到。
export function readPickResult(tmpText, stdoutText) {
  const clean = (value) => {
    const text = String(value == null ? '' : value).replace(/^\uFEFF/, '').trim();
    if (!text || text.indexOf('\uFFFD') >= 0) return null;
    return text;
  };
  const fromTmp = clean(tmpText);
  if (fromTmp) return fromTmp;
  const chunks = String(stdoutText || '').match(/[A-Za-z0-9+/]{16,}={0,2}/g);
  if (!chunks) return null;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const fromB64 = clean(Buffer.from(chunks[i], 'base64').toString('utf8'));
    if (fromB64) return fromB64;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 预热选文件框（b32）：点一次新起一个 PowerShell 要 ~1 秒（引擎 ~0.65s + 加载 WinForms ~0.2s）。
// 设置窗一打开，宿主就先起一个已经把 WinForms 加载好、停在 ReadLine 上的常驻 PowerShell；
// 点「选择文件」只往里写一行请求，对话框立刻就能弹。窗一关（或这次选完）就关它的 stdin，
// 循环读到 null 自己退，不白占内存。
// 请求/结果全程 base64 + 文件：stdin 上是纯 ASCII，选中的路径由 PowerShell 写 UTF-8 文件回来
// （b19 的教训：真弹过对话框之后 stdout 不可信）。
// 预热没就绪、进程死了、或者根本没打开过设置窗 → 退回原来那条冷路径，行为不变。
// ---------------------------------------------------------------------------
// 对话框必须**有 owner 且压在用户正在看的那个窗口上**。实机踩过：预热进程里无 owner 的
// ShowDialog 会把窗口建在屏幕左上角、还拿不到前台（点击后的前台锁），被 Everything / 浏览器
// 整个盖住——用户看到的就是"点了没反应"。owner 取请求当下的前台窗口（就是用户刚点的 DSH 面板），
// 自己进程里再包一个 IWin32Window 把句柄递过去，跨进程 owner 是允许的。
function ownerHelperLines() {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'try {',
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Windows.Forms;',
    'public static class BrlPick {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '}',
    'public class BrlOwner : IWin32Window {',
    '  private IntPtr h;',
    '  public BrlOwner(IntPtr v) { h = v; }',
    '  public IntPtr Handle { get { return h; } }',
    '}',
    '"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing',
    '} catch {}',
    'function GetOwner() {',
    '  try {',
    '    $h = [BrlPick]::GetForegroundWindow()',
    '    if ($h -ne [IntPtr]::Zero) { return (New-Object BrlOwner($h)) }',
    '  } catch {}',
    '  return $null',
    '}',
  ];
}

export function pickerScript(readyFile) {
  return [
    '$ErrorActionPreference = "Continue"',
    ...ownerHelperLines(),
    '$ready = ' + psQuote(readyFile),
    'try { [System.IO.File]::WriteAllText($ready, "1") } catch {}',
    '$reader = [Console]::In',
    'while ($true) {',
    '  $line = $reader.ReadLine()',
    '  if ($line -eq $null) { break }',
    '  $parts = $line.Split(" ")',
    '  if ($parts.Length -lt 3) { continue }',
    '  $dir = ""',
    '  $res = ""',
    '  try { $dir = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1])) } catch {}',
    '  try { $res = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2])) } catch {}',
    '  if (-not $res) { continue }',
    '  $out = ""',
    '  try {',
    '    $dlg = New-Object System.Windows.Forms.OpenFileDialog',
    '    $dlg.Filter = "Batch files (*.bat;*.cmd)|*.bat;*.cmd|All files (*.*)|*.*"',
    '    $dlg.Title = "Select a BAT script"',
    '    $dlg.Multiselect = $false',
    '    $dlg.CheckFileExists = $true',
    '    if ($dir -and (Test-Path -LiteralPath $dir)) { $dlg.InitialDirectory = $dir }',
    '    try { [System.IO.File]::WriteAllText($res + ".open", "1") } catch {}',
    '    $owner = GetOwner',
    '    if ($owner) { $r = $dlg.ShowDialog($owner) } else { $r = $dlg.ShowDialog() }',
    '    if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $out = $dlg.FileName }',
    '    $dlg.Dispose()',
    '  } catch {}',
    '  try { [System.IO.File]::WriteAllText($res, $out, (New-Object System.Text.UTF8Encoding($false))) } catch {}',
    '}',
  ].join('\n');
}

function startPicker(store) {
  if (store.picker && !store.picker.dead) return store.picker;
  const readyFile = path.join(os.tmpdir(), `${PLUGIN}-picker-${process.pid}-${Date.now()}.ready`);
  try { fs.rmSync(readyFile, { force: true }); } catch { /* 本来就不在 */ }
  const encoded = Buffer.from(pickerScript(readyFile), 'utf16le').toString('base64');
  const child = spawn('powershell.exe', [...PS_ARGS, encoded], {
    cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.stdin.on('error', () => {});
  const picker = { child, readyFile, ready: false, dead: false, seq: 0, pending: null, closing: false, readyTimer: null };
  store.picker = picker;
  let polls = 0;
  picker.readyTimer = setInterval(() => {
    polls += 1;
    if (picker.dead) { clearInterval(picker.readyTimer); return; }
    try {
      if (fs.existsSync(readyFile)) {
        picker.ready = true;
        clearInterval(picker.readyTimer);
        fs.rmSync(readyFile, { force: true });
        return;
      }
    } catch { /* 下一拍再看 */ }
    if (polls > 100) clearInterval(picker.readyTimer);   // 10 秒还没就绪就当没预热，点击走冷路径
  }, 100);
  if (picker.readyTimer.unref) picker.readyTimer.unref();
  child.once('exit', () => {
    picker.dead = true;
    if (picker.readyTimer) clearInterval(picker.readyTimer);
    try { fs.rmSync(readyFile, { force: true }); } catch { /* 本来就不在 */ }
    const p = picker.pending;
    picker.pending = null;
    if (p) p.finish(undefined);
    if (store.picker === picker) store.picker = null;
  });
  child.once('error', () => {
    picker.dead = true;
    if (store.picker === picker) store.picker = null;
  });
  return picker;
}

function stopPickerNow(store, picker) {
  try { picker.child.stdin.end(); } catch { /* 已经关了 */ }
  if (store.picker === picker) store.picker = null;
}

function stopPicker(store) {
  const picker = store.picker;
  if (!picker) return;
  // 对话框还开着：等这次选完再收，别在别人正挑文件时把进程抽走
  if (picker.pending) { picker.closing = true; return; }
  stopPickerNow(store, picker);
}

/** 用预热好的进程选一次；返回 undefined = 预热不可用（调用方走冷路径），空串 = 用户取消。 */
async function pickViaWarm(store, dir) {
  const picker = store.picker;
  if (!picker || picker.dead) return undefined;
  if (!picker.ready) {
    const deadline = Date.now() + 5000;
    while (!picker.ready && !picker.dead && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (picker.dead || !picker.ready || picker.pending) return undefined;
  const id = ++picker.seq;
  const resFile = path.join(os.tmpdir(), `${PLUGIN}-pickres-${process.pid}-${Date.now()}-${id}.txt`);
  try { fs.rmSync(resFile, { force: true }); } catch { /* 本来就不在 */ }
  const line = id + ' ' + Buffer.from(String(dir || ''), 'utf8').toString('base64')
    + ' ' + Buffer.from(resFile, 'utf8').toString('base64') + '\n';
  let finish = null;
  const outcome = new Promise((resolve) => { finish = resolve; });
  picker.pending = { finish };
  try { picker.child.stdin.write(line); } catch { picker.pending = null; return undefined; }
  const started = Date.now();
  const openFile = resFile + '.open';
  let opened = false;
  const tick = () => {
    if (!picker.pending) return;                 // 进程挂了，exit 里已经替我们收过
    let text = null;
    try { text = fs.readFileSync(resFile, 'utf8'); } catch { /* 还没写出来 */ }
    if (text !== null) { finish(text); return; }
    if (!opened) {
      try { if (fs.existsSync(openFile)) opened = true; } catch { /* 下一拍再看 */ }
      // 8 秒还没见到「对话框已弹出」：这条预热路不可靠，收掉它、退回冷路径（别把点击卡 5 分钟）
      if (!opened && Date.now() - started > 8000) { finish(undefined); return; }
    }
    if (Date.now() - started > 5 * 60 * 1000) { finish(undefined); return; }
    setTimeout(tick, 40);
  };
  tick();
  const text = await outcome;
  picker.pending = null;
  try { fs.rmSync(resFile, { force: true }); } catch { /* 删不掉算了，反正在 tmp 里 */ }
  try { fs.rmSync(openFile, { force: true }); } catch { /* 同上 */ }
  if (text === undefined) { if (!picker.dead) stopPickerNow(store, picker); return undefined; }
  const picked = String(text).replace(/^\uFEFF/, '').trim();
  if (picker.closing) { picker.closing = false; stopPickerNow(store, picker); }
  return picked;
}

function handleWarm(store, payload) {
  if (payload && payload.on === false) stopPicker(store);
  else startPicker(store);
  return { snapshot: snapshot(store, payload && payload.since), warm: !!store.picker };
}

async function pickViaPowerShell(startDir) {
  const tmp = path.join(os.tmpdir(), PLUGIN + '-pick-' + process.pid + '-' + Date.now() + '.txt');
  const script = [
    ...ownerHelperLines(),
    `$dir = ${psQuote(startDir || '')}`,
    `$tmp = ${psQuote(tmp)}`,
    'if (-not (Test-Path -LiteralPath $dir)) { $dir = (Get-Location).Path }',
    '$dlg = New-Object System.Windows.Forms.OpenFileDialog',
    '$dlg.Filter = "Batch files (*.bat;*.cmd)|*.bat;*.cmd|All files (*.*)|*.*"',
    '$dlg.Title = "Select a BAT script"',
    '$dlg.Multiselect = $false',
    '$dlg.CheckFileExists = $true',
    '$dlg.InitialDirectory = $dir',
    '$owner = GetOwner',
    'if ($owner) { $r = $dlg.ShowDialog($owner) } else { $r = $dlg.ShowDialog() }',
    'if ($r -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [System.IO.File]::WriteAllText($tmp, $dlg.FileName, [System.Text.Encoding]::UTF8)',
    '}',
  ].join('\n');
  const result = await runPowerShellAsync(script, 5 * 60 * 1000);
  let tmpText = '';
  try { if (fs.existsSync(tmp)) tmpText = fs.readFileSync(tmp, 'utf8'); } catch { /* 读不到就走兜底 */ }
  try { fs.unlinkSync(tmp); } catch { /* 临时文件删不掉就算了，反正在 tmp 里 */ }
  return readPickResult(tmpText, result.out);
}

// 系统文件选择框里的标题和文件类型名也算屏上文案：浏览器半把当下的界面语言随请求带过来，这里按它出话。
// 表里没有这门语言就退英文（和浏览器半那张表的兜底口径一致）；zh 开头按地区分简繁。
const DIALOG_TEXT = {
  'zh-CN': { title: '选择 BAT 脚本', batch: '批处理', all: '所有文件' },
  'zh-TW': { title: '選取 BAT 腳本', batch: '批次處理', all: '所有檔案' },
  en: { title: 'Select a BAT script', batch: 'Batch files', all: 'All files' },
  ja: { title: 'BAT スクリプトを選択', batch: 'バッチ ファイル', all: 'すべてのファイル' },
  ko: { title: 'BAT 스크립트 선택', batch: '배치 파일', all: '모든 파일' },
  de: { title: 'BAT-Skript auswählen', batch: 'Batchdateien', all: 'Alle Dateien' },
  fr: { title: 'Sélectionner un script BAT', batch: 'Fichiers batch', all: 'Tous les fichiers' },
  ru: { title: 'Выберите сценарий BAT', batch: 'Пакетные файлы', all: 'Все файлы' },
  it: { title: 'Seleziona uno script BAT', batch: 'File batch', all: 'Tutti i file' },
};
function dlgText(tag) {
  const x = String(tag || '').toLowerCase().replace(/_/g, '-');
  if (DIALOG_TEXT[x]) return DIALOG_TEXT[x];
  if (x.indexOf('zh') === 0) return /(^|-)(tw|hk|mo|hant)/.test(x) ? DIALOG_TEXT['zh-TW'] : DIALOG_TEXT['zh-CN'];
  const base = x.split('-')[0];
  return DIALOG_TEXT[base] || DIALOG_TEXT.en;
}

async function pickFile(store, dir, lang) {
  // 离线自测里没法真点对话框，用环境变量替身（空串代表用户取消）。
  const mock = process.env.DSH_BATRUNNER_LOGS_PICK_MOCK;
  if (mock !== undefined) return mock ? String(mock) : null;
  const startDir = dir && fs.existsSync(String(dir)) ? String(dir) : '';
  // 设置窗开着时宿主已经预热好一个加载完 WinForms 的 PowerShell：点击到弹框基本没有等待。
  const warm = await pickViaWarm(store, startDir);
  if (warm !== undefined) return warm || null;
  const dialog = await loadElectronDialog();
  if (dialog) {
    const dt = dlgText(lang);
    const options = {
      title: dt.title,
      properties: ['openFile'],
      filters: [{ name: dt.batch, extensions: ['bat', 'cmd'] }, { name: dt.all, extensions: ['*'] }],
    };
    if (startDir) options.defaultPath = startDir;
    const result = await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  }
  return pickViaPowerShell(startDir);
}

/** 面板该显示哪一路（b39 用户定档：只显示选中的那个脚本）。
 *  ① 有脚本在跑 → 看选中的那个（选中的没在跑就看第一个在跑的）；
 *  ② 都停了 → **谁最近有输出就看谁**：刚停那个脚本的收尾行、启动失败那句、启动器又推来的新行，
 *     都按 lastAt 比。这条同时保住了 b18「本地全停后接回转发」，又不会让转发缓存霸着屏。 */
function activeChannel(store) {
  if (store.procs.size) {
    const id = store.sel && store.procs.has(store.sel) ? store.sel : [...store.procs.keys()][0];
    const buf = store.bufs.get(id);
    if (buf) return { kind: 'proc', id, name: (store.procs.get(id) || {}).name || '', buf };
  }
  let best = null;
  const consider = (id, kind, buf) => {
    if (!buf || !buf.rows.length) return;
    if (best && buf.lastAt <= best.buf.lastAt) return;
    const tail = buf.rows[buf.rows.length - 1];
    best = { kind, id, name: (tail && tail.name) || '', buf };
  };
  consider('relay', 'relay', store.relay);
  for (const [id, buf] of store.bufs) consider(id, 'proc', buf);
  return best || { kind: 'relay', id: 'relay', name: '', buf: store.relay };
}

/** 增量：客户端带上 {id, seq}，只回它还没有的那些行；续不上（换通道/太旧/比缓冲还新）就整段重发。
 *  1 万行整段重发只在切脚本和刷新时发生，平时每拍几十字节。 */
function logDelta(store, since) {
  const ch = activeChannel(store);
  const buf = ch.buf;
  const rows = buf.rows;
  const out = {
    channel: { kind: ch.kind, id: ch.id, name: ch.name },
    seq: buf.seq,
    first: rows.length ? rows[0].seq : buf.seq + 1,
  };
  const from = since && typeof since === 'object' && String(since.id) === ch.id ? Number(since.seq) : NaN;
  if (!Number.isFinite(from) || from < out.first - 1 || from > buf.seq) {
    out.reset = true;
    out.rows = rows;
  } else {
    out.reset = false;
    out.rows = from >= buf.seq ? [] : rows.filter((r) => r.seq > from);
  }
  return out;
}

function snapshot(store, since) {
  const now = Date.now();
  const dir = store.keepDays ? logDirInfo() : { dir: LOG_DIR, files: 0, bytes: 0, oldest: 0 };
  return {
    connected: store.connected && now - store.lastPingAt < PING_STALE_MS,
    server: store.server,
    entries: store.entries,
    logs: logDelta(store, since),
    lastLineAt: store.lastLineAt,
    lastPingAt: store.lastPingAt,
    reconnects: store.reconnects,
    lastError: store.lastError,
    // 插件自己启动的那一路。running 为真时客户端显示这份行、并且源头已丢掉转发行。
    local: {
      procs: [...store.procs.values()].map((proc) => ({
        id: proc.id, name: proc.name, path: proc.srcPath, execPath: proc.execPath,
        pid: proc.pid, cmdPid: proc.cmdPid, codec: proc.codec, detached: proc.detached,
        stopping: proc.stopping, startedAt: proc.startedAt,
        adopted: !!proc.adopted, logPath: proc.logPath || '', offset: proc.offset || 0,
        lines: store.bufs.has(proc.id) ? store.bufs.get(proc.id).rows.length : 0,
        logFile: (proc.writer && proc.writer.file) || proc.logFile || '',
      })),
      running: store.procs.size > 0,
      sel: store.sel,
      keep: store.keep,
      keepDays: store.keepDays,
      logDir: dir,
      haltOnExit: store.haltOnExit,
      haltStored: !!store.haltStored,     // 这份勾选在磁盘上存过没有（浏览器半据此决定要不要搬旧缓存）
      lastExit: store.local.lastExit,
      lastError: store.local.lastError,
    },
    now,
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) { req.destroy(); throw new Error('rpc channel: request body exceeds limit'); }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function missing(res) { res.writeHead(404); res.end('not found'); }

function reply(res, rpcId, result) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ type: 'server-response', rpcId, result }));
}

function handleRun(store, payload) {
  const entry = payload || {};
  const since = entry.since;
  const id = String(entry.id || entry.path || '');
  const name = String(entry.name || path.basename(String(entry.path || 'bat')));
  if (store.procs.has(id)) return { snapshot: snapshot(store, since), started: false, code: 'already_running', message: '这个条目已经在运行' };
  try {
    startProc(store, { id, name, path: entry.path });
    // 起成功了就把选中挪过去：用户点了「运行」，面板当然要看这一份（b39）
    store.sel = id;
    return { snapshot: snapshot(store, since), started: true, message: '' };
  } catch (err) {
    const message = String(err && err.message || err);
    store.local.lastError = message;
    pushLocal(store, id || '-', name, `启动失败：${message}`, { k: 'hostStartFailed', p: { msg: message } });
    return { snapshot: snapshot(store, since), started: false, message };
  }
}

async function handleStop(store, payload) {
  const since = payload && payload.since;
  const stopped = await stopProc(store, String((payload && payload.id) || ''));
  return { snapshot: snapshot(store, since), stopped, code: stopped ? '' : 'not_running', message: stopped ? '' : '这个条目没有在运行' };
}

async function handlePick(store, payload) {
  const file = await pickFile(store, payload && payload.dir, payload && payload.lang);
  return { snapshot: snapshot(store, payload && payload.since), path: file || '', code: file ? '' : 'no_file', message: file ? '' : '没有选择文件' };
}

function handleCfg(store, payload) {
  const p = payload || {};
  if (typeof p.haltOnExit === 'boolean') {
    store.haltOnExit = p.haltOnExit;
    saveSettings(store);
    store.haltStored = true;            // 写过一次就在这台机器上落了户，别处不再拿旧缓存来覆盖
    // 正在跑的任务不用重启也不用重跑：这里先抢先写一次新意图，之后由心跳接着维持。
    for (const proc of store.procs.values()) writeIntent(proc.child, store.haltOnExit);
  }
  // b39：选中哪个脚本，面板就看哪个的日志（用户点条目时切这里）
  if (typeof p.sel === 'string' && p.sel !== store.sel) store.sel = p.sel;
  // b39：日志落盘保留设置（0 = 不保存，正数 = 保留天数，-1 = 永久）。改了马上生效——正在跑的那些不回溯，下一次运行按新设置走。
  if (p.keepDays !== undefined) {
    const days = Number(p.keepDays);
    const next = KEEP_DAYS.includes(days) ? days : 0;
    if (next !== store.keepDays) {
      store.keepDays = next;
      saveSettings(store);
      if (next > 0) pruneOldLogs(next);
    }
  }
  return {
    snapshot: snapshot(store, p.since), haltOnExit: store.haltOnExit,
    keepDays: store.keepDays, sel: store.sel,
  };
}

async function handleOpenDir() {
  const r = await openLogDir();
  return { ok: !!r.ok, dir: LOG_DIR, via: r.via, err: r.err || '' };
}

async function serve(connection, store, req, res) {
  const rejection = connection.requestRejection(req);
  if (rejection !== void 0) {
    res.writeHead(rejection);
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
    return;
  }
  if (req.method !== 'POST') return missing(res);
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const prefix = `${CHANNEL}/`;
  if (!pathname.startsWith(prefix)) return missing(res);
  const endpoint = pathname.slice(prefix.length);
  if (!endpoint.split('/').every((part) => part !== '' && SEGMENT.test(part))) return missing(res);

  let message;
  try { message = JSON.parse(await readBody(req)); }
  catch { res.writeHead(400); res.end('body is not JSON'); return; }

  const rpcId = typeof message.rpcId === 'string' ? message.rpcId : 'invalid-request';
  if (message.type !== 'client-request' || typeof message.method !== 'string') {
    return reply(res, rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'invalid client-request message', details: {} } });
  }
  if (message.method !== endpoint) {
    return reply(res, rpcId, { ok: false, error: { code: 'gateway/bad-request', message: `unknown method ${message.method}`, details: {} } });
  }
  if (!METHODS.has(endpoint)) {
    return reply(res, rpcId, { ok: false, error: { code: 'gateway/unknown-endpoint', message: endpoint, details: {} } });
  }
  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
  try {
    let value;
    if (endpoint === 'state') value = snapshot(store, payload.since);
    else if (endpoint === 'run') value = handleRun(store, payload);
    else if (endpoint === 'stop') value = await handleStop(store, payload);
    else if (endpoint === 'pick') value = await handlePick(store, payload);
    else if (endpoint === 'warm') value = handleWarm(store, payload);
    else if (endpoint === 'openDir') value = await handleOpenDir();
    else value = handleCfg(store, payload);
    reply(res, rpcId, { ok: true, value });
  }
  catch (err) {
    reply(res, rpcId, { ok: false, error: { code: 'internal', message: String(err && err.message || err), details: {} } });
  }
}

export function apply(ctx, config) {
  const pipeName = process.env.DSH_BATRUNNER_LOGS_PIPE || (config && config.pipeName) || DEFAULT_PIPE;
  // b39：面板内存默认留 1 万行（用户定档「1 万行后滚出内存」），配置里写 keepLines 才改
  const keep = Math.max(4, (config && config.keepLines) || MAX_LINES);
  // 任务表挂在进程级，不挂在这一次 apply 上：DSH 改配置会重新 apply，那时候正在跑的脚本
  // 还得在这张表里，面板才不会突然改口说「没在跑」，退出钩子也才还握得到它们的 pid。
  const store = globalThis[STORE_KEY] || (globalThis[STORE_KEY] = createStore(keep));
  store.keep = keep;
  store.local.keep = keep;
  // 认领要先知道上次的勾选，而浏览器半推值来得比认领晚，所以这里自己去读落盘的那份。
  // b25 起这份是唯一的真相源：浏览器半不再拿自己 profile 的缓存来覆盖它（见 client.js 挂载那段）。
  const settings = loadSettings();
  store.haltOnExit = settings.haltOnExit;
  store.haltStored = settings.stored || store.haltStored;
  // b39：日志落盘保留天数。启动时清一遍超期的（只在新建文件时清的话，长期不跑就永远不清）
  store.keepDays = settings.keepDays;
  if (store.keepDays > 0) pruneOldLogs(store.keepDays);

  ctx.effect(() => watchPipe(ctx, store, pipeName), `${PLUGIN}: pipe client`);

  // DSH 一起来就去认领「上次退出时还在跑」的任务：按台账找还活着的脚本，接上它的副本文件
  // 继续看，并把副本末尾那一段直接画进面板——否则重启后是个空面板，看着就像脚本被 DSH 带走了。
  // 卸载插件时只摘定时器：不杀脚本、也不删副本，副本留给下次认领。
  ctx.effect(() => {
    void adoptTasks(store).catch(() => {});
    return () => {
      for (const proc of store.procs.values()) {
        if (proc.tailTimer) clearInterval(proc.tailTimer);
        if (proc.adoptTimer) clearInterval(proc.adoptTimer);
        // 卸载也要把缓冲刷掉再关文件：留半截 pending 就是白写一场
        if (proc.writer) { closeLogWriter(proc.writer, { why: '插件被卸载（运行未结束）' }); proc.writer = null; }
      }
    };
  }, `${PLUGIN}: adopt tasks`);

  // 这条只是快路径：宿主自己 process.exit 收尾时当场把该收的进程收掉，不用等启动器那边下
  // 一轮判活。它盖不住被 TerminateProcess 强杀的情况——那时候 JS 一行都不会跑（实测，见
  // tools/probe/probe-halt.mjs 的两个 case）。真正靠得住的是启动器那个看门狗：宿主管道一断，
  // 它就按收到的最后一个意图字母动手，跟宿主怎么死没关系。不勾选就什么都不做——b21 之后脚本
  // 的输出落在副本文件里，DSH 走了它也不会因为"写不进去"而自行中止，是真能一直跑（README 记死）。
  const onExit = () => { if (store.haltOnExit) killAllSync(store); };
  process.once('exit', onExit);
  ctx.effect(() => () => process.removeListener('exit', onExit), `${PLUGIN}: exit hook`);

  // webServer / connection 缺席时（例如非 web profile）不挂载，其余功能不受影响。
  ctx.inject(['connection', 'webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: CHANNEL,
      handler: (req, res) => { void serve(scope.connection, store, req, res); },
    }), `${CHANNEL}: rpc channel`);
  });
}
