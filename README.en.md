# dsh-bat-runner

<p align="center"><img src="icon.svg" width="96" height="96" alt="dsh-bat-runner"></p>

<p align="center"><a href="./README.md"><b>简体中文</b></a> · <b>English</b></p>

**A plugin that runs any `.bat` script inside DSH: the terminal log shows up right on the DSH main window. Start and stop it, style the log panel, and drag or resize the panel freely.**

[<img src="assets/screenshot-running.png" width="70%" alt="Live panel: the script is running and its terminal log is printed verbatim on the DSH main window">](./assets/screenshot-running.png)

[<img src="assets/screenshot-empty.png" width="70%" alt="Empty panel: two lines of guidance when no log has arrived yet">](./assets/screenshot-empty.png)

[<img src="assets/screenshot-settings.png" width="70%" alt="Settings window: run Bat on the left, log appearance on the right">](./assets/screenshot-settings.png)

## What it does

- The panel floats on top of the DSH window. Drag it anywhere, resize it from the bottom-right corner; position and size are remembered.
- **Run Bat**: pick a `.bat` / `.cmd` file from disk. Each entry has one-click Run / Stop; **Stop** ends the whole process tree (Windows), not just the script.
- **Shows how long a script has been running**: a running entry carries an amber pill `● 已运行 14分35秒` to the right of its name, ticking once a second, gone the moment you press Stop.
- **Verbatim output**: exactly what the script printed — no timestamps, no levels, no coloring. Long lines wrap at the panel width instead of being truncated or cut with an ellipsis; the newest line is always at the bottom.
- **Log appearance**: font, size 10–20 px, colour, 9 text shine effects, and an outer border toggle; colour and border follow the DSH light / dark theme.
- **Automatic behaviour**: *Run the last selected script when DSH starts* (with a 0–60 s delay), and *stop running scripts when DSH exits*.
- **Optional pairing**: with the BatRunner launcher open, the panel picks up the logs it forwards. The launcher is not required — the plugin runs scripts on its own.

## Install

- From the command line (works today):

  ```bash
  dsh plugin --profile web add dsh-bat-runner
  ```

- Or search **dsh-bat-runner** in the DSH plugin market.

After installing, **quit DSH completely and start it again** (`Ctrl+R` does not reload the plugin's client bundle).

## Usage

1. Hover the top-right corner of the panel and click the gear **⚙** to open the settings window.
2. Left half, **Run Bat**: click **选择文件** to pick a `.bat` / `.cmd`, then click **运行**. **Clicking a row selects it** (selected = blue background + a blue bar on the left; a running entry gets an orange frame, and both signals are visible at once). **运行选中** runs whichever entry is selected.
3. Right half, **日志外观**: tune font, size, colour, effects and the outer border. Changes preview immediately; only **保存** persists them.
4. A running entry cannot be deleted — **停止** first, then **删**. Stop kills the entire process tree.

## Compatibility & notes

- Windows only (it shells out to `cmd`, PowerShell and `taskkill`).
- Output is decoded as GBK by default; a script that runs `chcp 65001` is decoded as UTF-8.
- The panel's own labels are Chinese for now.
- Pairing with the BatRunner launcher is **optional**: without it the panel shows "未连接 BatRunner", but **Run Bat** works normally.
- The panel keeps the last 40 lines by default; raise it with the bundle setting `keepLines`.

## Changelog

- **0.2.0**:
  - **Runtime shown next to the entry name**: a running script carries `● 已运行 14分35秒`, ticking once a second with units (`45秒` / `23分45秒` / `1小时23分45秒`). It disappears the moment you press Stop, and says nothing for an entry that is not running. After a DSH restart, a reclaimed script keeps counting from its original start time.
  - **Click a row to select it**: previously only pressing Run changed the selection, so "Run selected" kept pointing at the same entry. Clicking any row now selects it (blue background + blue left bar), and the cursor turns into a hand.
  - **Selection and running no longer look the same**: running draws an orange frame, selection a blue background; an entry that is both running and selected shows both signals instead of losing one.
  - **No more 2-second jumps in the timer**: the tick is aligned to wall-clock seconds, so each step is exactly 1 second.
  - **pid removed from the panel**: it sat in the way without telling you anything useful; hover the panel to see it in the title (the script's own pid is preferred).
- **0.1.0**: first public release. Floating log panel, run / stop local bat files, log appearance settings, outer-border toggle, two-line empty state, light / dark theme support.

---

<p align="center"><a href="./README.md"><b>中文说明</b></a> · <b>English</b></p>

## License

MIT
