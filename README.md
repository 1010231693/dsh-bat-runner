# dsh-bat-runner

<p align="center"><img src="icon.svg" width="96" height="96" alt="dsh-bat-runner"></p>

**一个浮在 DSH 界面上的本地脚本日志面板：点一下就能运行 `.bat` / `.cmd`，输出逐字实时显示在面板里——不加时间戳、不分级、不着色。也可以把它接到 BatRunner 启动器上，直接看启动器转发的日志。**

[<img src="assets/screenshot-running.png" width="70%" alt="面板实拍：脚本正在跑，终端日志逐字显示在 DSH 主界面上">](./assets/screenshot-running.png)

[<img src="assets/screenshot-empty.png" width="70%" alt="空面板：没有日志时显示两行引导">](./assets/screenshot-empty.png)

[<img src="assets/screenshot-settings.png" width="70%" alt="设置窗：左半运行 Bat，右半日志外观">](./assets/screenshot-settings.png)

## 它能做什么

- 面板常驻在 DSH 界面上，可拖动、可拉边框改大小；位置与尺寸会被记住。
- **运行 Bat**：从磁盘挑 `.bat` / `.cmd`，条目列表里一键运行 / 停止；「停止」会连它派生的子进程一起结束（Windows 进程树）。
- **显示运行了多久**：正在跑的条目在名字右边挂一枚琥珀色的 `● 已运行 14分35秒`，一秒一格；按「停止」立刻消失。
- **输出逐字显示**：与脚本真实输出完全一致，按面板宽度整行折行，不截断、不加省略号；最新一行永远在最下面。
- **日志外观**：字体、字号 10–20px、颜色、9 种文字光带特效、是否显示外边框；颜色与边框跟随 DSH 的浅色 / 深色外观。
- **自动行为**：「启动 DSH 时自动运行上次选择的脚本」（带 0–60 秒延迟）；「退出 DSH 时同时停止正在运行的脚本」。
- **可选联动**：同时开着 BatRunner 启动器时，面板自动接收启动器转发的日志；不装启动器也能独立运行脚本。

## 安装

- 命令行安装（当前可用）：

  ```bash
  dsh plugin --profile web add dsh-bat-runner
  ```

- 或在 DSH 的「插件市场」搜索 **dsh-bat-runner** 安装（市场收录后可见）。

安装后请**完全退出 DSH 再启动**（`Ctrl+R` 不会重载插件的客户端包）。

## 使用

1. 鼠标移到面板右上角，点齿轮 **⚙** 打开设置窗。
2. 左半「运行 Bat」：点 **选择文件** 挑一个 `.bat` / `.cmd`，再点 **运行**；**点条目那一行就选中它**（选中画蓝底 +
   左侧蓝条，正在跑的画橙框，两者同时可见），下面的「运行选中」跑的就是当前选中的那条。
3. 右半「日志外观」：调字体、字号、颜色、特效与外边框；改动会即时预览，点「保存」才落盘。
4. 运行中的条目不能删，先「停止」再删；「停止」结束的是整棵进程树。

## 兼容与说明

- 仅支持 Windows（依赖 `cmd`、PowerShell 与 `taskkill`）。
- 面板显示脚本原样输出；编码默认按 GBK 解码，脚本里写了 `chcp 65001` 的按 UTF-8。
- 与 BatRunner 启动器的联动是**可选功能**：检测不到启动器时面板显示「未连接 BatRunner」，但「运行 Bat」照常可用。
- 日志默认保留最近 40 行，可在插件的 bundle 配置里调整（`keepLines`）。

## 更新

- **0.2.0**：
  - **条目名旁边显示运行时长**：正在跑的脚本旁边多出一枚 `● 已运行 14分35秒`，一秒一格，带单位（`45秒` /
    `23分45秒` / `1小时23分45秒`）；一按「停止」立刻消失，没在跑的条目什么都不写。DSH 重启后接回来的脚本，
    时长也从启动那一刻接着算，不归零。
  - **点条目行就能换选中**：以前只有点「运行」才会改变选中哪一条，「运行选中」因此常常指着同一条、形同虚设；
    现在点列表里任意一行就选中它（选中是蓝底 + 左侧蓝条），鼠标移上去也变成手型。
  - **选中跟运行一眼分得清**：正在跑的画橙框，被选中的画蓝底；一条既在跑又被选中时两个信号同时看得见，
    不再是"一进运行就看不出选的是它"。
  - **时长不再一下跳 2 秒**：改成按系统秒的整点刷新，每格间隔恒定 1 秒，看着不再忽快忽慢。
  - **屏上不再显示 pid**：那串进程号对用户没用还占地方，改成鼠标悬停面板时在提示里看（优先报脚本本体的）。
- **0.1.0**：首个公开版本。悬浮日志面板、运行 / 停止本地 bat、日志外观设置、外边框开关、空态两行引导、DSH 浅深主题适配。

---

### English

A floating log panel for DeepSeek Harness. Run local `.bat` / `.cmd` scripts from the panel and see their output verbatim (no timestamps, levels or colors), or receive logs forwarded by the BatRunner launcher. Windows only. Install from the DSH plugin market or run `dsh plugin --profile web add dsh-bat-runner`, then fully restart DSH.

## License

MIT
