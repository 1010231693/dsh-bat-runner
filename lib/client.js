/**
 * dsh-bat-runner 浏览器半。手写 __ModuleLoader__ 模块，**不经任何构建工具**——
 * 少一套工具链就少一处会随 DSH 升级而坏的地方。
 *
 * 定档形态（用户逐轮确认）：
 *  - 悬浮面板，挂在官方 shell.overlay（list 型、root 作用域）。**只有日志，没有标题栏**：
 *    那条栏和下面的日志格格不入，5 秒隐藏后底色又和 DSH 不一致，用户明确要求整条去掉。
 *    移动：b30 起**左键按住面板任意处就能拖**——不要 Alt，也不要右侧那根把手条（按用户要求整条删掉：
 *    点阵图标和那行底纹文字一起没，屏上不多出任何东西）。两处让位要说清：右下角那块归原生改大小
 *    （按下落在那儿就只做缩放、不拖，判据见 RESIZE_CORNER），齿轮那一颗只负责开设置（按下不拖）。
 *    改大小 = 右下角原生把手，但它和边框同进退：非悬停时 resize 置 none，那个斜线图标跟着隐身
 *    （b9 起，用户点名——离开就没，要拉的时候鼠标一挪过去它就在）。
 *    连接状态与构建号塞进面板的 title（悬停才看得见），不占一个像素。
 *  - 齿轮浮在**右上角**：右下角整个留给改大小，两者不抢同一块地方。齿轮有自己的实底和淡蓝描边
 *    （浮在日志字之上，没实底就看不出是个按钮）；hover 即现、离开 3 秒收起，另加一条——设置窗开着时
 *    齿轮常显（开着就收，用户没法操作）；它的 zIndex 压在日志区与遮罩之上，开着窗也点得动。
 *  - b18 起齿轮点开是**居中窗**（三版布局里用户选的 C 版）：遮罩压住 DSH 其它部分，窗宽 780，
 *    **左半「运行 Bat」、右半「日志外观」**——运行在前、外观在后，这是用户点明的顺序。
 *    遮罩只压别的、不压这一屏：日志行和齿轮的 zIndex 都在遮罩之上，不然"改字号当场映到日志"这种预览
 *    等于自己把自己遮住（日志行 z7、齿轮 z8、遮罩 z6）。
 *    窗仍然是面板的子节点：b14 那条「点外面收起」用 composedPath 判内外，遮罩在面板内不会被它误关，
 *    改由遮罩自己 onClick 关（效果一致：弃草稿、不落盘）。开着时面板 overflow 转 visible，收起即还原。
 *  - 运行侧（条目 / 运行 / 停止 / 两个勾选 / 延迟 / 上次打开的目录）点下去**即时生效并落盘**
 *    localStorage('dsh-batrunner-logs:run')，**不走草稿**，也就不会被「取消」回滚；
 *    外观侧相反：草稿即时映到日志当预览，「取消」整体还原，「保存」才写 localStorage('dsh-batrunner-logs:look')。
 *    例外是「退出即停」这个勾（b25 起）：它说的是宿主进程走了以后脚本还跑不跑，属宿主行为，
 *    真相源在宿主的 settings.json（跟任务台账同目录，换浏览器 profile 也认），这边只留一份展示兜底。
 *  - 日志看哪一路（用户定的口径）：插件自己有正在跑的脚本 → 只看本地这一屏，且启动器转发行在宿主
 *    源头就被丢掉；本地没有在跑 → 照旧显示启动器转发过来的。
 *  - 外观那一半沿用 b16：字体 / 字号(10–20px) / 颜色（第一格「跟随」+ 8 个固定色 + 取色器）/
 *    文字特效与两个勾选（b33 起多一个「显示外边框」，默认开）；「恢复默认」把草稿打回定档默认；窗不会因为鼠标移开或时间到自己关。
 *  - 字号默认 12px（设置里可调 10–20），默认字体 'Cascadia Mono','Consolas'、默认行色 #C9CBD0；
 *    字体预置 21 款（含幼圆、JetBrains Mono、Source Code Pro、思源等宽、Maple Mono 等流行字体；
 *    机器上没装的字体浏览器自动回退，属固有边界）。
 *  - 最新一行在**最下面**（终端顺序）。日志行**整行换行**（b10，用户点名）：宽度不够就折行继续显示，
 *    **不再截断、不再省略号**；"能显示几行"按**换行后的物理行数**判——面板高度只够两行就只显示两行、
 *    只够一行就只显示一行（整行整行地舍，不露半行头）；连最新一行都装不下时仍显示最新一行、由溢出裁掉上部。
 *    行数判据需要知道"这行在当前宽度折成几行"：字体/字号用户可调、还有非等宽字体，按等宽估字宽会算错，
 *    所以用与行**完全同样式**的隐藏测量层实测（见 ensureMeasor / wrapCount），结果按内容缓存。
 *  - 边框只在"鼠标在面板上"或"刚改过尺寸"时显示，其余时刻完全无边框。
 *  - 底色整体**透明**（b7 起由用户改定，原定为实色）：面板只浮文字，不占一层实色底。
 *    面板常态只浮日志文字，不多出任何装饰（齿轮和边框都要鼠标进来才现、离开 3 秒收起）；
 *    背景透明后也去掉了投影（同下）。
 *  - **刷新特效 = 原型 B 版**：最新一行逐字浮现，其余行静止；不论行长 420ms 内一定出完，
 *    新行到达时上一行立刻补全（我们只有整行、没有流式增量，所以是本地演的）。
 *  - **文字特效（探照灯）两条定档（b13，用户点名）**：
 *    ① 多行相位**恒同步**——不再有「同步」开关，各行各跑各的相位就是 bug（b11 踩过）。
 *    ② 第二个勾选是「随日志滚动」：勾上（默认）= 静默够 FX_IDLE_MS（现定 30 秒）后光带**原地暂停**、不消失不回行首，
 *       来新行再从暂停处接着滚；不勾 = 永远循环滚。暂停与 startTime 相位对齐同属 WAAPI（b15 起改用
 *       pause()/play()，CSS animation-play-state 只作无 WAAPI 时的兜底）——两条通道混用会互相唤醒，
 *       见 flowPlaying / syncSignal / flowSig 三处注释。
 *
 * ⚠️ 进度一律按**墙上时间**算，别改成"每拍加 N 个字"：页面被节流时（后台标签、Electron
 *    遮挡）24ms 的定时器会掉到 500ms 以上，按拍累加会把 420ms 的动画拖成好几秒且永远追不上；
 *    按时间算最多个数变粗糙，第一个节拍就直接补全。原型页实测过这个差别。
 *
 * ⚠️ 别退回"挂在会话头部 + JS 量宽"：那会形成"我变宽→标题被截断→我的左端移动→再算一次宽"
 *    的自激环，窗口最小化/还原时布局抖动就振荡，React 抛 maximum update depth 把组件整个卸掉。
 */
window.__ModuleLoader__.load({
  id: 'dsh-bat-runner',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    let react = require('react');

    var h = react.createElement;
    var SLOT = 'shell.overlay';
    // 字体名在这里是 JS 字符串、走 React style 对象，不受 HTML 属性引号截断影响；
    // 但**别改成拼 innerHTML**——原型页就踩过 style="font:12px "X"" 把属性截断的坑。
    var MONO = "'Cascadia Mono','Consolas',ui-monospace,monospace";
    var UI = "'Segoe UI','Microsoft YaHei UI',system-ui,sans-serif";
    var FS = 12;                  // 默认字号（齿轮设置里可调 10–20，这里同时是默认与兜底）
    var LH = FS + 4;              // 默认行高：行高等于字号+4，空行也占一行（minHeight），逐字浮现起步不会让行跳
    var LOOK_KEY = 'dsh-batrunner-logs:look';   // 外观设置：只有点「保存」才写
    // 运行侧：条目列表、当前选中、两个勾选、启动延迟、上次打开对话框的目录。
    // 和外观不同——这些点下去就生效并落盘（"退出即停""开机自动跑"这类事不该等一个「保存」）。
    // —— 界面语言：屏上每一句话都只从这张表里取，换语言就是换表，DOM 结构一行不动 ——
    var LANGS = [
      { code: 'en',    name: 'English' },
      { code: 'zh-CN', name: '简体中文' },
      { code: 'zh-TW', name: '繁體中文' },
      { code: 'ko',    name: '한국어' },
      { code: 'ja',    name: '日本語' },
      { code: 'de',    name: 'Deutsch' },
      { code: 'fr',    name: 'Français' },
      { code: 'ru',    name: 'Русский' },
      { code: 'it',    name: 'Italiano' }
    ];
    var LANG_KEY = 'dsh-batrunner-logs:lang';   // 'auto' = 跟着 DSH 的界面语言走；其余值 = 用户在插件里选过，重启也照旧
    var I18N = {};
    I18N['zh-CN'] = {
      rpcBadResponse: '回包不对（{method}）',
      rpcCallFailed: '{method} 调用失败',
      langNow: '当前：{lang} · {from}',
      langFromHost: '跟随 DSH',
      langFromUser: '插件内自选',
      langFromPreview: '预览中，尚未保存',
      listSep: '、',
      statusPid: 'pid {pid}',
      fxFlowShort: '日志停止生成 {n} 秒后，光带原地暂停；来了新日志自动接着滚',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: '没有启动',
      startedLine: '已启动 {path}',
      startedCopyLine: '已启动 {path}（GBK 副本 {copy}）',
      copyRestarted: '（副本被换过或截断了，从文件头重新读，中间那段丢了）',
      copyOverCap: '（副本已超 {mb} MB：面板只留最近 {keep} 行，脚本停下时这份会被删掉）',
      endedAtExit: '进程结束（{why}）',
      stoppedAtExit: '已停止（{why}）',
      whyCode: '退出码 {code}',
      whySignal: '信号 {signal}',
      whyUnknown: '未知',
      endedUnknownGone: '进程结束（退出码 未知：脚本本体不在了）',
      stoppedUnknownByStop: '已停止（退出码 未知：它是被「停止」带走的）',
      endedUnknownWhileClosed: '进程结束（退出码 未知：它在 DSH 关着的那段时间里结束了）',
      hostStartFailed: '启动失败：{msg}',
      ledgerStuck: '任务台账写不下去：{err}',
      dlgTitle: '选择 BAT 脚本',
      dlgFilterBatch: '批处理',
      dlgFilterAll: '所有文件',
      demoHostLang: 'DSH 设置里的界面语言', demoPluginLang: '插件里的界面语言',
      langLabel: '界面语言', langFollowHost: '跟随 DSH（当前：{lang}）', demoNow: '插件现在用的是：{lang}（{from}）',
      demoNowShort: '{lang} · 来源：{from}', demoFromHost: '跟随 DSH', demoFromUser: '你在插件里选的',
      demoFromHostShort: '跟随 DSH', demoFromUserShort: '插件内自选',
      langHint: '选「跟随 DSH」时，DSH 那边一换语言这里就跟着换；自己在插件里选过就以插件这份为准，重启不失效。窗里的改动只是预览：要点「保存」才留下，点「取消」会退回原样。',
      demoLogUntouched: '面板里那三行是 bat 的原样输出：任何语言都不翻译、不加时间戳、不分级、不着色。',
      capPanelLog: '面板 · 有日志', capPanelEmpty: '面板 · 空态', capPanelWait: '面板 · 已连接等输出', capWin: '设置窗（点齿轮打开）', msgsCap: '插件往屏上写的句子（同样从表里取）',
      panelTitleConnected: 'dsh-bat-runner · 已连启动器 pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · 未连接启动器 · {build}',
      panelTitleLocal: 'dsh-bat-runner · 本地在跑 pid {pid} · {build}',
      panelFooterHint: '左键按住面板任意处拖动，右下角拉边框改大小 · 右上角齿轮打开设置窗（运行脚本 / 外观）',
      gearTitle: '日志设置（运行脚本 / 外观）',
      statusConnecting: '连接中…', statusConnected: '已连接', statusSilent: '静默 {n}s',
      statusDisconnected: '未连接 BatRunner', statusDisconnectedErr: '未连接（{err}）',
      statusLocalRunning: '运行中 {names} · pid {pid}',
      emptyHintNotConnected: '启动器开着时这里显示实时日志 · 也可以点右上角 {gear} 直接运行脚本',
      emptyHintConnected: '等待脚本输出…',
      runTitle: '运行 Bat', runningPill: '已运行 ', timingUnknown: '计时未知',
      durTitle: '从启动到现在的运行时长，每秒刷新',
      durHMS: '{h}小时{m}分{s}秒', durMS: '{m}分{s}秒', durS: '{s}秒',
      run: '运行', stop: '停止', del: '删',
      delTitleRunning: '还在运行：先按「停止」才能删（删只管从列表里移除，不管杀进程）',
      delTitleIdle: '从列表移除这一条（它没在跑，一个进程都不动）',
      runTip: '运行这个脚本，输出直接进面板', stopTip: '结束这个进程，连它派生的子进程一起（taskkill /F /T）',
      pickFile: '选择文件', picking: '选择文件…', pickFileTitle: '打开系统文件选择框，默认停在上次打开的目录',
      runSelected: '运行选中', runSelectedTip: '运行当前选中的那条',
      emptyList: '列表是空的：点下面的「选择文件」从磁盘里挑一个 .bat / .cmd。',
      haltLabel: '退出 DSH 时同时停止正在运行的脚本',
      haltTitle: '勾选：退出 DSH 时把插件启动的脚本连它派生的子进程一起结束。\n不勾选（默认）：DSH 关掉后脚本继续自己跑。',
      haltHint: '默认不勾选。改动只对之后的收尾生效',
      autoLabel: '启动 DSH 时自动运行上次选择的脚本',
      autoTitle: '勾选：DSH 启动后自动运行当前选中的那条。已经有脚本在跑的不会重复启动。',
      autoDelayPrefix: '延迟 ', autoDelaySuffix: ' 秒 · 已有脚本在跑的不再重复跑', autoDelayTitle: '0–60 秒，超出会自动夹回来',
      lastExitLine: '最后退出：{name} · 退出码 {code} · {at}',
      appearanceTitle: '日志外观', fontLabel: '字体', fontFallbackTitle: '机器上没装的字体浏览器会自动回退',
      fontNotMonoSuffix: '（非等宽）', fontCustom: '自定义', sizeLabel: '字号（10–20 px）',
      sizeSmallerTitle: '小一点', sizeLargerTitle: '大一点', colorLabel: '字体颜色',
      colorFixedTitle: '{c}（固定色：深浅两态都是它）', colorFollow: '跟随',
      fxLabel: '文字特效（最新行）', fxAll: '所有行生效', fxFlow: '随日志滚动',
      fxFlowTitle: '日志停止生成 {n} 秒后，光带原地暂停（停在当前画面，不会消失）；来了新日志自动接着滚。\n不勾：不论有没有新日志，光带一直循环滚动。',
      borderToggle: '显示外边框',
      borderToggleTitle: '默认勾选。面板四周常显一条 1px 边框，没有日志时也一眼能找到面板。\n不勾：恢复旧版——只有鼠标移入时才显边。',
      borderHint: '默认勾选。关掉后空面板只剩文字，容易找不到面板',
      restoreDefaults: '恢复默认', cancel: '取消', save: '保存', saveDirty: '保存（有改动）',
      draftHint: '外观这边是草稿预览：改动当场映到日志，取消整体还原，保存才落盘。运行那边点下去就生效并记住，不会被「取消」回滚。',
      fxNone: '无', fxGreen: '绿色光束', fxPurple: '紫色漫射', fxRainbow: '彩虹（绿→黄→橙）',
      fxAurora: '极光（绿→青→蓝→紫）', fxFire: '火焰（红→橙→金）', fxSunset: '日落（粉→金→橙）',
      fxOcean: '深海（冰青→蓝→靛）', fxMint: '薄荷（浅青绿→深青绿）', fxNeon: '电光（蓝→紫→粉）',
      msgPickFailed: '打不开文件框：{err}', msgNoFile: '没有选择文件', msgAlreadyInList: '这个脚本已经在列表里了',
      msgAdded: '已加入列表：{file}', msgDeleted: '已从列表里移除：{path}',
      msgDeleteBlocked: '还在运行：先按「停止」才能从列表里删（这条没有动，脚本也没有被杀）',
      msgAlreadyRunning: '已经有脚本在跑的，这次不重复启动', msgRunFailed: '运行失败：{err}',
      msgStopFailed: '停止失败：{err}', msgNotRunning: '这个条目没有在运行', msgSettingFailed: '这条设置没送出去：{err}',
      reclaimedLine: '已接上 DSH 重启前就在跑的 {name}（脚本 pid {pid}）',
      haltedLine: '已按「退出 DSH 时停止」收掉上一代没带走的 {name}（脚本 pid {pid}）'
    };
    I18N['zh-TW'] = {
      rpcBadResponse: '回包不對（{method}）',
      rpcCallFailed: '{method} 呼叫失敗',
      langNow: '目前：{lang} · {from}',
      langFromHost: '跟隨 DSH',
      langFromUser: '外掛程式內自選',
      langFromPreview: '預覽中，尚未儲存',
      listSep: '、',
      statusPid: 'pid {pid}',
      fxFlowShort: '日誌停止產生 {n} 秒後，光帶原地暫停；來了新日誌自動接著滾',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: '沒有啟動',
      startedLine: '已啟動 {path}',
      startedCopyLine: '已啟動 {path}（GBK 副本 {copy}）',
      copyRestarted: '（副本被換過或截斷了，從檔案頭重新讀，中間那段丟了）',
      copyOverCap: '（副本已超 {mb} MB：面板只留最近 {keep} 行，腳本停下時這份會被刪掉）',
      endedAtExit: '處理程序結束（{why}）',
      stoppedAtExit: '已停止（{why}）',
      whyCode: '結束碼 {code}',
      whySignal: '訊號 {signal}',
      whyUnknown: '未知',
      endedUnknownGone: '處理程序結束（結束碼 未知：腳本本體不在了）',
      stoppedUnknownByStop: '已停止（結束碼 未知：它是被「停止」帶走的）',
      endedUnknownWhileClosed: '處理程序結束（結束碼 未知：它在 DSH 關著的那段時間裡結束了）',
      hostStartFailed: '啟動失敗：{msg}',
      ledgerStuck: '工作臺帳寫不下去：{err}',
      dlgTitle: '選取 BAT 腳本',
      dlgFilterBatch: '批次處理',
      dlgFilterAll: '所有檔案',
      demoHostLang: 'DSH 設定裡的介面語言', demoPluginLang: '外掛程式裡的介面語言',
      langLabel: '介面語言', langFollowHost: '跟隨 DSH（目前：{lang}）', demoNow: '外掛程式現在使用的是：{lang}（{from}）',
      demoNowShort: '{lang} · 來源：{from}', demoFromHost: '跟隨 DSH', demoFromUser: '你在外掛程式裡選定的',
      demoFromHostShort: '跟隨 DSH', demoFromUserShort: '外掛程式內自選',
      langHint: '選「跟隨 DSH」時，DSH 那邊一換語言這裡就跟著換；自己在外掛程式裡選過就以外掛程式這份為準，重新啟動也不會失效。窗內的改動只是預覽：要點「儲存」才會留下，點「取消」會回復原樣。',
      demoLogUntouched: '面板裡那三行是 bat 的原樣輸出：任何語言都不翻譯、不加時間戳、不分級、不上色。',
      capPanelLog: '面板 · 有日誌', capPanelEmpty: '面板 · 空態', capPanelWait: '面板 · 已連線等輸出', capWin: '設定窗（點齒輪開啟）', msgsCap: '外掛程式往螢幕上寫的句子（同樣從表裡取）',
      panelTitleConnected: 'dsh-bat-runner · 已連啟動器 pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · 未連啟動器 · {build}',
      panelTitleLocal: 'dsh-bat-runner · 本機執行中 pid {pid} · {build}',
      panelFooterHint: '左鍵按住面板任意處拖曳，右下角拉邊框改大小 · 右上角齒輪開啟設定窗（執行腳本 / 外觀）',
      gearTitle: '日誌設定（執行腳本 / 外觀）',
      statusConnecting: '連線中…', statusConnected: '已連線', statusSilent: '靜止 {n}s',
      statusDisconnected: '未連線 BatRunner', statusDisconnectedErr: '未連線（{err}）',
      statusLocalRunning: '執行中 {names} · pid {pid}',
      emptyHintNotConnected: '啟動器開著時這裡顯示即時日誌 · 也可以點右上角 {gear} 直接執行腳本',
      emptyHintConnected: '等待腳本輸出…',
      runTitle: '執行 Bat', runningPill: '已執行 ', timingUnknown: '計時未知',
      durTitle: '從啟動到現在的執行時長，每秒更新',
      durHMS: '{h}小時{m}分{s}秒', durMS: '{m}分{s}秒', durS: '{s}秒',
      run: '執行', stop: '停止', del: '刪',
      delTitleRunning: '還在執行中：先按「停止」才能刪（刪只管從清單裡移除，不管殺處理程序）',
      delTitleIdle: '從清單移除這條（它沒在跑，一個處理程序都不動）',
      runTip: '執行這個腳本，輸出直接進面板', stopTip: '結束這個處理程序，連它衍生的子處理程序一起（taskkill /F /T）',
      pickFile: '選擇檔案', picking: '選擇檔案…', pickFileTitle: '開啟系統檔案選取視窗，預設停在上次開啟的目錄',
      runSelected: '執行選取', runSelectedTip: '執行目前選取的那條',
      emptyList: '清單是空的：點下面的「選擇檔案」從磁碟裡挑一個 .bat / .cmd。',
      haltLabel: '結束 DSH 時同時停止正在執行的腳本',
      haltTitle: '勾選：結束 DSH 時把外掛程式啟動的腳本連它衍生子處理程序一起結束。\n不勾選（預設）：DSH 關掉後腳本繼續自己跑。',
      haltHint: '預設不勾選。變更只對之後的收尾生效',
      autoLabel: '啟動 DSH 時自動執行上次選取的腳本',
      autoTitle: '勾選：DSH 啟動後自動執行目前選取的那條。已經有腳本在跑的不會重複啟動。',
      autoDelayPrefix: '延遲 ', autoDelaySuffix: ' 秒 · 已有腳本在跑的不再重複跑', autoDelayTitle: '0–60 秒，超出會自動夾回來',
      lastExitLine: '最後結束：{name} · 結束碼 {code} · {at}',
      appearanceTitle: '日誌外觀', fontLabel: '字型', fontFallbackTitle: '機器上沒裝的字型瀏覽器會自動退回',
      fontNotMonoSuffix: '（非等寬）', fontCustom: '自訂', sizeLabel: '字級（10–20 px）',
      sizeSmallerTitle: '小一點', sizeLargerTitle: '大一點', colorLabel: '字型顏色',
      colorFixedTitle: '{c}（固定色：深淺兩態都是它）', colorFollow: '跟隨',
      fxLabel: '文字特效（最新行）', fxAll: '所有行生效', fxFlow: '隨日誌捲動',
      fxFlowTitle: '日誌停止產生 {n} 秒後，光帶原地暫停（停在目前畫面，不會消失）；來了新日誌自動接著捲。\n不勾：不論有沒有新日誌，光帶一直循環捲動。',
      borderToggle: '顯示外邊框',
      borderToggleTitle: '預設勾選。面板四周常顯一條 1px 邊框，沒有日誌時也一眼找得到面板。\n不勾：回復舊版——只有滑鼠移入時才顯邊。',
      borderHint: '預設勾選。關掉後空面板只剩文字，容易找不到面板',
      restoreDefaults: '回復預設', cancel: '取消', save: '儲存', saveDirty: '儲存（有變更）',
      draftHint: '外觀這邊是草稿預覽：變更當場映到日誌，取消整體還原，儲存才寫盤。執行那邊點下去就生效並記住，不會被「取消」回滾。',
      fxNone: '無', fxGreen: '綠色光束', fxPurple: '紫色漫射', fxRainbow: '彩虹（綠→黃→橙）',
      fxAurora: '極光（綠→青→藍→紫）', fxFire: '火焰（紅→橙→金）', fxSunset: '日落（粉→金→橙）',
      fxOcean: '深海（冰青→藍→靛）', fxMint: '薄荷（淺青綠→深青綠）', fxNeon: '電光（藍→紫→粉）',
      msgPickFailed: '開不起檔案選取框：{err}', msgNoFile: '沒有選擇檔案', msgAlreadyInList: '這個腳本已經在清單裡了',
      msgAdded: '已加入清單：{file}', msgDeleted: '已從清單裡移除：{path}',
      msgDeleteBlocked: '還在執行中：先按「停止」才能從清單裡刪（這條沒動，腳本也沒被殺）',
      msgAlreadyRunning: '已經有腳本在跑的，這次不重複啟動', msgRunFailed: '執行失敗：{err}',
      msgStopFailed: '停止失敗：{err}', msgNotRunning: '這個項目沒有在執行', msgSettingFailed: '這條設定沒送出去：{err}',
      reclaimedLine: '已接上 DSH 重新啟動前就在跑的 {name}（腳本 pid {pid}）',
      haltedLine: '已按「結束 DSH 時停止」收掉上一代沒帶走的 {name}（腳本 pid {pid}）'
    };
    I18N['en'] = {
      rpcBadResponse: 'Bad response from {method}',
      rpcCallFailed: '{method} call failed',
      langNow: 'Now: {lang} · {from}',
      langFromHost: 'following DSH',
      langFromUser: 'chosen in the plugin',
      langFromPreview: 'previewed, not saved yet',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: 'The light band pauses in place {n}s after the log goes quiet and resumes on new output',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: 'did not start',
      startedLine: 'Started {path}',
      startedCopyLine: 'Started {path} (GBK copy {copy})',
      copyRestarted: '(the copy was swapped or truncated, reading from the start; the middle is gone)',
      copyOverCap: '(copy passed {mb} MB: the panel keeps only the last {keep} lines, and this copy is deleted when the script stops)',
      endedAtExit: 'Process ended ({why})',
      stoppedAtExit: 'Stopped ({why})',
      whyCode: 'exit code {code}',
      whySignal: 'signal {signal}',
      whyUnknown: 'unknown',
      endedUnknownGone: 'Process ended (exit code unknown: the script itself is gone)',
      stoppedUnknownByStop: 'Stopped (exit code unknown: the Stop button took it down)',
      endedUnknownWhileClosed: 'Process ended (exit code unknown: it finished while DSH was closed)',
      hostStartFailed: 'Start failed: {msg}',
      ledgerStuck: 'Cannot write the task ledger: {err}',
      dlgTitle: 'Select a BAT script',
      dlgFilterBatch: 'Batch files',
      dlgFilterAll: 'All files',
      demoHostLang: 'UI language in DSH settings', demoPluginLang: 'UI language in this plugin',
      langLabel: 'UI language', langFollowHost: 'Follow DSH (currently: {lang})', demoNow: 'Plugin is using: {lang} ({from})',
      demoNowShort: '{lang} · {from}', demoFromHost: 'following DSH', demoFromUser: 'chosen in the plugin',
      demoFromHostShort: 'follows DSH', demoFromUserShort: 'chosen in the plugin',
      langHint: 'While “Follow DSH” is picked, switching the language in DSH switches this one too; once you choose a language here, the plugin keeps its own choice — it survives a restart. Inside this window a language change is only a preview: Save keeps it, Cancel puts it back.',
      demoLogUntouched: 'Those three lines in the panel are the script’s verbatim output: never translated, no timestamps, no levels, no colors — in any language.',
      capPanelLog: 'Panel · with log', capPanelEmpty: 'Panel · empty', capPanelWait: 'Panel · connected, waiting', capWin: 'Settings window (opens from the gear)', msgsCap: 'Lines the plugin writes onto the screen (also out of the table)',
      panelTitleConnected: 'dsh-bat-runner · launcher connected, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · launcher not connected · {build}',
      panelTitleLocal: 'dsh-bat-runner · running locally, pid {pid} · {build}',
      panelFooterHint: 'Left-drag anywhere on the panel to move it, drag the bottom-right border to resize · the gear at the top right opens the settings window (run scripts / appearance)',
      gearTitle: 'Log settings (run scripts / appearance)',
      statusConnecting: 'Connecting…', statusConnected: 'Connected', statusSilent: 'idle {n}s',
      statusDisconnected: 'BatRunner not connected', statusDisconnectedErr: 'Not connected ({err})',
      statusLocalRunning: 'Running {names} · pid {pid}',
      emptyHintNotConnected: 'Live logs appear here while the launcher is open · you can also click {gear} at the top right to run a script directly',
      emptyHintConnected: 'Waiting for script output…',
      runTitle: 'Run Bat', runningPill: 'running ', timingUnknown: 'time unknown',
      durTitle: 'Time since the script started, refreshed every second',
      durHMS: '{h}h {m}m {s}s', durMS: '{m}m {s}s', durS: '{s}s',
      run: 'Run', stop: 'Stop', del: 'Delete',
      delTitleRunning: 'Still running: press “Stop” before deleting (Delete only removes it from the list, it never kills the process)',
      delTitleIdle: 'Remove this entry from the list (it is not running, so no process is touched)',
      runTip: 'Run this script; the output goes straight into the panel', stopTip: 'End this process and everything it spawned (taskkill /F /T)',
      pickFile: 'Choose file', picking: 'Choosing file…', pickFileTitle: 'Opens the system file picker, starting in the folder you last used',
      runSelected: 'Run selected', runSelectedTip: 'Run the entry that is currently selected',
      emptyList: 'The list is empty: click “Choose file” below to pick a .bat / .cmd from disk.',
      haltLabel: 'Stop running scripts when DSH exits',
      haltTitle: 'Checked: when DSH exits, scripts started by the plugin are ended along with everything they spawned.\nUnchecked (default): scripts keep running after DSH closes.',
      haltHint: 'Off by default. Changes apply to later exits only',
      autoLabel: 'Auto-run the last selected script when DSH starts',
      autoTitle: 'Checked: run the selected entry automatically once DSH starts. Entries already running are not started again.',
      autoDelayPrefix: 'Delay ', autoDelaySuffix: ' s · scripts already running are not started again', autoDelayTitle: '0–60 seconds; out-of-range values are clamped',
      lastExitLine: 'Last exit: {name} · exit code {code} · {at}',
      appearanceTitle: 'Log appearance', fontLabel: 'Font', fontFallbackTitle: 'Fonts not installed on this machine fall back automatically',
      fontNotMonoSuffix: ' (not monospaced)', fontCustom: 'Custom', sizeLabel: 'Size (10–20 px)',
      sizeSmallerTitle: 'Smaller', sizeLargerTitle: 'Larger', colorLabel: 'Text color',
      colorFixedTitle: '{c} (fixed color: the same in light and dark)', colorFollow: 'Follow',
      fxLabel: 'Text effects (newest line)', fxAll: 'Apply to all lines', fxFlow: 'Scroll with the log',
      fxFlowTitle: 'After {n} seconds without new log lines the light band freezes in place (it stays on screen, it does not restart); a new line resumes it.\nUnchecked: the band keeps rolling whether or not new lines arrive.',
      borderToggle: 'Show outer border',
      borderToggleTitle: 'On by default: a 1px border stays visible around the panel so you can find it even with no log.\nOff: back to the old behaviour — the border only shows while the pointer is over it.',
      borderHint: 'On by default. With it off an empty panel is only text and easy to lose',
      restoreDefaults: 'Restore defaults', cancel: 'Cancel', save: 'Save', saveDirty: 'Save (changes pending)',
      draftHint: 'The appearance side is a draft preview: changes show up in the log immediately, Cancel reverts everything, only Save writes them. The Run side takes effect the moment you click and is remembered — Cancel does not roll it back.',
      fxNone: 'None', fxGreen: 'Green beam', fxPurple: 'Purple diffusion', fxRainbow: 'Rainbow (green→yellow→orange)',
      fxAurora: 'Aurora (green→cyan→blue→violet)', fxFire: 'Fire (red→orange→gold)', fxSunset: 'Sunset (pink→gold→orange)',
      fxOcean: 'Deep sea (ice cyan→blue→indigo)', fxMint: 'Mint (light teal→deep teal)', fxNeon: 'Neon (blue→violet→pink)',
      msgPickFailed: 'Could not open the file picker: {err}', msgNoFile: 'No file chosen', msgAlreadyInList: 'That script is already in the list',
      msgAdded: 'Added to the list: {file}', msgDeleted: 'Removed from the list: {path}',
      msgDeleteBlocked: 'Still running: press “Stop” before removing it from the list (this entry is untouched and the script was not killed)',
      msgAlreadyRunning: 'A script is already running, so nothing was started', msgRunFailed: 'Run failed: {err}',
      msgStopFailed: 'Stop failed: {err}', msgNotRunning: 'This entry is not running', msgSettingFailed: 'This setting could not be sent: {err}',
      reclaimedLine: 'Reconnected to {name}, which was already running before DSH restarted (script pid {pid})',
      haltedLine: 'Cleaned up {name}, left behind by the previous generation, per “stop when DSH exits” (script pid {pid})'
    };
    I18N['ja'] = {
      rpcBadResponse: '応答が不正（{method}）',
      rpcCallFailed: '{method} の呼び出しに失敗',
      langNow: '現在：{lang} · {from}',
      langFromHost: 'DSH に追従',
      langFromUser: 'プラグインで選択',
      langFromPreview: 'プレビュー中（未保存）',
      listSep: '、',
      statusPid: 'pid {pid}',
      fxFlowShort: 'ログが {n} 秒止まるとライトバンドはその場で停止し、新しいログで再開します',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: '開始しませんでした',
      startedLine: '開始しました：{path}',
      startedCopyLine: '開始しました：{path}（GBK コピー {copy}）',
      copyRestarted: '（コピーが差し替えられたか切り詰められたため先頭から読み直し、途中は失われました）',
      copyOverCap: '（コピーが {mb} MB を超えました：パネルは直近 {keep} 行だけ保持し、スクリプトが止まるとこのコピーは削除されます）',
      endedAtExit: 'プロセス終了（{why}）',
      stoppedAtExit: '停止しました（{why}）',
      whyCode: '終了コード {code}',
      whySignal: 'シグナル {signal}',
      whyUnknown: '不明',
      endedUnknownGone: 'プロセス終了（終了コード 不明：スクリプト本体がありません）',
      stoppedUnknownByStop: '停止しました（終了コード 不明：「停止」で止められました）',
      endedUnknownWhileClosed: 'プロセス終了（終了コード 不明：DSH が閉じている間に終了しました）',
      hostStartFailed: '開始に失敗：{msg}',
      ledgerStuck: '作業台帳に書き込めません：{err}',
      dlgTitle: 'BAT スクリプトを選択',
      dlgFilterBatch: 'バッチ ファイル',
      dlgFilterAll: 'すべてのファイル',
      demoHostLang: 'DSH 設定の UI 言語', demoPluginLang: 'このプラグインの UI 言語',
      langLabel: 'UI 言語', langFollowHost: 'DSH に従う（現在：{lang}）', demoNow: 'プラグインの使用言語：{lang}（{from}）',
      demoNowShort: '{lang} · 出所：{from}', demoFromHost: 'DSH に従っている状態', demoFromUser: 'プラグインで選択した状態',
      demoFromHostShort: 'DSH に従う', demoFromUserShort: 'プラグイン側の選択',
      langHint: '「DSH に従う」を選んでいる間は、DSH 側で言語を切り替えるとここも追随します。ここで直接選んだ場合はプラグイン側の設定が優先され、再起動しても元に戻りません。この窓での言語変更はプレビューです。「保存」で確定し、「キャンセル」で元に戻ります。',
      demoLogUntouched: 'パネル内のこの 3 行は bat の出力そのままです。どの言語でも翻訳せず、タイムスタンプ・レベル・色も付けません。',
      capPanelLog: 'パネル · ログあり', capPanelEmpty: 'パネル · 空', capPanelWait: 'パネル · 接続済み待機中', capWin: '設定ウィンドウ（歯車から開く）', msgsCap: 'プラグインが画面に書き込む文（同じく表から）',
      panelTitleConnected: 'dsh-bat-runner · ランチャー接続 pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · ランチャー未接続 · {build}',
      panelTitleLocal: 'dsh-bat-runner · ローカル実行中 pid {pid} · {build}',
      panelFooterHint: '左クリックでパネルの任意の場所をドラッグして移動、右下の枠を引いてサイズ変更 · 右上の歯車で設定ウィンドウ（スクリプト実行 / 外観）',
      gearTitle: 'ログ設定（スクリプト実行 / 外観）',
      statusConnecting: '接続中…', statusConnected: '接続済み', statusSilent: '静止 {n}s',
      statusDisconnected: 'BatRunner 未接続', statusDisconnectedErr: '未接続（{err}）',
      statusLocalRunning: '実行中 {names} · pid {pid}',
      emptyHintNotConnected: 'ランチャーが開いている間はここにライブログが表示されます · 右上の {gear} から直接スクリプトを実行することもできます',
      emptyHintConnected: 'スクリプトの出力を待っています…',
      runTitle: 'Bat を実行', runningPill: '稼働 ', timingUnknown: '時間不明',
      durTitle: '起動からの稼働時間、1 秒ごとに更新',
      durHMS: '{h}時間{m}分{s}秒', durMS: '{m}分{s}秒', durS: '{s}秒',
      run: '実行', stop: '停止', del: '削除',
      delTitleRunning: '実行中です：先に「停止」を押してください（削除はリストから外すだけで、プロセスは殺しません）',
      delTitleIdle: 'この項目をリストから外す（実行中でないのでプロセスには何も触れません）',
      runTip: 'このスクリプトを実行し、出力をそのままパネルに出す', stopTip: 'このプロセスと派生した子プロセスもまとめて終了（taskkill /F /T）',
      pickFile: 'ファイルを選択', picking: 'ファイルを選択中…', pickFileTitle: 'システムのファイル選択を開きます。前回使ったフォルダーから始まります',
      runSelected: '選択中を実行', runSelectedTip: '現在選択中の項目を実行',
      emptyList: 'リストが空です：下の「ファイルを選択」から .bat / .cmd を選んでください。',
      haltLabel: 'DSH 終了時に実行中のスクリプトも停止する',
      haltTitle: 'オン：DSH 終了時、プラグインが起動したスクリプトを派生プロセスごと終了します。\nオフ（既定）：DSH を閉じた後もスクリプトは動き続けます。',
      haltHint: '既定でオフ。変更はこれ以降の終了処理から反映されます',
      autoLabel: 'DSH 起動時に最後に選んだスクリプトを自動実行',
      autoTitle: 'オン：DSH 起動後、選択中の項目を自動実行します。すでに実行中のものは重複起動しません。',
      autoDelayPrefix: '遅延 ', autoDelaySuffix: ' 秒 · 実行中のスクリプトは再実行しません', autoDelayTitle: '0〜60 秒、範囲外は丸めます',
      lastExitLine: '直前の終了：{name} · 終了コード {code} · {at}',
      appearanceTitle: 'ログの外観', fontLabel: 'フォント', fontFallbackTitle: 'このマシンに無いフォントは自動的に代替になります',
      fontNotMonoSuffix: '（等幅でない）', fontCustom: 'カスタム', sizeLabel: 'サイズ（10–20 px）',
      sizeSmallerTitle: '小さく', sizeLargerTitle: '大きく', colorLabel: '文字色',
      colorFixedTitle: '{c}（固定色：明暗どちらでもこの色）', colorFollow: '追従',
      fxLabel: '文字エフェクト（最新行）', fxAll: 'すべての行に適用', fxFlow: 'ログに合わせてスクロール',
      fxFlowTitle: '{n} 秒新しい行がないと光帯はその場で停止します（画面に残り、最初に戻りません）。新しい行が来ると続きから動きます。\nオフ：新しい行の有無にかかわらず光帯は動き続けます。',
      borderToggle: '外枠を表示',
      borderToggleTitle: '既定でオン。ログが何も無いときも 1px の枠が常に表示されるのでパネルを探せます。\nオフ：旧版に戻り、ポインターが上にあるときだけ枠が出ます。',
      borderHint: '既定でオン。オフにすると空のパネルは文字だけになり見つかりにくくなります',
      restoreDefaults: '既定に戻す', cancel: 'キャンセル', save: '保存', saveDirty: '保存（変更あり）',
      draftHint: '外観側は下書きプレビューです：変更は即ログに反映され、キャンセルでまとめて戻り、保存して初めて書き込まれます。実行側はクリックした時点で反映・記憶され、キャンセルで巻き戻りません。',
      fxNone: 'なし', fxGreen: '緑のビーム', fxPurple: '紫の拡散', fxRainbow: '虹色（緑→黄→橙）',
      fxAurora: 'オーロラ（緑→水→青→紫）', fxFire: '炎（赤→橙→金）', fxSunset: '夕日（ピンク→金→橙）',
      fxOcean: '深海（水色→青→藍）', fxMint: 'ミント（薄青緑→濃青緑）', fxNeon: 'ネオン（青→紫→ピンク）',
      msgPickFailed: 'ファイル選択を開けませんでした：{err}', msgNoFile: 'ファイルが選択されていません', msgAlreadyInList: 'このスクリプトはすでにリストにあります',
      msgAdded: 'リストに追加しました：{file}', msgDeleted: 'リストから外しました：{path}',
      msgDeleteBlocked: '実行中です：先に「停止」を押してください（この項目は無傷で、スクリプトも殺されていません）',
      msgAlreadyRunning: 'すでにスクリプトが実行中のため、起動しませんでした', msgRunFailed: '実行に失敗しました：{err}',
      msgStopFailed: '停止に失敗しました：{err}', msgNotRunning: 'この項目は実行していません', msgSettingFailed: 'この設定を送信できませんでした：{err}',
      reclaimedLine: 'DSH の再起動前すでに動いていた {name} を引き継ぎました（スクリプト pid {pid}）',
      haltedLine: '「DSH 終了時に停止」に従い、前世代が残した {name} を始末しました（スクリプト pid {pid}）'
    };
    I18N['ko'] = {
      rpcBadResponse: '응답이 올바르지 않음({method})',
      rpcCallFailed: '{method} 호출 실패',
      langNow: '현재: {lang} · {from}',
      langFromHost: 'DSH 따름',
      langFromUser: '플러그인에서 선택',
      langFromPreview: '미리 보는 중 (저장 전)',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: '로그가 {n}초 멈추면 빛 띠가 그 자리에서 멈추고 새 로그가 오면 다시 이어집니다',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: '시작되지 않았습니다',
      startedLine: '시작했습니다: {path}',
      startedCopyLine: '시작했습니다: {path} (GBK 사본 {copy})',
      copyRestarted: '(사본이 바뀌거나 잘려 처음부터 다시 읽습니다. 중간 부분은 사라졌습니다)',
      copyOverCap: '(사본이 {mb} MB를 넘었습니다: 패널은 최근 {keep}줄만 두고, 스크립트가 멈추면 이 사본은 삭제됩니다)',
      endedAtExit: '프로세스 끝났습니다({why})',
      stoppedAtExit: '멈췄습니다({why})',
      whyCode: '종료 코드 {code}',
      whySignal: '신호 {signal}',
      whyUnknown: '알 수 없음',
      endedUnknownGone: '프로세스 끝났습니다(종료 코드 알 수 없음: 스크립트 자체는 없습니다)',
      stoppedUnknownByStop: '멈췄습니다(종료 코드 알 수 없음: 「중지」로 멈추게 되었습니다)',
      endedUnknownWhileClosed: '프로세스 끝났습니다(종료 코드 알 수 없음: DSH가 닫혀 있는 동안 끝났습니다)',
      hostStartFailed: '시작 실패: {msg}',
      ledgerStuck: '작업 대장에 기록할 수 없습니다: {err}',
      dlgTitle: 'BAT 스크립트 선택',
      dlgFilterBatch: '배치 파일',
      dlgFilterAll: '모든 파일',
      demoHostLang: 'DSH 설정의 UI 언어', demoPluginLang: '이 플러그인의 UI 언어',
      langLabel: 'UI 언어', langFollowHost: 'DSH 언어 따르기 (현재: {lang})', demoNow: '플러그인 사용 언어: {lang} ({from})',
      demoNowShort: '{lang} · 출처: {from}', demoFromHost: 'DSH를 따르는 상태', demoFromUser: '플러그인에서 고른 상태',
      demoFromHostShort: 'DSH 따름', demoFromUserShort: '플러그인 내 선택',
      langHint: '“DSH 언어 따르기”를 고르면 DSH에서 언어를 바꾸는 즉시 여기 따라갑니다. 여기에서 직접 고르면 플러그인 설정이 우선이며, 다시 시작해도 원래대로 돌아가지 않습니다. 이 창에서의 언어 변경은 미리 보기입니다. 「저장」을 눌러야 적용되고 「취소」를 누르면 되돌아갑니다.',
      demoLogUntouched: '패널의 이 세 줄은 bat 원문 출력입니다. 어떤 언어에서도 번역하지 않고, 타임스탬프·등급·색을 붙이지 않습니다.',
      capPanelLog: '패널 · 로그 있음', capPanelEmpty: '패널 · 비어 있음', capPanelWait: '패널 · 연결됨 대기 중', capWin: '설정 창 (톱니 클릭으로 열기)', msgsCap: '플러그인이 화면에 쓰는 문장 (역시 표에서 가져옴)',
      panelTitleConnected: 'dsh-bat-runner · 런처 연결됨, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · 런처 연결 안 됨 · {build}',
      panelTitleLocal: 'dsh-bat-runner · 로컬 실행 중, pid {pid} · {build}',
      panelFooterHint: '왼쪽 버튼으로 패널 아무 곳이나 끌어서 이동, 오른쪽 아래 테두리를 당겨 크기 조절 · 오른쪽 위 톱니로 설정 창(스크립트 실행 / 모양) 열기',
      gearTitle: '로그 설정 (스크립트 실행 / 모양)',
      statusConnecting: '연결 중…', statusConnected: '연결됨', statusSilent: '정지 {n}s',
      statusDisconnected: 'BatRunner 연결되지 않음', statusDisconnectedErr: '연결되지 않음 ({err})',
      statusLocalRunning: '실행 중 {names} · pid {pid}',
      emptyHintNotConnected: '런처가 열려 있으면 여기에 실시간 로그가 표시됩니다 · 오른쪽 위 {gear}를 눌러 스크립트를 바로 실행할 수도 있습니다',
      emptyHintConnected: '스크립트 출력을 기다리는 중…',
      runTitle: 'Bat 실행', runningPill: '실행 시간 ', timingUnknown: '시간 측정 불가',
      durTitle: '시작부터 지금までの 실행 시간, 1초마다 갱신',
      durHMS: '{h}시간 {m}분 {s}초', durMS: '{m}분 {s}초', durS: '{s}초',
      run: '실행', stop: '중지', del: '삭제',
      delTitleRunning: '아직 실행 중입니다: 먼저 “중지”를 누르세요 (삭제는 목록에서 빼기만 하고 프로세스를 죽이지 않습니다)',
      delTitleIdle: '이 항목을 목록에서 빼기 (실행 중이 아니므로 프로세스는 건드리지 않습니다)',
      runTip: '이 스크립트를 실행하고 출력을 바로 패널에 표시', stopTip: '이 프로세스와 그 하위 프로세스까지 함께 종료 (taskkill /F /T)',
      pickFile: '파일 선택', picking: '파일 선택 중…', pickFileTitle: '시스템 파일 선택 창을 엽니다. 마지막으로 연 폴더에서 시작합니다',
      runSelected: '선택 항목 실행', runSelectedTip: '현재 선택한 항목을 실행',
      emptyList: '목록이 비어 있습니다: 아래 “파일 선택”을 눌러 .bat / .cmd 파일을 고르세요.',
      haltLabel: 'DSH 종료 시 실행 중인 스크립트도 중지',
      haltTitle: '체크: DSH가 종료되면 플러그인이 시작한 스크립트를 하위 프로세스까지 함께 종료합니다.\n체크 안 함 (기본): DSH를 닫아도 스크립트는 계속 실행됩니다.',
      haltHint: '기본은 체크 안 함. 변경은 이후 종료부터 반영됩니다',
      autoLabel: 'DSH 시작 시 마지막으로 선택한 스크립트 자동 실행',
      autoTitle: '체크: DSH 시작 후 현재 선택한 항목을 자동으로 실행합니다. 이미 실행 중이라면 중복 실행하지 않습니다.',
      autoDelayPrefix: '지연 ', autoDelaySuffix: '초 · 이미 실행 중인 스크립트는 다시 실행하지 않음', autoDelayTitle: '0–60초, 범위를 벗어나면 자동으로 줄입니다',
      lastExitLine: '마지막 종료: {name} · 종료 코드 {code} · {at}',
      appearanceTitle: '로그 모양', fontLabel: '글꼴', fontFallbackTitle: '이 기기에 없는 글꼴은 자동으로 대체됩니다',
      fontNotMonoSuffix: ' (고정폭 아님)', fontCustom: '사용자 지정', sizeLabel: '크기 (10–20 px)',
      sizeSmallerTitle: '더 작게', sizeLargerTitle: '더 크게', colorLabel: '글자 색',
      colorFixedTitle: '{c} (고정 색: 밝게/어둡게 모두 이 색)', colorFollow: '따르기',
      fxLabel: '텍스트 효과 (최근 행)', fxAll: '모든 행에 적용', fxFlow: '로그를 따라 스크롤',
      fxFlowTitle: '{n}초 동안 새 줄이 없으면 빛줄이 그 자리에서 멈춥니다 (화면에 남아 있고 맨 앞으로 돌아가지 않음). 새 로그가 오면 멈춘 곳에서 이어갑니다.\n체크 안 함: 새 로그와 무관하게 빛줄이 계속 돌습니다.',
      borderToggle: '테두리 표시',
      borderToggleTitle: '기본은 켜짐. 로그가 하나도 없을 때 1px 테두리가 항상 보여 패널을 찾기 쉽습니다.\n끄면 옛 방식으로 돌아갑니다: 마우스가 올라가 있을 때만 테두리가 나타남.',
      borderHint: '기본은 켜짐. 끄면 빈 패널은 글자만 남아서 찾기 어렵습니다',
      restoreDefaults: '기본값으로 복원', cancel: '취소', save: '저장', saveDirty: '저장 (변경 있음)',
      draftHint: '모양 쪽은 임시 미리보기입니다: 바꾸는 즉시 로그에 반영되고, 취소는 전체를 되돌리며, 저장해야 기록됩니다. 실행 쪽은 누르는 순간 반영되고 기억되므로 취소로 되돌아가지 않습니다.',
      fxNone: '없음', fxGreen: '초록 광선', fxPurple: '보라 확산', fxRainbow: '무지개 (초록→노랑→주황)',
      fxAurora: '오로라 (초록→청록→파랑→보라)', fxFire: '불꽃 (빨강→주황→금)', fxSunset: '노을 (분홍→금→주황)',
      fxOcean: '심해 (빙색→파랑→남)', fxMint: '민트 (연청록→진청록)', fxNeon: '네온 (파랑→보라→분홍)',
      msgPickFailed: '파일 선택 창을 열지 못했습니다: {err}', msgNoFile: '선택한 파일이 없습니다', msgAlreadyInList: '이 스크립트는 이미 목록에 있습니다',
      msgAdded: '목록에 추가했습니다: {file}', msgDeleted: '목록에서 뺐습니다: {path}',
      msgDeleteBlocked: '아직 실행 중입니다: 먼저 “중지”를 누르세요 (이 항목은 그대로이고 스크립트도 죽지 않았습니다)',
      msgAlreadyRunning: '이미 스크립트가 실행 중이어서 새로 시작하지 않았습니다', msgRunFailed: '실행 실패: {err}',
      msgStopFailed: '중지 실패: {err}', msgNotRunning: '이 항목은 실행 중이 아닙니다', msgSettingFailed: '이 설정을 보내지 못했습니다: {err}',
      reclaimedLine: 'DSH 재시작 전부터 실행 중이던 {name}을(를) 이어받았습니다 (스크립트 pid {pid})',
      haltedLine: '“DSH 종료 시 중지”에 따라 이전 세대가 남긴 {name}을(를) 정리했습니다 (스크립트 pid {pid})'
    };
    I18N['de'] = {
      rpcBadResponse: 'Ungültige Antwort von {method}',
      rpcCallFailed: 'Aufruf {method} fehlgeschlagen',
      langNow: 'Aktuell: {lang} · {from}',
      langFromHost: 'folgt DSH',
      langFromUser: 'im Plugin gewählt',
      langFromPreview: 'Vorschau, noch nicht gespeichert',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: 'Das Lichtband pausiert an Ort und Stelle, wenn {n}s lang keine neue Zeile kommt, und fährt bei neuer Ausgabe fort',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: 'startete nicht',
      startedLine: 'Gestartet: {path}',
      startedCopyLine: 'Gestartet: {path} (GBK-Kopie {copy})',
      copyRestarted: '(die Kopie wurde ausgetauscht oder abgeschnitten – gelesen wird vom Anfang, der Mittelteil fehlt)',
      copyOverCap: '(Kopie über {mb} MB: das Panel behält nur die letzten {keep} Zeilen, diese Kopie wird beim Stopp des Skripts gelöscht)',
      endedAtExit: 'Prozess beendet ({why})',
      stoppedAtExit: 'Gestoppt ({why})',
      whyCode: 'Exit-Code {code}',
      whySignal: 'Signal {signal}',
      whyUnknown: 'unbekannt',
      endedUnknownGone: 'Prozess beendet (Exit-Code unbekannt: das Skript selbst fehlt)',
      stoppedUnknownByStop: 'Gestoppt (Exit-Code unbekannt: der Stopp-Knopf hat es beendet)',
      endedUnknownWhileClosed: 'Prozess beendet (Exit-Code unbekannt: es endete, während DSH geschlossen war)',
      hostStartFailed: 'Start fehlgeschlagen: {msg}',
      ledgerStuck: 'Aufgabenbuch kann nicht geschrieben werden: {err}',
      dlgTitle: 'BAT-Skript auswählen',
      dlgFilterBatch: 'Batchdateien',
      dlgFilterAll: 'Alle Dateien',
      demoHostLang: 'Oberflächensprache in den DSH-Einstellungen', demoPluginLang: 'Oberflächensprache dieses Plugins',
      langLabel: 'Oberflächensprache', langFollowHost: 'DSH-Sprache folgen (derzeit: {lang})', demoNow: 'Plugin nutzt gerade: {lang} ({from})',
      demoNowShort: '{lang} · Quelle: {from}', demoFromHost: 'folgt DSH', demoFromUser: 'im Plugin gewählt',
      demoFromHostShort: 'folgt DSH', demoFromUserShort: 'hier gewählt',
      langHint: 'Solange „DSH-Sprache folgen“ gewählt ist, springt das hier mit, sobald DSH die Sprache umstellt. Sobald du hier selbst etwas wählst, gilt die Einstellung des Plugins – auch nach einem Neustart. In diesem Fenster ist die Sprache nur eine Vorschau: „Speichern“ behält sie, „Abbrechen“ stellt den alten Stand wieder her.',
      demoLogUntouched: 'Diese drei Zeilen im Panel sind die rohe Ausgabe des bat: in keiner Sprache übersetzt, ohne Zeitstempel, ohne Level, ohne Farben.',
      capPanelLog: 'Panel · mit Log', capPanelEmpty: 'Panel · leer', capPanelWait: 'Panel · verbunden, wartet', capWin: 'Einstellungsfenster (über das Zahnrad)', msgsCap: 'Sätze, die das Plugin auf den Schirm schreibt (ebenfalls aus der Tabelle)',
      panelTitleConnected: 'dsh-bat-runner · Launcher verbunden, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · Launcher nicht verbunden · {build}',
      panelTitleLocal: 'dsh-bat-runner · läuft lokal, pid {pid} · {build}',
      panelFooterHint: 'Linksklick irgendwo auf dem Panel ziehen zum Verschieben, Rahmen unten rechts ziehen zum Umskalieren · das Zahnrad oben rechts öffnet das Einstellungsfenster (Skripte ausführen / Aussehen)',
      gearTitle: 'Log-Einstellungen (Skripte ausführen / Aussehen)',
      statusConnecting: 'Verbindung wird aufgebaut…', statusConnected: 'Verbunden', statusSilent: '{n} s inaktiv',
      statusDisconnected: 'BatRunner nicht verbunden', statusDisconnectedErr: 'Nicht verbunden ({err})',
      statusLocalRunning: 'Läuft: {names} · pid {pid}',
      emptyHintNotConnected: 'Solange der Launcher offen ist, erscheint hier das Live-Log · über das {gear} oben rechts kannst du auch direkt ein Skript ausführen',
      emptyHintConnected: 'Warte auf die Ausgabe des Skripts…',
      runTitle: 'Bat ausführen', runningPill: 'seit ', timingUnknown: 'Zeit unbekannt',
      durTitle: 'Laufzeit seit dem Start, jede Sekunde aktualisiert',
      durHMS: '{h} Std {m} Min {s} s', durMS: '{m} Min {s} s', durS: '{s} s',
      run: 'Ausführen', stop: 'Stopp', del: 'Löschen',
      delTitleRunning: 'Läuft noch: erst „Stopp" drücken, dann löschen (Löschen entfernt nur den Eintrag, es beendet keinen Prozess)',
      delTitleIdle: 'Diesen Eintrag aus der Liste entfernen (er läuft nicht, es wird kein Prozess angefasst)',
      runTip: 'Dieses Skript ausführen; die Ausgabe geht direkt ins Panel', stopTip: 'Diesen Prozess und alles, was er gestartet hat, beenden (taskkill /F /T)',
      pickFile: 'Datei auswählen', picking: 'Datei wird ausgewählt…', pickFileTitle: 'Öffnet die System-Auswahl und startet im zuletzt verwendeten Ordner',
      runSelected: 'Auswahl ausführen', runSelectedTip: 'Den gerade ausgewählten Eintrag ausführen',
      emptyList: 'Die Liste ist leer: klicken Sie unten auf „Datei auswählen", um eine .bat / .cmd von der Platte zu holen.',
      haltLabel: 'Laufende Skripte beim Beenden von DSH stoppen',
      haltTitle: 'Angeschaltet: Beim Beenden von DSH werden die vom Plugin gestarteten Skripte samt aller Kindprozesse beendet.\nAusgeschaltet (Standard): Skripte laufen weiter, auch wenn DSH zu ist.',
      haltHint: 'Standardmäßig aus. Änderungen wirken erst auf spätere Vorgänge',
      autoLabel: 'Zuletzt gewähltes Skript beim Start von DSH automatisch ausführen',
      autoTitle: 'Angeschaltet: Nach dem Start von DSH wird der ausgewählte Eintrag automatisch ausgeführt. Bereits laufende Einträge werden nicht doppelt gestartet.',
      autoDelayPrefix: 'Verzögerung ', autoDelaySuffix: ' s · bereits laufende Skripte werden nicht neu gestartet', autoDelayTitle: '0–60 Sekunden; außerhalb wird eingeklemmt',
      lastExitLine: 'Letzter Abschluss: {name} · Exit-Code {code} · {at}',
      appearanceTitle: 'Log-Aussehen', fontLabel: 'Schrift', fontFallbackTitle: 'Schriften, die es auf diesem Rechner nicht gibt, fallen automatisch zurück',
      fontNotMonoSuffix: ' (nicht festbreit)', fontCustom: 'Eigene', sizeLabel: 'Größe (10–20 px)',
      sizeSmallerTitle: 'Kleiner', sizeLargerTitle: 'Größer', colorLabel: 'Textfarbe',
      colorFixedTitle: '{c} (feste Farbe: in Hell und Dunkel identisch)', colorFollow: 'Folgen',
      fxLabel: 'Texteffekte (neueste Zeile)', fxAll: 'Auf alle Zeilen anwenden', fxFlow: 'Mit dem Log scrollen',
      fxFlowTitle: 'Nach {n} Sekunden ohne neue Zeile hält das Lichtband an genau der Stelle an (es bleibt sichtbar und springt nicht an den Anfang); eine neue Zeile setzt es fort.\nAusgeschaltet: Das Band läuft weiter, egal ob neue Zeilen kommen.',
      borderToggle: 'Rahmen anzeigen',
      borderToggleTitle: 'Standardmäßig an: ein 1px-Rahmen bleibt rund um das Panel sichtbar, damit man es auch ohne Log findet.\nAus: altes Verhalten – der Rahmen erscheint nur, wenn der Zeiger darübersteht.',
      borderHint: 'Standardmäßig an. Ohne ihn bleibt von einem leeren Panel nur Text übrig, leicht zu übersehen',
      restoreDefaults: 'Standard wiederherstellen', cancel: 'Abbrechen', save: 'Speichern', saveDirty: 'Speichern (Änderungen)',
      draftHint: 'Die Aussehen-Seite ist eine Vorschau auf einem Entwurf: Änderungen sind sofort im Log zu sehen, Abbrechen verwirft alles, Speichern erst schreibt sie. Die Ausführen-Seite gilt sofort und wird gemerkt – Abbrechen rollt sie nicht zurück.',
      fxNone: 'Keine', fxGreen: 'Grüner Strahl', fxPurple: 'Violetter Diffus', fxRainbow: 'Regenbogen (grün→gelb→orange)',
      fxAurora: 'Aurora (grün→cyan→blau→violett)', fxFire: 'Feuer (rot→orange→gold)', fxSunset: 'Sonnenuntergang (rosa→gold→orange)',
      fxOcean: 'Tiefsee (eisblau→blau→indigo)', fxMint: 'Minze (hell-türkis→dunkel-türkis)', fxNeon: 'Neon (blau→violett→rosa)',
      msgPickFailed: 'Dateiauswahl ließ sich nicht öffnen: {err}', msgNoFile: 'Keine Datei gewählt', msgAlreadyInList: 'Dieses Skript steht schon in der Liste',
      msgAdded: 'Zur Liste hinzugefügt: {file}', msgDeleted: 'Aus der Liste entfernt: {path}',
      msgDeleteBlocked: 'Läuft noch: erst „Stopp" drücken, bevor der Eintrag verschwindet (dieser Eintrag blieb unangetastet, das Skript wurde nicht beendet)',
      msgAlreadyRunning: 'Es läuft bereits ein Skript, daher wurde nichts gestartet', msgRunFailed: 'Ausführen fehlgeschlagen: {err}',
      msgStopFailed: 'Stopp fehlgeschlagen: {err}', msgNotRunning: 'Dieser Eintrag läuft nicht', msgSettingFailed: 'Diese Einstellung ließ sich nicht senden: {err}',
      reclaimedLine: '{name} wurde übernommen – es lief schon vor dem Neustart von DSH (Skript-pid {pid})',
      haltedLine: '{name} wurde nach „beim Beenden von DSH stoppen" aufgeräumt, weil die vorherige Generation es nicht mitnahm (Skript-pid {pid})'
    };
    I18N['fr'] = {
      rpcBadResponse: 'Réponse invalide de {method}',
      rpcCallFailed: 'Échec de l’appel {method}',
      langNow: 'Actuel : {lang} · {from}',
      langFromHost: 'suit DSH',
      langFromUser: 'choisi dans le module',
      langFromPreview: 'aperçu, pas encore enregistré',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: 'La bande lumineuse marque une pause sur place {n} s après le silence et reprend dès une nouvelle ligne',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: 'n’a pas démarré',
      startedLine: 'Démarré : {path}',
      startedCopyLine: 'Démarré : {path} (copie GBK {copy})',
      copyRestarted: '(la copie a été remplacée ou tronquée : relecture depuis le début, le milieu est perdu)',
      copyOverCap: '(copie au-delà de {mb} Mo : le panneau ne garde que les {keep} dernières lignes, cette copie est supprimée à l’arrêt du script)',
      endedAtExit: 'Processus terminé ({why})',
      stoppedAtExit: 'Arrêté ({why})',
      whyCode: 'code de sortie {code}',
      whySignal: 'signal {signal}',
      whyUnknown: 'inconnu',
      endedUnknownGone: 'Processus terminé (code de sortie inconnu : le script lui-même a disparu)',
      stoppedUnknownByStop: 'Arrêté (code de sortie inconnu : c’est « Arrêter » qui l’a terminé)',
      endedUnknownWhileClosed: 'Processus terminé (code de sortie inconnu : il s’est terminé pendant que DSH était fermé)',
      hostStartFailed: 'Échec du démarrage : {msg}',
      ledgerStuck: 'Impossible d’écrire le registre des tâches : {err}',
      dlgTitle: 'Sélectionner un script BAT',
      dlgFilterBatch: 'Fichiers batch',
      dlgFilterAll: 'Tous les fichiers',
      demoHostLang: 'Langue de l’interface dans les réglages DSH', demoPluginLang: 'Langue de l’interface de ce plugin',
      langLabel: 'Langue de l’interface', langFollowHost: 'Suivre la langue de DSH (actuellement : {lang})', demoNow: 'Le plugin utilise : {lang} ({from})',
      demoNowShort: '{lang} · origine : {from}', demoFromHost: 'suit DSH', demoFromUser: 'choisi dans le plugin',
      demoFromHostShort: 'suit DSH', demoFromUserShort: 'choisi ici',
      langHint: 'Tant que « Suivre la langue de DSH » est sélectionné, changer la langue côté DSH change aussi celle d’ici ; dès que vous choisissez vous-même, c’est le réglage du plugin qui prime, même après un redémarrage. Dans cette fenêtre, la langue n’est qu’un aperçu : Enregistrer la conserve, Annuler la rétablit.',
      demoLogUntouched: 'Ces trois lignes dans le panneau sont la sortie brute du bat : jamais traduites, sans horodatage, sans niveau, sans couleur — quelle que soit la langue.',
      capPanelLog: 'Panneau · avec journal', capPanelEmpty: 'Panneau · vide', capPanelWait: 'Panneau · connecté, en attente', capWin: 'Fenêtre de réglages (via la roue dentée)', msgsCap: 'Les phrases que le plugin écrit à l’écran (elles aussi tirées du tableau)',
      panelTitleConnected: 'dsh-bat-runner · lanceur connecté, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · lanceur non connecté · {build}',
      panelTitleLocal: 'dsh-bat-runner · tourne en local, pid {pid} · {build}',
      panelFooterHint: 'Clic gauche n’importe où sur le panneau pour le déplacer, tirer la bordure en bas à droite pour le redimensionner · la roue dentée en haut à droite ouvre la fenêtre de réglages (lancer des scripts / apparence)',
      gearTitle: 'Réglages du journal (lancer des scripts / apparence)',
      statusConnecting: 'Connexion…', statusConnected: 'Connecté', statusSilent: '{n} s silencieux',
      statusDisconnected: 'BatRunner non connecté', statusDisconnectedErr: 'Non connecté ({err})',
      statusLocalRunning: 'En cours {names} · pid {pid}',
      emptyHintNotConnected: 'Le journal en direct s’affiche ici tant que le lanceur est ouvert · vous pouvez aussi cliquer {gear} en haut à droite pour lancer un script directement',
      emptyHintConnected: 'En attente de la sortie du script…',
      runTitle: 'Lancer un Bat', runningPill: 'depuis ', timingUnknown: 'durée inconnue',
      durTitle: 'Temps écoulé depuis le démarrage, rafraîchi chaque seconde',
      durHMS: '{h} h {m} min {s} s', durMS: '{m} min {s} s', durS: '{s} s',
      run: 'Lancer', stop: 'Arrêter', del: 'Supprimer',
      delTitleRunning: 'Encore en cours : appuyez d’abord sur « Arrêter » avant de supprimer (Supprimer ne retire que de la liste, ça ne tue aucun processus)',
      delTitleIdle: 'Retirer cette entrée de la liste (elle ne tourne pas, aucun processus n’est touché)',
      runTip: 'Lancer ce script ; la sortie va directement dans le panneau', stopTip: 'Terminer ce processus et tout ce qu’il a engendré (taskkill /F /T)',
      pickFile: 'Choisir un fichier', picking: 'Choix du fichier…', pickFileTitle: 'Ouvre la boîte de sélection du système, en repartant du dernier dossier utilisé',
      runSelected: 'Lancer la sélection', runSelectedTip: 'Lancer l’entrée actuellement sélectionnée',
      emptyList: 'La liste est vide : cliquez sur « Choisir un fichier » en dessous pour prendre un .bat / .cmd sur le disque.',
      haltLabel: 'Arrêter les scripts en cours quand DSH se ferme',
      haltTitle: 'Coché : à la fermeture de DSH, les scripts lancés par le plugin sont terminés avec tout ce qu’ils ont engendré.\nDécoché (défaut) : les scripts continuent après la fermeture de DSH.',
      haltHint: 'Décoché par défaut. Les changements ne valent que pour les prochaines fermetures',
      autoLabel: 'Lancer automatiquement le dernier script choisi au démarrage de DSH',
      autoTitle: 'Coché : après le démarrage de DSH, l’entrée sélectionnée se lance toute seule. Une entrée déjà en cours n’est pas relancée.',
      autoDelayPrefix: 'Retard ', autoDelaySuffix: ' s · les scripts déjà en cours ne sont pas relancés', autoDelayTitle: '0–60 s ; au-delà, la valeur est bornée',
      lastExitLine: 'Dernière sortie : {name} · code {code} · {at}',
      appearanceTitle: 'Apparence du journal', fontLabel: 'Police', fontFallbackTitle: 'Les polices absentes de la machine basculent automatiquement',
      fontNotMonoSuffix: ' (non monospace)', fontCustom: 'Personnalisée', sizeLabel: 'Taille (10–20 px)',
      sizeSmallerTitle: 'Plus petit', sizeLargerTitle: 'Plus grand', colorLabel: 'Couleur du texte',
      colorFixedTitle: '{c} (couleur fixe : identique en clair et en foncé)', colorFollow: 'Suivre',
      fxLabel: 'Effets de texte (dernière ligne)', fxAll: 'Appliquer à toutes les lignes', fxFlow: 'Faire défiler avec le journal',
      fxFlowTitle: 'Après {n} secondes sans nouvelle ligne, le bandeau lumineux se fige sur place (il reste à l’écran, il ne repart pas du début) ; une nouvelle ligne le reprend.\nDécoché : le bandeau tourne en continu, avec ou sans nouvelles lignes.',
      borderToggle: 'Bordure visible',
      borderToggleTitle: 'Coché par défaut : une bordure de 1px reste affichée autour du panneau, pour le retrouver même sans journal.\nDécoché : retour à l’ancien comportement — la bordure n’apparaît que sous le pointeur.',
      borderHint: 'Coché par défaut. Désactivé, un panneau vide n’est que du texte et se repère mal',
      restoreDefaults: 'Rétablir les valeurs par défaut', cancel: 'Annuler', save: 'Enregistrer', saveDirty: 'Enregistrer (modifications)',
      draftHint: 'Le côté apparence est un brouillon en prévisualisation : les changements s’appliquent aussitôt au journal, Annuler tout défait, seul Enregistrer écrit. Le côté lancement prend effet au clic et est mémorisé — Annuler ne le remet pas en arrière.',
      fxNone: 'Aucun', fxGreen: 'Faisceau vert', fxPurple: 'Diffusion violette', fxRainbow: 'Arc-en-ciel (vert→jaune→orange)',
      fxAurora: 'Aurore (vert→cyan→bleu→violet)', fxFire: 'Flamme (rouge→orange→or)', fxSunset: 'Coucher de soleil (rose→or→orange)',
      fxOcean: 'Grand fond (cyan glacé→bleu→indigo)', fxMint: 'Menthe (turquoise clair→turquoise foncé)', fxNeon: 'Néon (bleu→violet→rose)',
      msgPickFailed: 'Impossible d’ouvrir la boîte de sélection : {err}', msgNoFile: 'Aucun fichier choisi', msgAlreadyInList: 'Ce script est déjà dans la liste',
      msgAdded: 'Ajouté à la liste : {file}', msgDeleted: 'Retiré de la liste : {path}',
      msgDeleteBlocked: 'Encore en cours : appuyez d’abord sur « Arrêter » avant de le retirer (cette entrée est intacte et le script n’a pas été tué)',
      msgAlreadyRunning: 'Un script tourne déjà, rien n’a été relancé', msgRunFailed: 'Échec du lancement : {err}',
      msgStopFailed: 'Échec de l’arrêt : {err}', msgNotRunning: 'Cette entrée n’est pas en cours', msgSettingFailed: 'Ce réglage n’a pas pu être envoyé : {err}',
      reclaimedLine: '{name} a été repris : il tournait déjà avant le redémarrage de DSH (script pid {pid})',
      haltedLine: '{name} a été nettoyé selon « arrêter à la fermeture de DSH », l’ancienne génération ne l’ayant pas emporté (script pid {pid})'
    };
    I18N['ru'] = {
      rpcBadResponse: 'Некорректный ответ от {method}',
      rpcCallFailed: 'Сбой вызова {method}',
      langNow: 'Сейчас: {lang} · {from}',
      langFromHost: 'следует DSH',
      langFromUser: 'выбрано в плагине',
      langFromPreview: 'предпросмотр, не сохранено',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: 'Световая полоса замирает на месте через {n} с тишины и продолжает движение при новых строках',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: 'не запущено',
      startedLine: 'Запущено: {path}',
      startedCopyLine: 'Запущено: {path} (копия GBK {copy})',
      copyRestarted: '(копия заменена или усечена — чтение с начала, середина потеряна)',
      copyOverCap: '(копия превысила {mb} МБ: панель хранит только последние {keep} строк, при остановке скрипта эта копия удаляется)',
      endedAtExit: 'Процесс завершён ({why})',
      stoppedAtExit: 'Остановлен ({why})',
      whyCode: 'код выхода {code}',
      whySignal: 'сигнал {signal}',
      whyUnknown: 'неизвестно',
      endedUnknownGone: 'Процесс завершён (код выхода неизвестен: самого скрипта нет)',
      stoppedUnknownByStop: 'Остановлен (код выхода неизвестен: его сняла кнопка «Остановить»)',
      endedUnknownWhileClosed: 'Процесс завершён (код выхода неизвестен: он завершился, пока DSH был закрыт)',
      hostStartFailed: 'Не удалось запустить: {msg}',
      ledgerStuck: 'Не удаётся записать реестр задач: {err}',
      dlgTitle: 'Выберите сценарий BAT',
      dlgFilterBatch: 'Пакетные файлы',
      dlgFilterAll: 'Все файлы',
      demoHostLang: 'Язык интерфейса в настройках DSH', demoPluginLang: 'Язык интерфейса этого плагина',
      langLabel: 'Язык интерфейса', langFollowHost: 'Как в DSH (сейчас: {lang})', demoNow: 'Плагин использует: {lang} ({from})',
      demoNowShort: '{lang} · источник: {from}', demoFromHost: 'следует за DSH', demoFromUser: 'выбрано в плагине',
      demoFromHostShort: 'следует DSH', demoFromUserShort: 'выбрано здесь',
      langHint: 'Пока выбрано «Как в DSH», смена языка в DSH меняет и язык здесь; как только вы выберете язык сами, приоритет у настройки плагина — она не сбрасывается после перезапуска. В этом окне язык меняется только предпросмотром: «Сохранить» оставит его, «Отмена» вернёт как было.',
      demoLogUntouched: 'Эти три строки в панели — сырой вывод bat: ни на какой язык не переводятся, без отметок времени, без уровней, без цветов.',
      capPanelLog: 'Панель · с журналом', capPanelEmpty: 'Панель · пусто', capPanelWait: 'Панель · подключено, ожидание', capWin: 'Окно настроек (через шестерёнку)', msgsCap: 'Фразы, которые плагин пишет на экран (тоже из таблицы)',
      panelTitleConnected: 'dsh-bat-runner · лаунчер подключён, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · лаунчер не подключён · {build}',
      panelTitleLocal: 'dsh-bat-runner · работает локально, pid {pid} · {build}',
      panelFooterHint: 'Левая кнопка — тянуть панель за любое место, правый нижний край — менять размер · шестерёнка справа вверху открывает окно настроек (запуск скриптов / вид)',
      gearTitle: 'Настройки журнала (запуск скриптов / вид)',
      statusConnecting: 'Подключение…', statusConnected: 'Подключено', statusSilent: 'бездействие {n} с',
      statusDisconnected: 'BatRunner не подключён', statusDisconnectedErr: 'Не подключён ({err})',
      statusLocalRunning: 'Выполняется {names} · pid {pid}',
      emptyHintNotConnected: 'Пока лаунчер открыт, живой журнал появляется здесь · можно и запустить скрипт прямо отсюда, через {gear} справа вверху',
      emptyHintConnected: 'Ожидание вывода скрипта…',
      runTitle: 'Запуск Bat', runningPill: 'работает ', timingUnknown: 'время неизвестно',
      durTitle: 'Время с момента запуска, обновляется каждую секунду',
      durHMS: '{h} ч {m} мин {s} с', durMS: '{m} мин {s} с', durS: '{s} с',
      run: 'Запуск', stop: 'Остановить', del: 'Удалить',
      delTitleRunning: 'Ещё выполняется: сначала нажмите «Остановить» (Удалить только убирает запись из списка, процесс не убивает)',
      delTitleIdle: 'Убрать эту запись из списка (она не выполняется, процессы не трогаются)',
      runTip: 'Запустить этот скрипт; вывод сразу пойдёт в панель', stopTip: 'Завершить этот процесс и всё, что он породил (taskkill /F /T)',
      pickFile: 'Выбрать файл', picking: 'Выбор файла…', pickFileTitle: 'Открывает системный выбор файла, стартуя в последней папке',
      runSelected: 'Запустить выбранное', runSelectedTip: 'Запустить запись, которая сейчас выбрана',
      emptyList: 'Список пуст: нажмите «Выбрать файл» ниже и возьмите .bat / .cmd с диска.',
      haltLabel: 'Останавливать запущенные скрипты при выходе из DSH',
      haltTitle: 'Включено: при выходе из DSH скрипты, запущенные плагином, завершаются вместе со всеми порождёнными процессами.\nВыключено (по умолчанию): скрипты продолжают работать после закрытия DSH.',
      haltHint: 'По умолчанию выключено. Изменения действуют только на последующие завершения',
      autoLabel: 'Автозапуск последнего выбранного скрипта при старте DSH',
      autoTitle: 'Включено: после запуска DSH выбранная запись стартует сама. Уже выполняющаяся запись повторно не запускается.',
      autoDelayPrefix: 'Задержка ', autoDelaySuffix: ' с · уже запущенные скрипты не запускаются повторно', autoDelayTitle: '0–60 с; вне диапазона значение зажимается',
      lastExitLine: 'Последний выход: {name} · код {code} · {at}',
      appearanceTitle: 'Вид журнала', fontLabel: 'Шрифт', fontFallbackTitle: 'Чего нет на этой машине — браузер подставляет сам',
      fontNotMonoSuffix: ' (не моноширинный)', fontCustom: 'Свой', sizeLabel: 'Размер (10–20 px)',
      sizeSmallerTitle: 'Меньше', sizeLargerTitle: 'Больше', colorLabel: 'Цвет текста',
      colorFixedTitle: '{c} (фиксированный: одинаков в светлой и тёмной теме)', colorFollow: 'Как тема',
      fxLabel: 'Эффекты текста (последняя строка)', fxAll: 'Применить ко всем строкам', fxFlow: 'Прокручивать вместе с журналом',
      fxFlowTitle: 'После {n} с без новых строк лента останавливается на месте (остаётся на экране, не возвращается в начало); новая строка продолжает с той же точки.\nВыключено: лента крутится постоянно, приходят новые строки или нет.',
      borderToggle: 'Рамка',
      borderToggleTitle: 'По умолчанию включено: рамка 1px постоянно видна вокруг панели, чтобы её можно было найти и без журнала.\nВыключено: как в прежней версии — рамка только когда указатель сверху.',
      borderHint: 'По умолчанию включено. Без неё пустая панель — это только текст, её легко не заметить',
      restoreDefaults: 'Вернуть по умолчанию', cancel: 'Отмена', save: 'Сохранить', saveDirty: 'Сохранить (есть изменения)',
      draftHint: 'Сторона вида — это черновик с предпросмотром: изменения сразу видно в журнале, «Отмена» откатывает всё, записывает только «Сохранить». Сторона запуска действует по клику и запоминается — «Отмена» её не откатывает.',
      fxNone: 'Нет', fxGreen: 'Зелёный луч', fxPurple: 'Фиолетовое рассеяние', fxRainbow: 'Радуга (зелёный→жёлтый→оранжевый)',
      fxAurora: 'Сияние (зелёный→циан→синий→фиолетовый)', fxFire: 'Огонь (красный→оранжевый→золото)', fxSunset: 'Закат (розовый→золото→оранжевый)',
      fxOcean: 'Бездна (лёд-циан→синий→индиго)', fxMint: 'Мята (светло-бирюзовый→тёмно-бирюзовый)', fxNeon: 'Неон (синий→фиолетовый→розовый)',
      msgPickFailed: 'Не удалось открыть выбор файла: {err}', msgNoFile: 'Файл не выбран', msgAlreadyInList: 'Этот скрипт уже в списке',
      msgAdded: 'Добавлено в список: {file}', msgDeleted: 'Убрано из списка: {path}',
      msgDeleteBlocked: 'Ещё выполняется: сначала «Остановить», потом убирать из списка (запись цела, скрипт не убит)',
      msgAlreadyRunning: 'Скрипт уже выполняется, ничего не запускалось', msgRunFailed: 'Запуск не удался: {err}',
      msgStopFailed: 'Остановка не удалась: {err}', msgNotRunning: 'Эта запись не выполняется', msgSettingFailed: 'Настройку не удалось отправить: {err}',
      reclaimedLine: 'Подхвачен {name} — он выполнялся ещё до перезапуска DSH (pid скрипта {pid})',
      haltedLine: 'По правилу «останавливать при выходе из DSH» убран {name}, который прежнее поколение не унесло (pid скрипта {pid})'
    };
    I18N['it'] = {
      rpcBadResponse: 'Risposta non valida da {method}',
      rpcCallFailed: 'Chiamata {method} fallita',
      langNow: 'Attuale: {lang} · {from}',
      langFromHost: 'segue DSH',
      langFromUser: 'scelto nel plugin',
      langFromPreview: 'anteprima, non ancora salvato',
      listSep: ', ',
      statusPid: 'pid {pid}',
      fxFlowShort: 'La fascia luminosa si ferma sul posto dopo {n} s di silenzio e riprende con le nuove righe',
      panelTitle: 'dsh-bat-runner {build} · {status}',
      notStarted: 'non ha avviato',
      startedLine: 'Avviato: {path}',
      startedCopyLine: 'Avviato: {path} (copia GBK {copy})',
      copyRestarted: '(la copia è stata sostituita o tagliata: rilettura dall’inizio, la parte centrale è persa)',
      copyOverCap: '(copia oltre {mb} MB: il pannello tiene solo le {keep} righe più recenti e questa copia viene eliminata quando lo script si ferma)',
      endedAtExit: 'Processo terminato ({why})',
      stoppedAtExit: 'Arrestato ({why})',
      whyCode: 'codice di uscita {code}',
      whySignal: 'segnale {signal}',
      whyUnknown: 'sconosciuto',
      endedUnknownGone: 'Processo terminato (codice di uscita sconosciuto: lo script stesso non c’è più)',
      stoppedUnknownByStop: 'Arrestato (codice di uscita sconosciuto: l’ha terminato il pulsante «Arresta»)',
      endedUnknownWhileClosed: 'Processo terminato (codice di uscita sconosciuto: è terminato mentre DSH era chiuso)',
      hostStartFailed: 'Avvio fallito: {msg}',
      ledgerStuck: 'Impossibile scrivere il registro dei task: {err}',
      dlgTitle: 'Seleziona uno script BAT',
      dlgFilterBatch: 'File batch',
      dlgFilterAll: 'Tutti i file',
      demoHostLang: 'Lingua dell’interfaccia nelle impostazioni di DSH', demoPluginLang: 'Lingua dell’interfaccia di questo plugin',
      langLabel: 'Lingua dell’interfaccia', langFollowHost: 'Segui la lingua di DSH (ora: {lang})', demoNow: 'Il plugin sta usando: {lang} ({from})',
      demoNowShort: '{lang} · origine: {from}', demoFromHost: 'segue DSH', demoFromUser: 'scelta nel plugin',
      demoFromHostShort: 'segue DSH', demoFromUserShort: 'scelta qui',
      langHint: 'Finché è selezionato «Segui la lingua di DSH», cambiando lingua in DSH cambia anche qui; appena scegli tu, vale l’impostazione del plugin, anche dopo un riavvio. In questa finestra la lingua è solo un’anteprima: Salva la mantiene, Annulla la ripristina.',
      demoLogUntouched: 'Queste tre righe nel pannello sono l’output grezzo del bat: mai tradotto, senza timestamp, senza livelli, senza colori — in qualunque lingua.',
      capPanelLog: 'Pannello · con log', capPanelEmpty: 'Pannello · vuoto', capPanelWait: 'Pannello · connesso, in attesa', capWin: 'Finestra delle impostazioni (dalla rotella)', msgsCap: 'Le frasi che il plugin scrive sullo schermo (anch’esse prese dalla tabella)',
      panelTitleConnected: 'dsh-bat-runner · launcher collegato, pid {pid} · {build}',
      panelTitleDisconnected: 'dsh-bat-runner · launcher non collegato · {build}',
      panelTitleLocal: 'dsh-bat-runner · in esecuzione locale, pid {pid} · {build}',
      panelFooterHint: 'Trascina col tasto sinistro in un punto qualsiasi del pannello per spostarlo, tira il bordo in basso a destra per ridimensionare · la rotella in alto a destra apre la finestra delle impostazioni (esegui script / aspetto)',
      gearTitle: 'Impostazioni del log (esegui script / aspetto)',
      statusConnecting: 'Connessione…', statusConnected: 'Connesso', statusSilent: 'inattivo {n} s',
      statusDisconnected: 'BatRunner non connesso', statusDisconnectedErr: 'Non connesso ({err})',
      statusLocalRunning: 'In esecuzione {names} · pid {pid}',
      emptyHintNotConnected: 'Finché il launcher è aperto qui appare il log in diretta · puoi anche cliccare {gear} in alto a destra ed eseguire uno script al volo',
      emptyHintConnected: 'In attesa dell’output dello script…',
      runTitle: 'Esegui Bat', runningPill: 'in esecuzione da ', timingUnknown: 'durata sconosciuta',
      durTitle: 'Tempo dall’avvio, aggiornato ogni secondo',
      durHMS: '{h} h {m} min {s} s', durMS: '{m} min {s} s', durS: '{s} s',
      run: 'Esegui', stop: 'Ferma', del: 'Elimina',
      delTitleRunning: 'È ancora in esecuzione: prima premi “Ferma” (Elimina toglie soltanto dall’elenco, non ammazza nessun processo)',
      delTitleIdle: 'Togli questa voce dall’elenco (non è in esecuzione, nessun processo viene toccato)',
      runTip: 'Esegui questo script; l’output finisce direttamente nel pannello', stopTip: 'Termina questo processo e tutto ciò che ha generato (taskkill /F /T)',
      pickFile: 'Scegli file', picking: 'Scelta del file…', pickFileTitle: 'Apre la selezione file di sistema, partendo dall’ultima cartella usata',
      runSelected: 'Esegui selezionato', runSelectedTip: 'Esegui la voce attualmente selezionata',
      emptyList: 'L’elenco è vuoto: clicca su «Scegli file» qui sotto e prendi un .bat / .cmd dal disco.',
      haltLabel: 'Ferma gli script in esecuzione quando DSH esce',
      haltTitle: 'Attivo: alla chiusura di DSH gli script avviati dal plugin vengono terminati insieme a tutto ciò che hanno generato.\nDisattivo (predefinito): gli script continuano a girare dopo la chiusura di DSH.',
      haltHint: 'Disattivo per impostazione predefinita. Le modifiche valgono solo per le chiusure successive',
      autoLabel: 'Esegui automaticamente l’ultimo script scelto all’avvio di DSH',
      autoTitle: 'Attivo: dopo l’avvio di DSH la voce selezionata parte da sola. Una voce già in esecuzione non viene riavviata.',
      autoDelayPrefix: 'Ritardo ', autoDelaySuffix: ' s · gli script già in esecuzione non vengono riavviati', autoDelayTitle: '0–60 s; fuori gamma il valore viene limitato',
      lastExitLine: 'Ultima uscita: {name} · codice {code} · {at}',
      appearanceTitle: 'Aspetto del log', fontLabel: 'Carattere', fontFallbackTitle: 'I caratteri assenti dalla macchina ripiegano automaticamente',
      fontNotMonoSuffix: ' (non a spaziatura fissa)', fontCustom: 'Personalizzato', sizeLabel: 'Dimensione (10–20 px)',
      sizeSmallerTitle: 'Più piccolo', sizeLargerTitle: 'Più grande', colorLabel: 'Colore del testo',
      colorFixedTitle: '{c} (colore fisso: identico in chiaro e scuro)', colorFollow: 'Segui',
      fxLabel: 'Effetti di testo (riga più recente)', fxAll: 'Applica a tutte le righe', fxFlow: 'Scorri con il log',
      fxFlowTitle: 'Dopo {n} secondi senza righe nuove la fascia luminosa si ferma sul posto (resta sullo schermo, non riparte dall’inizio); una riga nuova la riprende.\nDisattivo: la fascia continua a girare, con o senza righe nuove.',
      borderToggle: 'Bordo visibile',
      borderToggleTitle: 'Attivo per impostazione predefinita: un bordo di 1px resta attorno al pannello, così si trova anche senza log.\nDisattivo: comportamento di una volta — il bordo appare solo quando il puntatore è sopra.',
      borderHint: 'Attivo per impostazione predefinita. Spento, un pannello vuoto è solo testo e si perde facilmente',
      restoreDefaults: 'Ripristina predefiniti', cancel: 'Annulla', save: 'Salva', saveDirty: 'Salva (modifiche in corso)',
      draftHint: 'Il lato aspetto è una bozza in anteprima: le modifiche si vedono subito nel log, Annulla le disfà tutte, solo Salva le scrive. Il lato esecuzione vale al clic e viene ricordato — Annulla non lo riporta indietro.',
      fxNone: 'Nessuno', fxGreen: 'Raggio verde', fxPurple: 'Diffusione viola', fxRainbow: 'Arcobaleno (verde→giallo→arancio)',
      fxAurora: 'Aurora (verde→ciano→blu→viola)', fxFire: 'Fuoco (rosso→arancio→oro)', fxSunset: 'Tramonto (rosa→oro→arancio)',
      fxOcean: 'Abissale (ciano ghiaccio→blu→indaco)', fxMint: 'Menta (verde acqua chiaro→scuro)', fxNeon: 'Neon (blu→viola→rosa)',
      msgPickFailed: 'Impossibile aprire la selezione file: {err}', msgNoFile: 'Nessun file scelto', msgAlreadyInList: 'Questo script è già nell’elenco',
      msgAdded: 'Aggiunto all’elenco: {file}', msgDeleted: 'Rimosso dall’elenco: {path}',
      msgDeleteBlocked: 'È ancora in esecuzione: prima premi “Ferma” (questa voce è intatta e lo script non è stato ammazzato)',
      msgAlreadyRunning: 'C’è già uno script in esecuzione, non è partito nulla', msgRunFailed: 'Esecuzione fallita: {err}',
      msgStopFailed: 'Arresto fallito: {err}', msgNotRunning: 'Questa voce non è in esecuzione', msgSettingFailed: 'Impostazione non inviata: {err}',
      reclaimedLine: 'Ripreso {name}, che girava già prima del riavvio di DSH (pid script {pid})',
      haltedLine: 'Secondo «ferma all’uscita di DSH», ripulito {name} che la generazione precedente non si era portato via (pid script {pid})'
    };

    var RUN_KEY = 'dsh-batrunner-logs:run';
    var DEF_RUN = { entries: [], sel: '', autoStart: false, delay: 0, haltOnExit: false, lastDir: '' };
    // —— 界面语言引擎 ——
    // 取话：当前那张表 → 这条缺了就退英文 → 还缺就退回编号本身（宁可露编号也别憋出一个空字）。
    // 话里带 {name} 这类占位的，按 params 填进去；填完还剩占位也没关系（说明表里写了不该有的占位）。
    function tr(key, params) {
      var s = (I18N[lang.cur] && I18N[lang.cur][key]) || I18N.en[key] || key;
      // 参数本身也可以是「另一句话」（{k,p}）：宿主把「退出码 3」这类小区块交给界面现拼，所以这里多解一层
      if (params) for (var k in params) {
        var v = params[k];
        if (v && typeof v === 'object' && v.k) v = tr(v.k, v.p);
        s = s.split('{' + k + '}').join(String(v));
      }
      return s;
    }
    // 有的句子中间要塞一个真图标（空态那句里那颗齿轮）：话里留 {gear} 占位，渲染时把话切开、图标插回原位，
    // 这样每种语言都能自己决定图标落在哪，不必跟着中文的语序走。
    function trParts(key, node) {
      var s = tr(key), m = s.split('{gear}');
      return m.length > 1 ? [m[0], node, m.slice(1).join('{gear}')] : s;
    }
    // 宿主状态行现在带一份结构化标记 note={k:编号, p:参数}：有 note 就按当前语言现拼句子；
    // 没有 note 的行是脚本自己吐出来的原话——**一个字都不动**（逐字是定档铁律）。
    function lineText(l) { return (l && l.note && l.note.k) ? tr(l.note.k, l.note.p) : ((l && l.text) || ''); }
    // 宿主那边回话也给编号（code），界面按编号出话；老宿主只给字符串时照原样显示。
    var HOST_CODE_KEYS = { already_running: 'msgAlreadyRunning', not_running: 'msgNotRunning', no_file: 'msgNoFile' };
    function hostMsg(value, fallbackKey) {
      var k = value && value.code ? HOST_CODE_KEYS[value.code] : '';
      return k ? tr(k) : ((value && value.message) || tr(fallbackKey));
    }
    function pickLocale(tag) {
      var x = String(tag || '').toLowerCase().replace(/_/g, '-');
      if (I18N[x]) return x;
      if (x.indexOf('zh') === 0) return /(^|-)(tw|hk|mo|hant)/.test(x) ? 'zh-TW' : 'zh-CN';
      var base = x.split('-')[0];
      return I18N[base] ? base : 'en';
    }
    var LANG_NAMES = { en: 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ko: '한국어', ja: '日本語',
      de: 'Deutsch', fr: 'Français', ru: 'Русский', it: 'Italiano' };
    function langName(code) { return LANG_NAMES[code] || code; }
    var lang = { stored: 'auto', host: '', cur: 'en', from: 'host' };
    function langReadHostTag() {
      var el = document.documentElement;
      var raw = (el && typeof el.getAttribute === 'function') ? el.getAttribute('lang') : '';
      return String(raw || '').toLowerCase();
    }
    function langApply() {
      lang.host = langReadHostTag();
      if (lang.stored === 'auto') { lang.cur = pickLocale(lang.host); lang.from = 'host'; }
      else { lang.cur = pickLocale(lang.stored); lang.from = 'user'; }
    }
    /* 生效值和落盘值得分开：设置窗里切语言只是预览（当场就看到），按下保存才写进存档。
     * 以前 langSetStored 一边切一边写盘，于是「取消」根本撤不回语言——外观那半边早就有草稿规矩了，
     * 语言不能例外。所以窗里走 langPreview，只有 commitLook（保存）才 langPersist。 */
    function langPreview(v) { lang.stored = v; langApply(); langEmit(); }
    function langPersist() { try { localStorage.setItem(LANG_KEY, lang.stored); } catch (e) { /* 存不进去也别挡着用户改语言 */ } }
    function langSetStored(v) { langPreview(v); langPersist(); }
    // 订阅：语言一变，挂着的界面就重渲染（面板组件在 useEffect 里 langOn / langOff）
    var langSubs = [];
    function langOn(fn) { langSubs.push(fn); }
    function langOff(fn) { for (var i = langSubs.length - 1; i >= 0; i--) if (langSubs[i] === fn) langSubs.splice(i, 1); }
    function langEmit() { for (var i = 0; i < langSubs.length; i++) { try { langSubs[i](); } catch (e) {} } }
    // 跟 DSH：宿主把界面语言写在 <html lang> 上（实测切英文后就是 lang="en"）。盯住这个属性——
    // 和现在盯 body[data-ds-dark-theme] 换深浅是同一招。用户自己选过语言就不再跟，但 host 值仍留着显示。
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (lang.stored === 'auto') { langApply(); langEmit(); } else { lang.host = langReadHostTag(); langEmit(); }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    try { lang.stored = localStorage.getItem(LANG_KEY) || 'auto'; } catch (e) { lang.stored = 'auto'; }
    langApply();

    var MAX_DELAY = 60;
    var MIN_SIZE = 10, MAX_SIZE = 20;
    // b13：fxSync 整个删除——多行相位对齐不再是开关，而是唯一原生行为（不同步=bug）。
    // 新增 fxFlow =「随日志滚动」：勾上时日志停够 FX_IDLE_MS 光带原地暂停，来新行再续上。
    var DEF_LOOK = { font: MONO, size: FS, color: '#C9CBD0', fx: 'none', fxAll: false, fxFlow: true, border: true };
    var PALETTE = ['#C9CBD0', '#9AA0A8', '#FFFFFF', '#E6C12E', '#4EC9B0', '#E6AA1E', '#78B3FF', '#E07170'];
    var FONTS = [ // 预置 21 款（css 里的回退链保证机器上没装也能换个近似的看）
      { name: 'Cascadia Mono',    css: MONO, mono: true },
      { name: 'Consolas',         css: "'Consolas',ui-monospace,monospace", mono: true },
      { name: 'JetBrains Mono',   css: "'JetBrains Mono',ui-monospace,monospace", mono: true },
      { name: 'Source Code Pro',  css: "'Source Code Pro',ui-monospace,monospace", mono: true },
      { name: 'IBM Plex Mono',    css: "'IBM Plex Mono',ui-monospace,monospace", mono: true },
      { name: 'Cascadia Code',    css: "'Cascadia Code',ui-monospace,monospace", mono: true },
      { name: 'Fira Code',        css: "'Fira Code',ui-monospace,monospace", mono: true },
      { name: '等宽黑白（思源）',  css: "'Sarasa Mono SC','Sarasa Term SC',monospace", mono: true },
      { name: 'Maple Mono',       css: "'Maple Mono CN','Maple Mono NL','Maple Mono',monospace", mono: true },
      { name: 'Inconsolata',      css: "'Inconsolata',ui-monospace,monospace", mono: true },
      { name: 'DejaVu Sans Mono', css: "'DejaVu Sans Mono',ui-monospace,monospace", mono: true },
      { name: 'Ubuntu Mono',      css: "'Ubuntu Mono',ui-monospace,monospace", mono: true },
      { name: 'Liberation Mono',  css: "'Liberation Mono',ui-monospace,monospace", mono: true },
      { name: 'Lucida Console',   css: "'Lucida Console',monospace", mono: true },
      { name: 'MS Gothic',        css: "'MS Gothic',monospace", mono: true },
      { name: 'Courier New',      css: "'Courier New',monospace", mono: true },
      { name: '微软雅黑',          css: "'Microsoft YaHei UI','Microsoft YaHei',sans-serif", mono: false },
      { name: '幼圆',              css: "'YouYuan',sans-serif", mono: false },
      { name: '宋体',              css: "'SimSun',serif", mono: false },
      { name: 'Georgia',          css: "Georgia,serif", mono: false },
      { name: 'Verdana',          css: "Verdana,Tahoma,sans-serif", mono: false },
];
    /* 三色行色循环（橙/青/紫）——按行序号轮换 */
    var ROW_COLORS = ['#F0A040', '#4EC9B0', '#B98ECF'];
    /* 文字特效（最新行探照灯渐变光带）：9 种预设 + 无 */
    // label 这一列只是给读代码的人看的中文名；屏上特效下拉里显示什么，由语言表决定（见设置窗里 tr('fxXxx')）。
    var FX_DEFS = [
      { id: 'none',    label: '无' },
      { id: 'green',   label: '绿色光束',    size: '260% 100%', dur: '3s',
        stops: '#50E896 40%,#00E676 44%,#00E676 56%,#50E896 60%' },
      { id: 'purple',  label: '紫色漫射',    size: '260% 100%', dur: '3.5s',
        stops: '#7C6AE8 39%,#A78BFA 42%,#C4B5FD 45%,#DDD6FE 48%,#DDD6FE 52%,#C4B5FD 55%,#A78BFA 58%,#7C6AE8 61%' },
      { id: 'rainbow', label: '彩虹（绿→黄→橙）', size: '260% 100%', dur: '3.5s',
        stops: '#00E676 39%,#76FF03 42%,#FFEE58 45%,#FFB74D 48%,#FF7043 52%,#FFAB91 55%,#C9CBD0 58%' },
      { id: 'aurora',  label: '极光（绿→青→蓝→紫）', size: '260% 100%', dur: '3.5s',
        stops: '#00E676 39%,#00BCD4 42%,#0091EA 45%,#7C4DFF 48%,#B388FF 50%,#7C4DFF 52%,#0091EA 55%,#00BCD4 58%,#00E676 61%' },
      { id: 'fire',    label: '火焰（红→橙→金）', size: '260% 100%', dur: '2.8s',
        stops: '#FF3D3D 39%,#FF6D00 43%,#FFAB00 47%,#FFD740 50%,#FFAB00 53%,#FF6D00 57%,#FF3D3D 61%' },
      { id: 'sunset',  label: '日落（粉→金→橙）', size: '260% 100%', dur: '3.2s',
        stops: '#FF6B9D 39%,#F48FB1 42%,#FFB74D 45%,#FFD54F 48%,#FFECB3 50%,#FFD54F 52%,#FFB74D 55%,#F48FB1 58%,#FF6B9D 61%' },
      { id: 'ocean',   label: '深海（冰青→蓝→靛）', size: '260% 100%', dur: '3s',
        stops: '#00E5FF 39%,#00B0FF 42%,#2962FF 46%,#3D5AFE 48%,#3D5AFE 52%,#2962FF 54%,#00B0FF 58%,#00E5FF 61%' },
      { id: 'mint',    label: '薄荷（浅青绿→深青绿）', size: '260% 100%', dur: '3s',
        stops: '#A7FFEB 39%,#64FFDA 42%,#1DE9B6 46%,#00BFA5 50%,#00BFA5 54%,#1DE9B6 58%,#64FFDA 61%,#A7FFEB 64%' },
      { id: 'neon',    label: '电光（蓝→紫→粉）', size: '260% 100%', dur: '3.5s',
        stops: '#448AFF 38%,#536DFE 40%,#7C4DFF 43%,#B388FF 46%,#EA80FC 48%,#F48FB1 52%,#EA80FC 54%,#B388FF 57%,#7C4DFF 60%,#536DFE 62%,#448AFF 64%' },
    ];
    var FX_STYLE_ID = 'brl-fx-style';   // 注入到 document.head 的 <style> 的 id
    // b12：同步特效走 Web Animations API；负 animation-delay 只留给不支持 getAnimations 的浏览器兜底。
    var CAN_WAAPI = (typeof Element !== 'undefined') && !!Element.prototype
      && typeof Element.prototype.getAnimations === 'function';
    var RESIZE_HOLD_MS = 500;     // 改尺寸后边框再留这么久，免得拉一下就闪掉
    var RESIZE_CORNER = 18;       // 右下角这块只归原生「拉边框改大小」，按下落在这儿就不启动拖动
    var GRIP_HOLD_MS = 3000;      // 齿轮：鼠标离开 3 秒后才收起（拖动本身不再需要"把手"）
    var REVEAL_MS = 420;          // 一行最多 420ms 出完（轮询 700ms，绝不会被下一行追上）
    var REVEAL_TICK = 24;
    // b13「随日志滚动」：最后一次看到新日志起，静默超过这个毫秒数就把光带**原地暂停**
    // （不是消失、也不是回到行首），再来新行时从暂停处继续。
    // 窗口长度改这里即可，自测的推进步长从源码读这个值，不会跟着腐烂。
    var FX_IDLE_MS = 30000;
    var FLOW_TICK = 250;          // 静止判定的复查节拍（与显隐那条 250ms 各自独立，互不牵连）
    var STORE_KEY = 'dsh-batrunner-logs:geom';
    var DEF = { x: 0, y: 96, w: 760, h: 118 };
    var MINW = 320, MINH = 40, MAXW = 1100, MAXH = 700;
    var POLL_MS = 700;
    var Z = 9000;
    // 构建标记：没有标题栏之后它没有地方显示，就挂在面板的 title 上（悬停可见、
    // devtools 也一眼能查到）。这几轮反复出现"DSH 还在跑旧构建"的误判，得有办法验证。
    // b23：宿主半改了「退出 DSH 时停止」的实现（改由启动器盯宿主管道，不再靠 JS 退出钩子）。
    // b24：正在运行的条目不许删——要先按「停止」；删也不再顺手把进程停掉（用户分不清删的是显示还是脚本）。
    // b25：「退出即停」的真相源改成宿主的 settings.json。旧写法挂载时把浏览器缓存推给宿主，
    //      换个 profile 一打开就把用户勾好的值冲成默认，连宿主落盘那份一起改错。
    var BUILD = 'b36';
    /* 设置窗里小件的样式（模块级：不随每次渲染新建对象）。
     * b18 之前这里还有 P_POP / POP_GAP —— 那是 A 版"贴着面板底缘挂的小卡"，居中窗落地后它没人用了，
     * 留着只会让人以为设置窗还跟面板高度绑着。 */
    var P_TTL = { fontSize: 12, fontWeight: 700, color: '#E6E7EA', marginBottom: 10 };
    var P_FLD = { marginBottom: 10 };
    var P_LBL = { fontSize: 11, color: '#9AA0A8', margin: '0 0 4px 0' };
    var P_ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
    var P_SEL = { width: '100%', background: '#17181B', color: '#E6E7EA', border: '1px solid  #3A3F47',
      borderRadius: 5, padding: '4px 6px', font: '12px ' + UI, outline: 'none' };
    var P_STEP = { display: 'inline-flex', alignItems: 'center' };
    var P_STB = { width: 24, height: 26, background: '#202226', color: '#E6E7EA',
      border: '1px solid  #3A3F47', cursor: 'pointer', fontSize: 13 };
    var P_STN = { minWidth: 34, textAlign: 'center', height: 26, lineHeight: '26px', background: '#17181B',
      color: '#E6E7EA', borderTop: '1px solid  #3A3F47', borderBottom: '1px solid  #3A3F47', fontSize: 12 };
    var P_SW = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
    // 色点一律带一圈细描边：浅色卡上纯白点和纯黑点本来分不开（取色器同款）
    var P_SWLINE = '0 0 0 1px  #3A3F47';
    var P_CPICK = { width: 26, height: 22, padding: 0, border: '1px solid  #3A3F47', borderRadius: 4,
      background: '#17181B', cursor: 'pointer' };
    var P_FOOT = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 };
    var P_BTN = { borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: '1px solid  #3A3F47', background: '#202226', color: '#E6E7EA' };
    var P_SAVE = { borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: '1px solid #0078D4', background: '#0078D4', color: '#fff', fontWeight: 600 };
    var P_SAVE_DIRTY = { borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: '1px solid #25A74F', background: '#25A74F', color: '#fff', fontWeight: 600 };
    var P_HINT = { fontSize: 11, color: '#6E6E73', marginTop: 8 };

    /* ---------- 居中窗（C 版定档）与运行区小件：模块级，别每次渲染新建对象 ---------- */
    var P_MASK = { position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 6,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      WebkitAppRegion: 'no-drag', appRegion: 'no-drag' };
    var P_MODAL = { width: 780, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)',
      display: 'flex', alignItems: 'stretch', boxSizing: 'border-box', background: '#202226',
      border: '1px solid rgba(122,170,255,.45)', borderRadius: 10, boxShadow: '0 18px 48px rgba(0,0,0,.6)',
      color: '#E6E7EA', fontFamily: UI, fontSize: 12, padding: 14, cursor: 'default', userSelect: 'none',
      overflow: 'auto', WebkitAppRegion: 'no-drag', appRegion: 'no-drag' };
    var P_RUN = { flex: '1 1 52%', minWidth: 0, paddingRight: 14, borderRight: '1px solid  #303439' };
    var P_PANE = { flex: '1 1 48%', minWidth: 0, paddingLeft: 14 };
    var P_LIST = { maxHeight: 232, overflowY: 'auto', margin: '0 0 8px 0' };
    // 条目行：左边那条竖线就是状态——橙=正在跑，蓝=当前选中（自动运行跑的就是选中的那条）
    var P_ENT = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 6,
      borderRadius: 6, border: '1px solid transparent', borderLeft: '3px solid transparent',
      background: '#17181B', boxSizing: 'border-box', cursor: 'pointer' };
    var P_ENT_SEL = { border: '1px solid  #3D6FA8', borderLeft: '3px solid #78B3FF', background: '#1B2331' };
    // 运行态只画框与左条，底色让给「选中」（b35：两件事互不遮盖，与启动器侧「整行底色不参与运行态」同口径）
    var P_ENT_ON = { border: '1px solid #EF6950', borderLeft: '3px solid #EF6950' };
    var P_TXT = { flex: '1 1 auto', minWidth: 0 };
    var P_NAMEL = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 };
    var P_NAME = { fontSize: 12, color: '#E6E7EA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };
    var P_PATH = { fontSize: 11, color: '#8A9099', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
    var P_ACT = { display: 'flex', gap: 6, flex: '0 0 auto', alignItems: 'center' };
    // 运行时长胶囊（b34 定档：挂在条目名右侧、时长带单位；pid 已从屏上撤掉，只在面板 title 里留着）
    var P_DUR = { display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto', height: 17,
      padding: '0 7px', borderRadius: 9, border: '1px solid #E8A33D', background: 'rgba(232,163,61,0.14)',
      color: '#E8A33D', fontSize: 10.5, whiteSpace: 'nowrap' };
    var P_DURN = { fontSize: 11, color: '#F2C17A', letterSpacing: '0.2px' };
    var P_DOT = { display: 'block', width: 5, height: 5, borderRadius: '50%', background: '#E8A33D', flex: '0 0 auto' };
    var P_GO = Object.assign({}, P_BTN, { padding: '4px 10px' });
    var P_STOP = { borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: '1px solid #EF6950', background: '#2A1F1C', color: '#FFB4A2' };
    var P_DEL = { borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
      border: '1px solid  #3A3F47', background: '#202226', color: '#9AA0A8' };
    var P_ADD = { borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: '1px solid #0078D4', background: '#0078D4', color: '#fff', fontWeight: 600 };
    var P_EMPTY = { fontSize: 12, color: '#6E6E73', padding: '10px 8px', background: '#17181B', borderRadius: 6 };
    var P_CHK = { display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 9 };
    var P_CHKTX = { fontSize: 12, color: '#E6E7EA', cursor: 'pointer' };
    var P_SUB = { fontSize: 11, color: '#8A9099', marginLeft: 20, marginTop: 3, whiteSpace: 'nowrap' };
    var P_NUM = { width: 42, background: '#17181B', color: '#E6E7EA', border: '1px solid  #3A3F47',
      borderRadius: 5, padding: '3px 6px', font: '12px ' + UI, outline: 'none' };
    var P_MSG = { fontSize: 11, color: '#8A9099', marginTop: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' };
    var P_MSG_BAD = { color: '#FF9A8A' };

    /* ---------- 几何：读写 localStorage，并夹在视口内 ---------- */
    function clampGeom(g) {
      var vw = window.innerWidth, vh = window.innerHeight;
      var w = Math.max(MINW, Math.min(g.w, Math.min(MAXW, vw - 8)));
      var hh = Math.max(MINH, Math.min(g.h, Math.min(MAXH, vh - 8)));
      var x = Math.max(0, Math.min(g.x === 0 ? vw - w - 24 : g.x, vw - w));
      var y = Math.max(0, Math.min(g.y, vh - 28));
      return { x: x, y: y, w: w, h: hh };
    }
    function loadGeom() {
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return clampGeom(DEF);
        return clampGeom(Object.assign({}, DEF, JSON.parse(raw)));
      } catch (e) { return clampGeom(DEF); }
    }
    function saveGeom(g) {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(g)); } catch (e) { /* 写不进就算了 */ }
    }

    /* ---------- 外观设置：读时兜底（坏值/旧值一律拉回定档默认） ---------- */
    function loadLook() {
      try {
        var raw = window.localStorage.getItem(LOOK_KEY);
        if (!raw) return DEF_LOOK;
        var o = JSON.parse(raw) || {};
        var validFx = FX_DEFS.some(function(f){ return f.id === o.fx; });
        return {
          font: typeof o.font === 'string' && o.font ? o.font : DEF_LOOK.font,
          size: Math.max(MIN_SIZE, Math.min(MAX_SIZE, parseInt(o.size, 10) || DEF_LOOK.size)),
          color: /^#[0-9a-fA-F]{3,8}$/.test(o.color || '') ? o.color : DEF_LOOK.color,
          fx: validFx ? o.fx : DEF_LOOK.fx,
          fxAll: o.fxAll === true,
          // 旧配置里没有 fxFlow → 按定档默认（勾上）；只有显式写 false 才关。
          // 旧字段 fxSync（b12 那个开关）不再读：它的作用已升级为不可关的原生行为。
          fxFlow: o.fxFlow !== false,
          // b33：外边框默认常显；只有显式写 false 才关（关掉 = 旧版"只在移入时显边"）
          border: o.border !== false,
        };
      } catch (e) { return DEF_LOOK; }
    }
    function saveLookNow(l) {
      try { window.localStorage.setItem(LOOK_KEY, JSON.stringify(l)); } catch (e) { /* 写不进就算了 */ }
    }
    /* DSH 用 body[data-ds-dark-theme] 切深浅（浅色无属性）。状态字/边框跟着它走，
     * 这样在浅色 DSH 里不会出现"浅灰字压在白底上看不见"。 */
    function detectDark() {
      try {
        var b = document && document.body, de = document && document.documentElement;
        return !!((b && b.hasAttribute && b.hasAttribute('data-ds-dark-theme'))
          || (de && de.hasAttribute && de.hasAttribute('data-ds-dark-theme')));
      } catch (e) { return true; }
    }

    /* ---------- 运行侧：条目 / 选中 / 两个勾选 / 延迟 / 上次打开的目录 ----------
     * 和外观不同，这些点下去就生效并落盘，没有草稿也就不会被窗底的「取消」回滚：
     * 「退出即停」「开机自动跑」「延迟几秒」都是行为开关，等一个「保存」按钮很别扭。
     * 「取消」回滚的只有外观那份草稿（外观是预览性质的）。 */
    function clampDelay(v) {
      var n = parseInt(v, 10);
      if (!isFinite(n) || isNaN(n)) return 0;
      return Math.max(0, Math.min(MAX_DELAY, n));
    }
    function dirOf(p) {
      var s = String(p || '').replace(/[\\/]+$/, '');
      var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
      return i > 0 ? s.slice(0, i) : '';
    }
    function baseName(p) {
      var s = String(p || '');
      var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
      return i >= 0 ? s.slice(i + 1) : s;
    }
    function normEntry(e, i) {
      var p = typeof e.path === 'string' ? e.path.trim() : '';
      if (!p) return null;
      return {
        id: (typeof e.id === 'string' && e.id) ? e.id : ('e' + (i || 0) + '-' + p.length),
        name: (typeof e.name === 'string' && e.name.trim()) ? e.name.trim() : (baseName(p) || p),
        path: p,
      };
    }
    function newEntryId(p) {
      return 'e' + Date.now().toString(36) + '-' + String(Math.random()).slice(2, 8) + '-' + (p.length % 997);
    }
    function loadRun() {
      try {
        var raw = window.localStorage.getItem(RUN_KEY);
        if (!raw) return Object.assign({}, DEF_RUN);
        var o = JSON.parse(raw) || {};
        var list = [];
        if (Array.isArray(o.entries)) {
          for (var i = 0; i < o.entries.length; i++) {
            var e = normEntry(o.entries[i] || {}, i);
            if (e) list.push(e);
          }
        }
        var sel = typeof o.sel === 'string' ? o.sel : '';
        // 选中的那条可能已被删掉：退回到列表第一条，保证「自动运行上次选的」永远有个明确对象。
        if (!list.some(function (x) { return x.id === sel; })) sel = list.length ? list[0].id : '';
        return {
          entries: list,
          sel: sel,
          autoStart: o.autoStart === true,
          delay: clampDelay(o.delay),
          haltOnExit: o.haltOnExit === true,
          lastDir: typeof o.lastDir === 'string' ? o.lastDir : '',
        };
      } catch (e) { return Object.assign({}, DEF_RUN); }
    }
    function saveRunNow(r) {
      try { window.localStorage.setItem(RUN_KEY, JSON.stringify(r)); } catch (e) { /* 写不进就算了 */ }
    }

    /* ---------- 换行测量与可见行装箱（b10：不再截断/省略号，按物理行数装箱） ----------
     * "这行在当前宽度折成几行"不能按等宽估字宽——字体/字号是用户可调的，预置里还有非等宽字体。
     * 所以挂一个与行**完全同样式**（whiteSpace/wordBreak/font/字号/行高/宽度）的隐藏测量层实测。
     * 结果按 (font,size,width,text) 缓存：逐字浮现每 24ms 只改最新一行的文本，
     * 每拍只可能重测最新那 1 行，其余行在 700ms 轮询周期里全部命中缓存，不会拖出布局抖动。
     * 没有 DOM（自测脚手架里跑）测不了，兜底按每行 1 行 = 旧行为。 */
    var M_BORDER = 2, M_PAD_X = 34, M_PAD_Y = 10, ROW_GAP = 3;  // 面板 1px 边框×2；行区左 8 + 右 26（齿轮 22 + 内缩 2 + 间隙 2）、上下 5×2；行间距 3px
    var measor = null;
    function ensureMeasor() {
      if (measor) return measor;
      if (typeof document === 'undefined' || !document.body || !document.createElement) return null;
      var el = document.createElement('div');
      var s = el.style;
      s.position = 'fixed'; s.left = '-100000px'; s.top = '0'; s.visibility = 'hidden';
      s.boxSizing = 'border-box'; s.width = '100px'; s.height = 'auto'; s.margin = '0';
      s.whiteSpace = 'pre-wrap'; s.wordBreak = 'break-all'; s.overflowWrap = 'break-word';
      document.body.appendChild(el);
      measor = el;
      return measor;
    }
    var measCache = new Map();   // 攒满 600 条整盘丢：重测只是毫秒级，别让日志文本把内存吃穿
    function wrapCount(text, width, font, size, lh) {
      if (!text) return 1;       // 空行也占一行，与行渲染的 minHeight 对齐
      var key = font + '\u0001' + size + '\u0001' + width + '\u0001' + text;
      var hit = measCache.get(key);
      if (hit !== undefined) return hit;
      var n = 1, m = ensureMeasor();
      if (m) {
        m.style.width = width + 'px';
        m.style.fontFamily = font;
        m.style.fontSize = size + 'px';
        m.style.lineHeight = lh + 'px';
        m.textContent = text;
        n = Math.max(1, Math.round(m.offsetHeight / lh));
      }
      if (measCache.size > 600) measCache.clear();
      measCache.set(key, n);
      return n;
    }
    /** 从最新一行往回装箱：只装得下整行（换行后）就显示，装不下整行就整行舍掉；最新一行永远保留。 */
    function fitShown(lines, panelW, panelH, font, size, lh) {
      var width = Math.max(60, panelW - M_BORDER - M_PAD_X);
      var budget = panelH - M_BORDER - M_PAD_Y;
      var out = [];
      for (var i = lines.length - 1; i >= 0; i--) {
        var need = wrapCount(lineText(lines[i]), width, font, size, lh) * lh + (out.length ? ROW_GAP : 0);
        if (need > budget) {
          if (!out.length) out.push(lines[i]);   // 连最新一行都装不下：仍显示它，靠 overflow 裁掉上部——最新一行永远优先
          break;
        }
        budget -= need;
        out.unshift(lines[i]);
      }
      return out;
    }

    /* ---------- RPC：state 轮询和 run / stop / pick / cfg 共用同一条信封 ----------
     * 宿主那边每个 endpoint 都要求 message.method 与 endpoint 同名，所以 method 直接拼进 URL。
     * result.ok 为假时把 error.message 交给调用方：运行失败要能在窗里看见，不能只是"没反应"。 */
    function rpc(method, payload, done) {
      var rpcId = 'brl-' + String(Math.random()).slice(2, 10);
      fetch('/dsh-batrunner-logs/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: rpcId, method: method, payload: payload || {} }),
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (full) {
        if (!full || full.type !== 'server-response' || full.rpcId !== rpcId) {
          done(new Error(tr('rpcBadResponse', { method: method })), null);
          return;
        }
        var res = full.result || {};
        if (res.ok === true) done(null, res.value);
        else done(new Error((res.error && res.error.message) || tr('rpcCallFailed', { method: method })), null);
      }).catch(function (e) { done(new Error(String(e && e.message || e)), null); });
    }

    /** 宿主那串本地时间戳 'YYYY-MM-DD HH:MM:SS.mmm' → 毫秒。认不出来返回 0（屏上写「计时未知」）。 */
    function durStamp(s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(s || ''));
      if (!m) return 0;
      // 13 月 / 45 日 / 99 点这类坏台账会被 Date 自己进位成一个看着能用的时刻：
      // 宁可当场说不知道，也别在屏上报一个来历不明的数字。
      if (+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return 0;
      var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] || 0)).getTime();
      return t > 0 ? t : 0;
    }

    /** 运行时长带单位：45秒 / 23分45秒 / 1小时23分45秒（高位为零就不写那一段，秒始终写）。 */
    function durText(ms) {
      var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60), x = s % 60;
      if (h > 0) return tr('durHMS', { h: h, m: mi, s: x });
      if (mi > 0) return tr('durMS', { m: mi, s: x });
      return tr('durS', { s: x });
    }

    function poll(setSnap, setErr) {
      rpc('state', {}, function (err, value) {
        if (err) setErr(String(err.message || err));
        else { setSnap(value); setErr(''); }
      });
    }

    function LogPanel() {
      var snapS = react.useState(null); var snap = snapS[0]; var setSnap = snapS[1];
      var errS = react.useState(''); var err = errS[0]; var setErr = errS[1];
      var geomS = react.useState(loadGeom); var geom = geomS[0]; var setGeom = geomS[1];
      var uiS = react.useState({ border: false, grip: false, gear: false }); var ui = uiS[0]; var setUi = uiS[1];
      var lookS = react.useState(loadLook); var look = lookS[0]; var setLook = lookS[1];
      var openS = react.useState(false); var open = openS[0]; var setOpen = openS[1];
      var draftS = react.useState(null); var draft = draftS[0]; var setDraft = draftS[1];
      var runS = react.useState(loadRun); var runCfg = runS[0]; var setRunCfg = runS[1];
      var secS = react.useState(0); var secNow = secS[0]; var setSecNow = secS[1];   // 时长专用：每一拍踩在系统秒的整点上
      // b33：状态字/空态边框跟随 DSH 浅深外观（body[data-ds-dark-theme]）。主题切换时重渲染。
      var darkS = react.useState(detectDark); var dark = darkS[0]; var setDark = darkS[1];
      react.useEffect(function () {
        if (typeof MutationObserver === 'undefined') return undefined;
        try {
          setDark(detectDark());
          var obs = new MutationObserver(function () { setDark(detectDark()); });
          if (document.documentElement) obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
          if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
          return function () { obs.disconnect(); };
        } catch (e) { return undefined; }
      }, []);
      var busyS = react.useState(''); var busy = busyS[0]; var setBusy = busyS[1];   // 正在忙的那件事（挑文件要等人半天）：按钮只据此禁用，屏上文案恒定为「选择文件」，不跟着忙变
      var msgS = react.useState(''); var msg = msgS[0]; var setMsg = msgS[1];        // 窗底那一行提示：失败原因、退出码、最后动作
      var snapRef = react.useRef(null);       // 给定时器/回调用的最新快照（闭包里的 snap 会过期）
      var autoRanRef = react.useRef(false);   // 开机自动运行只在真正挂载那一次调度，别跟着重渲染重复排定时器
      var runEntryRef = react.useRef(null);
      var openRef = react.useRef(false);   // 250ms 那个节拍要知道"设置开着"，但不想为此重建 effect
      var hoverRef = react.useRef(false);
      var leftAtRef = react.useRef(0);
      var resizedAtRef = react.useRef(0);
      var sizeRef = react.useRef({ w: 0, h: 0 });
      var box = react.useRef(null);

      // 注入探照灯 @keyframes（全局只注入一次）
      react.useEffect(function () {
        if (typeof document === 'undefined') return;
        if (document.getElementById(FX_STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = FX_STYLE_ID;
        s.textContent = '@keyframes brl-sweep{0%{background-position:100% 0}100%{background-position:0% 0}}';
        document.head.appendChild(s);
      }, []);

      react.useEffect(function () {
        var alive = true;
        var tickPoll = function () { if (alive) poll(setSnap, setErr); };
        tickPoll();
        var t = setInterval(tickPoll, POLL_MS);
        return function () { alive = false; clearInterval(t); };
      }, []);

      /* 时长胶囊自己按系统秒边界排队：每一拍的落点正好踩在整秒上，间隔恒为 1000 毫秒。
       * 以前它搭上面那条 700ms 状态轮询的便车——700 与 1000 不整除，秒值的相位随机漂，
       * 某一拍被系统合并或页面被遮挡推迟一秒，屏幕上就连跳两格（用户实机看到的「一下跳 2 秒」）。 */
      react.useEffect(function () {
        var alive = true, timer = 0;
        var schedule = function () {
          if (!alive) return;
          var wait = 1000 - (Date.now() % 1000);          // 到下一个整秒还剩多久：取值区间 (0, 1000]
          timer = setTimeout(function () {
            if (!alive) return;
            setSecNow(Date.now());
            schedule();
          }, wait);
        };
        schedule();
        return function () { alive = false; clearTimeout(timer); };
      }, []);

      // 让官方那个 flex:none 的容器允许收缩；卸载时还原。
      react.useEffect(function () {
        var el = box.current;
        var c = el && el.parentNode ? el.parentNode : null;
        if (!c || !c.style) return;
        var wasFlex = c.style.flex, wasMin = c.style.minWidth;
        c.style.flex = '0 1 auto';
        c.style.minWidth = '0';
        return function () { c.style.flex = wasFlex; c.style.minWidth = wasMin; };
      }, []);

      // 250ms 一次算出"边框亮不亮 / 齿轮在不在"。
      // 边框：鼠标在面板上，或刚改过尺寸；齿轮：鼠标在面板上，或离开还不满 3 秒。
      react.useEffect(function () {
        var t = setInterval(function () {
          var now = Date.now();
          var hover = hoverRef.current;
          var resizing = now - resizedAtRef.current < RESIZE_HOLD_MS;
          var border = hover || resizing;
          var grip = hover || resizing || (now - leftAtRef.current < GRIP_HOLD_MS);
          var gear = grip || openRef.current;   // grip 这个标志如今只驱动齿轮（把手条 b30 已删）；外加：设置卡开着时齿轮常显
          setUi(function (u) { return (u.border === border && u.grip === grip && u.gear === gear) ? u
            : { border: border, grip: grip, gear: gear }; });
        }, 250);
        return function () { clearInterval(t); };
      }, []);

      // 只读地看面板实际尺寸：既给行数用，也用来发现"用户正在拉边框"。
      react.useEffect(function () {
        var el = box.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        var ro = new ResizeObserver(function (list) {
          var cr = list[0] && list[0].contentRect;
          if (!cr) return;
          var w = Math.round(cr.width), hh = Math.round(cr.height);
          var prev = sizeRef.current;
          if (prev.w && (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - hh) > 2)) {
            resizedAtRef.current = Date.now();
            setGeom(function (g) {
              var n = clampGeom({ x: g.x, y: g.y, w: w, h: hh });
              saveGeom(n); return n;
            });
          }
          sizeRef.current = { w: w, h: hh };
        });
        ro.observe(el);
        return function () { ro.disconnect(); };
      }, []);

      react.useEffect(function () {
        var onResize = function () { setGeom(function (g) { return clampGeom(g); }); };
        window.addEventListener('resize', onResize);
        return function () { window.removeEventListener('resize', onResize); };
      }, []);

      // 移入要**立刻**亮起来（所以这里直接落状态），移出交给 250ms 那个节拍去收。
      var enter = function () { hoverRef.current = true; setUi(function (u) { return (u.border && u.grip && u.gear) ? u : { border: true, grip: true, gear: true }; }); };
      var leave = function () { hoverRef.current = false; leftAtRef.current = Date.now(); };

      // 面板任意处左键按下就走（b30 定档：不要 Alt，也不要把手条）。三处细节：
      //   ① 右下角那个角归原生「拉边框改大小」：按下落在那里就直接放手，不抢（用户明确要求：
      //      触发了缩放就只做缩放）。而且这里绝不能 preventDefault——它会把原生缩放一起掐掉。
      //      边框没亮时 resize 是 none，那个角本来也能动，所以这时不让位。
      //   ② 点齿轮、点状态行只是点一下：手抖一两像素不该把面板挪走，累计动过 3 像素才算真开始拖。
      //   ③ 拖的是 fixed 定位的 left/top（改 geom），不动宿主窗口，所以用 clientX 就够，不会自反馈。
      var beginDrag = function (ev) {
        if (ev.button !== 0) return;
        var el = box.current; if (!el) return;
        if (ui.border) {
          var r = el.getBoundingClientRect();
          if (ev.clientX > r.right - RESIZE_CORNER && ev.clientY > r.bottom - RESIZE_CORNER) return;
        }
        var x0 = ev.clientX, y0 = ev.clientY, g0 = geom, started = false;
        ev.preventDefault();          // 顺手也断掉"按住划文字"：这块是只读日志，不给人划选
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* 老浏览器也能拖 */ }
        var move = function (e2) {
          var dx = e2.clientX - x0, dy = e2.clientY - y0;
          if (!started && Math.abs(dx) + Math.abs(dy) < 3) return;
          started = true;
          setGeom(clampGeom({ x: g0.x + dx, y: g0.y + dy, w: g0.w, h: g0.h }));
        };
        var up = function () {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          setGeom(function (g) { saveGeom(g); return g; });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };

      // 设置开关：打开 = 以当前外观为底开一份草稿；关掉一律弃稿。
      // 卡不会因"鼠标移开 / 时间到"自动收起（填一半突然没了没法操作）；会关它的只有
      // 再点齿轮 / 取消 / 保存，外加 b14 的**点面板与卡之外的空白**（见下面那个 document 监听）。
      var langBaseRef = react.useRef(null);   // 开窗那一刻的语言；null = 窗没开（语言的"草稿基线"）
      var closeSettings = function () {
        /* 弃稿连语言一起退回。窗里切语言只改内存生效值、从没写存档，所以退回只要把生效值摆回去。
         * 「取消」、再点齿轮、点窗外空白三条路都走这里，行为一致。 */
        var base = langBaseRef.current;
        langBaseRef.current = null;
        if (base !== null && base !== lang.stored) { lang.stored = base; langApply(); langEmit(); }
        openRef.current = false; setOpen(false); setDraft(null);
        // b32：设置窗一关就把预热的选文件进程回收掉（正在弹框时会等这次选完再收）
        rpc('warm', { on: false }, function () {});
      };
      var toggleOpen = function () {
        if (openRef.current) { closeSettings(); return; }
        openRef.current = true; setOpen(true); setDraft(Object.assign({}, look));
        langBaseRef.current = lang.stored;
        // b32：开窗就先让宿主把 WinForms 加载好，点「选择文件」不用再等 ~1 秒的冷启动
        rpc('warm', { on: true }, function () {});
      };
      var patch = function (p) { setDraft(function (d) { return Object.assign({}, d || look, p); }); };
      var commitLook = function () {
        if (!draft) return;
        var n = Object.assign({}, draft); setLook(n); saveLookNow(n);
        // 语言跟着「保存」才写盘；没动过就不写（省一次写，也让"取消"和"保存但啥也没改"完全等价）
        if (langBaseRef.current !== null && langBaseRef.current !== lang.stored) langPersist();
        langBaseRef.current = null;
        closeSettings();
      };

      /* ---------- 运行侧动作：增删条目、运行、停止、两个开关、延迟、选文件 ----------
       * 这一侧一律即时生效：点下去就落盘，需要宿主知道的再发一条 RPC。没有草稿，也就不会被
       * 窗底的「取消」还原——「取消」只回滚外观那份预览草稿，这是两边刻意不同的地方。 */
      var pathOf = function (id) {
        var list = runCfg.entries;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].path;
        return '';
      };
      var patchRun = function (p, sync) {
        setRunCfg(function (c) {
          var n = Object.assign({}, c, p);
          n.delay = clampDelay(n.delay);
          saveRunNow(n);
          return n;
        });
        if (sync) rpc('cfg', sync, function (err, value) {
          if (err) setMsg(tr('msgSettingFailed', { err: err.message }));
          else if (value && value.snapshot) setSnap(value.snapshot);
        });
      };
      var runEntry = function (entry, skipIfAny) {
        if (!entry) return;
        var s = snapRef.current;
        // 「已经有在跑的就别重复跑」这条判断放在这里，开机自动运行和手点运行共用一个口径
        if (skipIfAny && s && s.local && s.local.running) { setMsg(tr('msgAlreadyRunning')); return; }
        rpc('run', { id: entry.id, name: entry.name, path: entry.path }, function (err, value) {
          if (err) { setMsg(tr('msgRunFailed', { err: err.message })); return; }
          if (value.snapshot) setSnap(value.snapshot);
          setMsg(value.started ? '' : hostMsg(value, 'notStarted'));
        });
      };
      runEntryRef.current = runEntry;
      var stopEntry = function (entry) {
        rpc('stop', { id: entry.id }, function (err, value) {
          if (err) { setMsg(tr('msgStopFailed', { err: err.message })); return; }
          if (value.snapshot) setSnap(value.snapshot);
          setMsg(value.stopped ? '' : hostMsg(value, 'msgNotRunning'));
        });
      };
      var addEntry = function () {
        setBusy(tr('picking')); setMsg('');
        // 初始目录 = 上次打开对话框选的那个，没有就用当前条目的所在目录：用户要的就是"下次还停在上次那儿"
        rpc('pick', { dir: runCfg.lastDir || dirOf(pathOf(runCfg.sel)), lang: lang.cur }, function (err, value) {
          setBusy('');
          if (err) { setMsg(tr('msgPickFailed', { err: err.message })); return; }
          if (!value.path) { setMsg(tr('msgNoFile')); return; }
          var file = value.path;
          var dir = dirOf(file);
          var lower = file.toLowerCase();
          for (var i = 0; i < runCfg.entries.length; i++) {
            if (runCfg.entries[i].path.toLowerCase() === lower) {
              patchRun({ lastDir: dir });   // 目录照样记住，哪怕这次没新增条目
              setMsg(tr('msgAlreadyInList'));
              return;
            }
          }
          var entry = {
            id: newEntryId(file),
            name: baseName(file).replace(/\.(bat|cmd)$/i, '') || baseName(file),
            path: file,
          };
          patchRun({ entries: runCfg.entries.concat([entry]), sel: entry.id, lastDir: dir });
          setMsg(tr('msgAdded', { file: file }));
        });
      };
      /* 删除只管"从列表里拿掉这一条"，**运行中的不许删**：以前它顺手把进程也停了，
       * 结果用户看不出这条到底是"删了显示"还是"把脚本杀了"（用户实机反馈就是这个）。
       * 现在要先按「停止」（那条明确是杀进程，屏上还会写收尾行）才点得动「删」。 */
      var removeEntry = function (entry) {
        var s = snapRef.current;
        var live = (s && s.local && s.local.procs) || [];
        for (var k = 0; k < live.length; k++) {
          if (live[k].id !== entry.id) continue;
          setMsg(tr('msgDeleteBlocked'));
          return;
        }
        var list = [];
        for (var i = 0; i < runCfg.entries.length; i++) if (runCfg.entries[i].id !== entry.id) list.push(runCfg.entries[i]);
        var sel = runCfg.sel === entry.id ? (list.length ? list[0].id : '') : runCfg.sel;
        patchRun({ entries: list, sel: sel });
        setMsg(tr('msgDeleted', { path: entry.path }));
      };
      var setHalt = function (on) { patchRun({ haltOnExit: on }, { haltOnExit: on }); };
      var setAuto = function (on) { patchRun({ autoStart: on }); };
      var setDelay = function (v) { patchRun({ delay: clampDelay(v) }); };

      /* ---------- 挂载那一次：核对「退出即停」归谁记 + 排一次自动运行 ----------
       * b25：haltOnExit 的真相源换成宿主的 settings.json（跟任务台账同目录）。它管的是
       * 「DSH 这个进程走了以后脚本还跑不跑」，是这台机器上宿主的行为，不该由某个浏览器
       * profile 的缓存说了算——旧写法挂载时先把自己这份推给宿主，于是换个 profile（或插件
       * 自带的新页）一挂载就把用户勾好的 true 冲成默认 false，连宿主那份也一起改错。
       * 现在只在「宿主那份压根没存过」时才补推一次，把老版本存在浏览器里的勾选搬过去。
       * 自动运行按用户定的延迟排定时器；期间若已经有脚本在跑（上次退出留下的、或用户手动跑的），
       * runEntry 那句 skipIfAny 会让它什么都不做。定时器只在真正挂载时排一次，重渲染不重排。 */
      react.useEffect(function () {
        if (autoRanRef.current) return undefined;
        autoRanRef.current = true;
        var st = loadRun();
        rpc('state', {}, function (err, value) {
          if (err || !value) return;
          if (value.local && value.local.haltStored === false && st.haltOnExit) {
            rpc('cfg', { haltOnExit: true }, function (err2, back) {
              if (!err2 && back && back.snapshot) setSnap(back.snapshot);   // 搬完当场让那一格亮起来，不等下一轮轮询
            });
          }
        });
        if (!st.autoStart || !st.entries.length) return undefined;
        var target = st.entries[0];
        for (var i = 0; i < st.entries.length; i++) if (st.entries[i].id === st.sel) target = st.entries[i];
        var t = setTimeout(function () {
          if (runEntryRef.current) runEntryRef.current(target, true);
        }, clampDelay(st.delay) * 1000);
        return function () { clearTimeout(t); };
      }, []);

      /* ---------- b14：卡开着时点「面板与卡之外」立刻收起（等同再点齿轮：弃草稿、不落盘） ----------
       * 监听只在卡开着时挂，关卡就摘掉——平时不给宿主留一条 document 级热路径。
       * 判"在不在卡里"用 composedPath，而不是 el.contains(e.target)：
       *  ① 设置卡视觉上挂在面板外框下方 5px，DOM 上它却是面板的子节点，两条路都认得它；
       *  ② 万一宿主把 overlay 装进 shadow root，document 上看到的 target 会被重定向成 shadow host，
       *     contains 会把"点面板内"误判成点外面——那正是"一打开就被自己关掉"的经典现场。
       * 走捕获阶段：免得中间某个组件 stopPropagation 把外面的点击吃掉，卡死活收不起来。 */
      react.useEffect(function () {
        if (!open) return undefined;
        if (typeof document === 'undefined' || !document.addEventListener) return undefined;
        var onDocDown = function (e) {
          var el = box.current;
          if (!el) return;
          var path = typeof e.composedPath === 'function' ? e.composedPath() : null;
          var inside = path ? path.indexOf(el) >= 0
            : !!(el.contains && e.target && el.contains(e.target));
          if (!inside) closeSettings();   // 草稿整个丢掉；已经保存过的本来就没动
        };
        document.addEventListener('pointerdown', onDocDown, true);
        return function () { document.removeEventListener('pointerdown', onDocDown, true); };
      }, [open]);

      snapRef.current = snap;
      /* 日志看哪一路：插件自己有正在跑的脚本 → 只看本地这一屏（宿主那边同样在源头丢掉转发行）；
       * 本地没有在跑的就照旧显示启动器转发过来的。口径就是用户定的那一句。 */
      var localView = !!(snap && snap.local && snap.local.running);
      var lines = (snap && (localView ? snap.local.lines : snap.lines)) || [];
      var connected = !!(snap && snap.connected);
      var eff = draft || look;                            // 草稿即时上屏 = 预览；取消就整体还原回去
      var eSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, eff.size | 0));
      var eLH = eSize + 4;
      var shown = fitShown(lines, geom.w, geom.h, eff.font, eSize, eLH);
      var idleSec = snap && snap.lastLineAt ? Math.max(0, Math.round((Date.now() - snap.lastLineAt) / 1000)) : -1;

      /* ---------- b13「随日志滚动」：日志停够 FX_IDLE_MS → 光带原地暂停；来新行 → 从暂停处继续 ----------
       * 观测点是**面板实际收到的日志指纹**，不是宿主的 lastLineAt：BatRunner 每 2 秒发一次 ping
       * 心跳但那不是日志，拿连接层的时刻判"有没有日志"会一直误判成活跃；而轮询本身有 700ms 延迟，
       * 按"屏幕上有新东西"计时才和用户的观感对得上（静止 = 确实看不见新行）。
       * 暂停由 WAAPI pause() 做（b15 起；CSS animation-play-state 只留给没有 getAnimations 的浏览器）：
       * 动画被冻在当前帧上，不消失、不回行首，恢复也不重跑。 */
      var flowKey = lines.length + '\t' + (lines.length ? String(lines[lines.length - 1].ts) : '');
      var playS = react.useState(true); var flowPlaying = playS[0]; var setFlowPlaying = playS[1];
      var seenRef = react.useRef({ key: '', t: 0 });
      react.useEffect(function () {
        if (!lines.length) { seenRef.current = { key: '', t: 0 }; return; }   // 一条日志都没有：没东西可暂停
        if (seenRef.current.key !== flowKey) {
          seenRef.current = { key: flowKey, t: performance.now() };
          setFlowPlaying(true);
        }
      }, [flowKey]);
      react.useEffect(function () {
        var t = setInterval(function () {
          var s = seenRef.current;
          if (!s.key) return;
          setFlowPlaying(performance.now() - s.t <= FX_IDLE_MS);
        }, FLOW_TICK);
        return function () { clearInterval(t); };
      }, []);
      // 改外观（含卡内草稿的即时预览）也算一次活动：日志早就停了的话，用户换了特效却一动不动，
      // 会被当成"改了没生效"——那是过去几轮反复误判的老坑，这里主动给它一个 FX_IDLE_MS 的展示窗口。
      var lookSig = (eff.fx || 'none') + '|' + (eff.fxAll ? 1 : 0) + '|' + (eff.fxFlow ? 1 : 0)
        + '|' + eff.color + '|' + eff.size + '|' + eff.font;
      react.useEffect(function () {
        if (!seenRef.current.key) return;
        seenRef.current.t = performance.now();
        setFlowPlaying(true);
      }, [lookSig]);

      /* ---------- 界面语言：换语言时整块界面重渲染（日志正文不参与，见 lineText） ---------- */
      var langS = react.useState(0);
      react.useEffect(function () {
        var bump = function () { langS[1](function (n) { return n + 1; }); };
        langOn(bump); bump();
        return function () { langOff(bump); };
      }, []);

      /* ---------- B 版逐字浮现：只作用于最新一行 ---------- */
      var latest = shown.length ? lineText(shown[shown.length - 1]) : '';
      var revS = react.useState(-1); var rev = revS[0]; var setRev = revS[1];
      var revRef = react.useRef({ text: '', t0: 0 });
      react.useEffect(function () {
        if (!latest) { revRef.current = { text: '', t0: 0 }; setRev(-1); return; }
        if (revRef.current.text !== latest) {
          revRef.current = { text: latest, t0: performance.now() };
          setRev(0);
        }
        var iv = setInterval(function () {
          var cur = revRef.current;
          if (!cur.text) { clearInterval(iv); return; }
          var k = Math.round((performance.now() - cur.t0) / REVEAL_MS * cur.text.length);
          if (k >= cur.text.length) { setRev(cur.text.length); clearInterval(iv); }
          else setRev(k < 0 ? 0 : k);
        }, REVEAL_TICK);
        return function () { clearInterval(iv); };
      }, [latest]);

      // b12：光带同步不能只靠“所有行同一个负 animation-delay”：
      // 每行动画是在各自创建时起跑的，启动时刻不同，delay 相同相位仍会错开。
      // 支持 WAAPI 时把所有特效行的 startTime 钉到同一个文档时间轴起点（= 文档时间轴 − 墙上时间相位）；
      // 放在 layout effect 里，新行加入的那一帧、绘制前就对齐。负 delay 只做兜底。
      // b13：这套对齐**不再有开关**——不同步就是 bug，插件原生只有同步这一种行为。
      var syncSignal = (eff.fx || 'none') + '|' + (eff.fxAll ? 1 : 0)
        + '|' + eff.color + '|' + shown.map(function (l) { return l.ts + '\t' + lineText(l); }).join('\n');
      var useSyncFx = react.useLayoutEffect || react.useEffect;
      useSyncFx(function () {
        if (!CAN_WAAPI || (eff.fx || 'none') === 'none') return;
        if (typeof document === 'undefined' || !document.timeline) return;
        var fx = FX_DEFS.find(function (f) { return f.id === eff.fx; });
        if (!fx) return;
        var durMs = Math.round(parseFloat(fx.dur) * 1000);
        if (!(durMs > 0)) return;
        var host = box.current;
        if (!host || typeof host.querySelectorAll !== 'function') return;
        var tl = document.timeline.currentTime;
        if (typeof tl !== 'number' || !isFinite(tl)) return;
        var phase = ((Date.now() % durMs) + durMs) % durMs;
        var start = tl - phase;
        var nodes = host.querySelectorAll('[data-brl-fx]');
        for (var n = 0; n < nodes.length; n++) {
          var el = nodes[n];
          if (!el || typeof el.getAnimations !== 'function') continue;
          var anims = el.getAnimations();
          for (var k = 0; k < anims.length; k++) {
            try { anims[k].startTime = start; } catch (e) { /* 同步失败也不要打断渲染 */ }
          }
        }
      }, [syncSignal]);

      /* ---------- b15：暂停/恢复改走 WAAPI pause()/play()，不再写 CSS animation-play-state ----------
       * 真浏览器实测：脚本给一个"CSS 已经 paused"的动画赋值 startTime，动画会被唤醒并转为手动控制，
       * 此后 animation-play-state 再怎么改都不生效（inline 与 computed 都写着 paused，playState 仍是
       * running、光带照走）。而相位对齐是 layout effect（先跑）、flowPlaying 是 passive effect（后跑），
       * 所以"新行到达"那一帧必然踩中：冻结态下钉 startTime → 唤醒 → 三秒后写的 CSS paused 没人听了。
       * 症状就是第一轮静默能停、之后来过新行就永远停不下来。
       * 结论：播放权和 startTime 必须归同一个主人（WAAPI）。CSS 那条通道只留给不支持 getAnimations
       * 的浏览器——那条路上根本没有 startTime 赋值，不会打架。 */
      // 判据必须盖住对齐用的 syncSignal：面板装满时"来一条新行"只换行、不换行数，
      // 少了它那一帧就只重钉相位不补暂停，等于把刚冻上的动画又唤醒。
      var flowSig = syncSignal + '|' + (eff.fxFlow && !flowPlaying ? 'paused' : 'running');
      useSyncFx(function () {
        if (!CAN_WAAPI || (eff.fx || 'none') === 'none') return;
        var host = box.current;
        if (!host || typeof host.querySelectorAll !== 'function') return;
        var freeze = eff.fxFlow && !flowPlaying;
        var nodes = host.querySelectorAll('[data-brl-fx]');
        for (var n = 0; n < nodes.length; n++) {
          var el = nodes[n];
          if (!el || typeof el.getAnimations !== 'function') continue;
          var anims = el.getAnimations();
          for (var k = 0; k < anims.length; k++) {
            try {
              if (freeze) anims[k].pause();
              else if (anims[k].playState === 'paused') anims[k].play();   // 从暂停处接着滚，不回行首
            } catch (e) { /* 单行失败不牵连同帧其余行 */ }
          }
        }
      }, [flowSig]);

      // b33：外边框 =「日志外观」里的勾选（草稿即时预览）。勾着常显；关掉恢复旧版（只在移入/刚改尺寸时显）。
      var borderOn = eff.border !== false;
      var panel = {
        position: 'fixed', left: geom.x + 'px', top: geom.y + 'px',
        width: geom.w + 'px', height: geom.h + 'px',
        zIndex: Z, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        // 空面板才垫一层很淡的底（让"这里有一块面板"看得出来）；有日志时仍然全透明
        background: (borderOn && !shown.length)
          ? (dark ? 'rgba(21,21,23,.45)' : 'rgba(0,0,0,.025)') : 'transparent',
        // 边框颜色跟随 DSH 浅深：深色浅蓝、浅色深蓝；悬停时提亮一档
        border: ui.border
          ? (dark ? '1px solid rgba(122,170,255,.72)' : '1px solid rgba(30,90,180,.55)')
          : (borderOn ? (dark ? '1px solid rgba(122,170,255,.42)' : '1px solid rgba(30,90,180,.30)')
                      : '1px solid transparent'),
        borderRadius: '8px',   // 背景透明后不再投影：投影会让人错觉还有一块实体
        overflow: open ? 'visible' : 'hidden',   // 设置卡挂在面板底缘外，开着才转 visible（收起即还原）
        resize: (borderOn || ui.border) ? 'both' : 'none',   // 拉伸把手与边框同进退（b9）
        transition: 'border-color .18s ease',
        WebkitAppRegion: 'no-drag', appRegion: 'no-drag',
      };
      var localProcs = (snap && snap.local && snap.local.procs) || [];
      // 本地在跑时这一行说的是自己的事，不报 BatRunner 的连接状态：那会儿屏上是本地输出，
      // 启动器连不连都不影响这屏。
      var status = !snap ? tr('statusConnecting')
        : (localProcs.length
          ? tr('statusLocalRunning', { names: localProcs.map(function (p) { return p.name; }).join(tr('listSep')), pid: (localProcs[0].cmdPid || localProcs[0].pid) })
          : (connected
            ? ((snap.server ? tr('statusPid', { pid: snap.server.pid }) : tr('statusConnected')) + (idleSec >= 4 ? ' · ' + tr('statusSilent', { n: idleSec }) : ''))
            : (err ? tr('statusDisconnectedErr', { err: err.slice(0, 24) }) : tr('statusDisconnected'))));

      var kids;
      if (shown.length) {
        // padding 上下 5px 与 fitShown 的预算口径一致；justify-content:flex-end 让最新一行永远贴底，
        // 万一最新行仍装不下，被裁的也只是它的上部而不是底部。
        // zIndex 7 让日志行浮在设置窗的遮罩（zIndex 6）之上：窗开着的时候这一屏不能被压暗，
        // 否则"改字号/换颜色当场映到日志"的预览就等于自己把自己遮住了。
        // 右侧留 26px：右上角那颗齿轮 22 宽 + 2px 内缩 + 2px 间隙。齿轮现出来时压不到字
        // （装箱宽度 M_PAD_X 与这里同一个口径），右下角不留东西——那块整个儿归原生改大小。
        var body = { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', gap: '3px', padding: '5px 26px 5px 8px', overflow: 'hidden',
          position: 'relative', zIndex: 7 };
        var tSync = Date.now();   // 同一轮渲染共用一个墙上时间戳（同步特效的相位基准）
        kids = [h('div', { key: 'body', style: body }, shown.map(function (l, i) {
          var isLast = i === shown.length - 1;
          var raw = lineText(l);   // 脚本原话逐字；宿主的状态行带 note，按当前语言现拼
          var txt = (isLast && rev >= 0 && rev < raw.length) ? raw.slice(0, rev) : raw;
          var rowColor = eff.color;
          var rowStyle = {
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'break-word',
            flex: '0 0 auto', minHeight: eLH + 'px', minWidth: 0,
            lineHeight: eLH + 'px', fontFamily: eff.font, fontSize: eSize + 'px',
          };
          var fxId = eff.fx || 'none';
          var fxApplied = false;
          if (fxId !== 'none' && (eff.fxAll || isLast)) {
            // 特效行：探照灯渐变光带从左扫到右
            var fx = FX_DEFS.find(function (f) { return f.id === fxId; });
            if (fx) {
              fxApplied = true;
              var base = eff.color;
              rowStyle.backgroundImage = 'linear-gradient(90deg,'
                + base + ' 0%,' + base + ' 36%,'
                + fx.stops + ','
                + base + ' 64%,' + base + ' 100%)';
              rowStyle.backgroundSize = fx.size;
              rowStyle.backgroundRepeat = 'no-repeat';
              rowStyle.WebkitBackgroundClip = 'text';
              rowStyle.backgroundClip = 'text';
              rowStyle.WebkitTextFillColor = 'transparent';
              rowStyle.color = 'transparent';
              rowStyle.animation = 'brl-sweep ' + fx.dur + ' linear infinite';
              if (!CAN_WAAPI) {
                // 兜底：没有 getAnimations 的环境只能给同一负延迟；
                // 有 WAAPI 时由上面的 layout effect 统一 startTime，避免各行启动时刻不同造成错相。
                var durMs = Math.round(parseFloat(fx.dur) * 1000);
                rowStyle.animationDelay = '-' + (((tSync % durMs) + durMs) % durMs) + 'ms';
              }
              // b13「随日志滚动」：静默超窗口就把光带冻在当前帧上——不碰 animation，所以恢复时是接着滚
              // 而不是从头重跑，也不会退回行首。未勾选 = 一直循环。
              // b15：只有不支持 WAAPI 的浏览器才走 CSS 这条通道（见上面那个 pause/play 的 effect）。
              if (!CAN_WAAPI && eff.fxFlow && !flowPlaying) rowStyle.animationPlayState = 'paused';
            } else {
              rowStyle.color = rowColor;
            }
          } else {
            rowStyle.color = rowColor;
          }
          var rowProps = { key: i, title: l.ts + '  ' + raw, style: rowStyle };
          if (fxApplied) rowProps['data-brl-fx'] = '1';
          return h('div', rowProps, txt);
        }))];
      } else {
        // b33 空态（B 版定档）：标题 + 一行入口提示。颜色跟 DSH 浅深走，浅色下也是深字，不再一块淡灰。
        var fg1 = dark ? '#F9FAFB' : '#0F1115';
        var fg2 = dark ? '#CFD3D6' : '#61666B';
        var dotColor = !snap ? '#9AA0A8' : ((connected || localProcs.length) ? '#25A74F' : '#E6AA1E');
        var hintNodes = null;
        if (snap && !localProcs.length && !connected) {
          hintNodes = trParts('emptyHintNotConnected',
            h('span', { key: 'gear', style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '16px', height: '16px', borderRadius: '4px', margin: '0 2px', verticalAlign: '-3px',
              border: '1px solid ' + (dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.14)'),
              color: fg1, fontSize: '11px' } }, '⚙'));
        } else if (snap && connected && !localProcs.length) {
          hintNodes = tr('emptyHintConnected');
        }
        kids = [h('div', { key: 'empty', style: { flex: '1 1 auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '0 16px',
          position: 'relative', zIndex: 7 } }, [
          h('div', { key: 'st', style: { display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: UI, fontSize: '14px', fontWeight: 600, color: fg1, lineHeight: '18px' } }, [
            h('span', { key: 'dot', style: { width: '8px', height: '8px', borderRadius: '50%', flex: '0 0 auto',
              background: dotColor,
              boxShadow: dotColor === '#E6AA1E' ? '0 0 0 3px rgba(230,170,30,.16)' : 'none' } }),
            status]),
          hintNodes ? h('div', { key: 'hint', style: { fontSize: '11.5px', color: fg2,
            textAlign: 'center', lineHeight: '16px' } }, hintNodes) : null,
        ])];
      }

      /* 这里原来是右侧一根 44px 的把手条（b28/b29：整条点阵 + 竖排底纹文字）。b30 按用户要求
       * 整条删掉：面板任意处左键按下就能拖（见上面的 beginDrag），屏上不多出任何东西，也就不会再有
       * "齿轮跟拖动文案挤成一团"这种事。齿轮改成浮在右上角，右下角整个留给原生「拉边框改大小」。 */
      // 齿轮：浮在右上角。右下角整个留给原生「拉边框改大小」，两者不再抢同一块地方（b30）。
      kids.unshift(h('div', {
        key: 'gear',
        title: tr('gearTitle'),
        onPointerDown: function (e) { e.stopPropagation(); },   // 按齿轮只开设置，别顺手当成拖面板
        onClick: function (e) { e.stopPropagation(); toggleOpen(); },
        style: {
          position: 'absolute', top: '2px', right: '2px', width: '22px', height: '22px', borderRadius: '5px',
          display: ui.gear ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
          // zIndex 8：压过日志区（7）与设置窗的遮罩（6）——开着窗时齿轮仍然点得动（再点一次 = 关窗弃稿）
          // 它浮在日志之上，所以必须自带一层实底 + 淡蓝描边，否则和字糊在一块看不出是个按钮。
          background: open ? 'rgba(13,15,18,.88)' : 'rgba(13,15,18,.72)',
          border: open ? '1px solid rgba(120,179,255,.6)' : '1px solid rgba(120,179,255,.3)',
          color: open ? '#78B3FF' : '#C6CBD2', cursor: 'pointer', zIndex: 8, userSelect: 'none',
          WebkitAppRegion: 'no-drag', appRegion: 'no-drag',
        },
      }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } },
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }))));

      /* ---------- 设置卡（定档 = 原型 A 版：就近小卡 + 显式保存；草稿即时映日志当预览） ---------- */
      if (open && draft) {
        var langDirty = langBaseRef.current !== null && lang.stored !== langBaseRef.current;   // 语言被预览改过、还没保存（也算这份草稿的改动）
        var dirtyDraft = draft.font !== look.font || (draft.size | 0) !== eSize || draft.color !== look.color
          || (draft.fx || 'none') !== (look.fx || 'none') || !!draft.fxAll !== !!look.fxAll
          || (draft.fxFlow !== false) !== (look.fxFlow !== false)   // fxFlow 缺字段=false，两边按同一口径比
          || (draft.border !== false) !== (look.border !== false)   // 外边框同样缺字段=默认开
          || langDirty;
        var opts = FONTS.map(function (f) {
          return h('option', { key: f.css, value: f.css }, f.name + (f.mono ? '' : tr('fontNotMonoSuffix')));
        });
        if (!FONTS.some(function (f) { return f.css === draft.font; })) {
          opts.unshift(h('option', { key: 'cur', value: draft.font }, tr('fontCustom')));
        }
        var sws = PALETTE.map(function (c) {
          return h('div', { key: c, title: tr('colorFixedTitle', { c: c }), onClick: function () { patch({ color: c }); }, style: {
            width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', background: c,
            boxShadow: P_SWLINE,
            border: String(c).toLowerCase() === String(draft.color).toLowerCase()
              ? '2px solid  #78B3FF' : '2px solid transparent',
          } });
        });
        // C 版定档：齿轮点开是**居中窗**（遮罩 + 窗，运行区在左、外观区在右），不再贴着面板底缘挂小卡。
        // 遮罩仍然是面板的子节点：b14 那条"点外面收起"靠 composedPath 判内外，遮罩在面板内，
        // 所以点遮罩不会被它关掉，由遮罩自己 onClick 关（效果一致：弃草稿、不落盘）。
        var selectAndRun = function (e) { patchRun({ sel: e.id }); runEntry(e, false); };
        var lookChildren = [
          h('div', { key: 'ttl', style: P_TTL }, tr('appearanceTitle')),
          h('div', { key: 'f0', style: P_FLD },   // 语言：排在字体之前，是这一半的第一个选项（用户定的位置）
            h('div', { style: P_LBL }, tr('langLabel')),
            h('select', { value: lang.stored, style: P_SEL, title: tr('langHint'),
              onChange: function (e) { langPreview(e.target.value); } },
              [h('option', { key: 'auto', value: 'auto' }, tr('langFollowHost', { lang: langName(pickLocale(lang.host || 'en')) })),
                h('option', { key: 'sep', value: '', disabled: true }, '──────────────')].concat(
                  Object.keys(LANG_NAMES).map(function (c) { return h('option', { key: c, value: c }, LANG_NAMES[c]); }))),
            h('div', { style: P_SUB }, tr('langNow', { lang: langName(lang.cur), from: tr(langDirty ? 'langFromPreview' : (lang.from === 'host' ? 'langFromHost' : 'langFromUser')) }))),
          h('div', { key: 'f1', style: P_FLD },
            h('div', { style: P_LBL }, tr('fontLabel')),
            h('select', { value: draft.font, style: P_SEL, title: tr('fontFallbackTitle'),
              onChange: function (e) { patch({ font: e.target.value }); } }, opts)),
          h('div', { key: 'f2', style: P_FLD },
            h('div', { style: P_ROW },
              h('span', { style: P_LBL }, tr('sizeLabel')),
              h('span', { key: 'st', style: P_STEP },
                h('button', { style: P_STB, title: tr('sizeSmallerTitle'),
                  onClick: function () { patch({ size: Math.max(MIN_SIZE, eSize - 1) }); } }, '−'),
                h('span', { style: P_STN }, String(eSize)),
                h('button', { style: P_STB, title: tr('sizeLargerTitle'),
                  onClick: function () { patch({ size: Math.min(MAX_SIZE, eSize + 1) }); } }, '＋')))),
          h('div', { key: 'f3', style: P_FLD },
            h('div', { style: P_LBL }, tr('colorLabel')),
            h('div', { style: P_SW }, sws.concat([
              h('input', { key: 'pick', type: 'color', style: P_CPICK,
                value: /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : eff.color,
                onChange: function (e) { patch({ color: e.target.value }); } })]))),
          h('div', { key: 'f4', style: P_FLD },
            h('div', { style: P_LBL }, tr('fxLabel')),
            h('select', { value: draft.fx || 'none', style: P_SEL,
              onChange: function (e) { patch({ fx: e.target.value }); } },
              FX_DEFS.map(function (f) {
                // 特效名也走表：FX_DEFS 里的 id 是 none/green/…，表里的编号是 fxNone/fxGreen/…
                return h('option', { key: f.id, value: f.id }, tr('fx' + f.id.charAt(0).toUpperCase() + f.id.slice(1)));
              }))),
          h('div', { key: 'f5', style: Object.assign({}, P_FLD, { display: 'flex', alignItems: 'center', gap: 6 }) },
            [h('input', { type: 'checkbox', checked: !!draft.fxAll, id: 'fxall',
              style: { margin: 0, cursor: 'pointer' },
              onChange: function (e) { patch({ fxAll: e.target.checked }); } }),
            h('label', { htmlFor: 'fxall', style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer', marginRight: 10 } }, tr('fxAll')),
            h('input', { type: 'checkbox', checked: draft.fxFlow !== false, id: 'fxflow',
              style: { margin: 0, cursor: 'pointer' },
              title: tr('fxFlowTitle', { n: FX_IDLE_MS / 1000 }),
              onChange: function (e) { patch({ fxFlow: e.target.checked }); } }),
            h('label', { htmlFor: 'fxflow', title: tr('fxFlowShort', { n: FX_IDLE_MS / 1000 }),
              style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer' } }, tr('fxFlow'))]),
          h('div', { key: 'f6', style: Object.assign({}, P_FLD, { display: 'flex', alignItems: 'center', gap: 6 }) },
            [h('input', { type: 'checkbox', id: 'brlborder', checked: draft.border !== false,
              style: { margin: 0, cursor: 'pointer' },
              title: tr('borderToggleTitle'),
              onChange: function (e) { patch({ border: e.target.checked }); } }),
            h('label', { htmlFor: 'brlborder', style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer' } }, tr('borderToggle'))]),
          h('div', { key: 'f6h', style: P_SUB }, tr('borderHint')),
          h('div', { key: 'foot', style: P_FOOT }, [
            h('button', { style: P_BTN, onClick: function () { patch(DEF_LOOK); } }, tr('restoreDefaults')),
            h('button', { style: P_BTN, onClick: closeSettings }, tr('cancel')),
            h('button', { style: dirtyDraft ? P_SAVE_DIRTY : P_SAVE, onClick: commitLook },
              dirtyDraft ? tr('saveDirty') : tr('save'))]),
          h('div', { key: 'hint', style: P_HINT },
            tr('draftHint')),
        ];

        var liveById = {};
        for (var li = 0; li < localProcs.length; li++) liveById[localProcs[li].id] = localProcs[li];
        // 按钮那三颗点下去不该顺手把这一行变成选中（尤其「删」：删的正是要挪走的那条），先把冒泡掐掉
        var onBtn = function (fn) { return function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); fn(); }; };
        var rows = [];
        for (var ei = 0; ei < runCfg.entries.length; ei++) {
          (function (e) {
            var live = liveById[e.id];
            var st = e.id === runCfg.sel ? P_ENT_SEL : null;
            if (live) st = Object.assign({}, st || {}, P_ENT_ON);   // 橙条盖掉蓝条（橙=在跑），但底色仍说「这条是选中的」
            var t0 = live ? durStamp(live.startedAt) : 0;
            var nowMs = secNow || Date.now();   // 时长只按「秒边界那一拍」取值，不跟着轮询的节拍漂
            rows.push(h('div', {
              key: e.id, title: e.path,
              style: st ? Object.assign({}, P_ENT, st) : P_ENT,
              // b35：点这一行 = 选中它（以前条目行根本没挂点击，「运行选中」因此永远指着同一条，形同虚设）
              onClick: function () { if (runCfg.sel !== e.id) patchRun({ sel: e.id }); },
            }, [
              h('div', { style: P_TXT }, [
                h('div', { style: P_NAMEL }, live ? [
                  h('div', { style: P_NAME }, e.name),
                  h('span', { style: P_DUR, title: tr('durTitle') }, [
                    h('i', { style: P_DOT }), tr('runningPill'),
                    h('span', { style: P_DURN }, t0 ? durText(nowMs - t0) : tr('timingUnknown')),
                  ]),
                ] : [h('div', { style: P_NAME }, e.name)]),
                h('div', { style: P_PATH }, e.path),
              ]),
              h('div', { style: P_ACT }, [
                live
                  ? h('button', { style: P_STOP, title: tr('stopTip'),
                      onClick: onBtn(function () { stopEntry(e); }) }, tr('stop'))
                  : h('button', { style: P_GO, title: tr('runTip'),
                      onClick: onBtn(function () { selectAndRun(e); }) }, tr('run')),
                h('button', {
                  style: live ? Object.assign({}, P_DEL, { opacity: 0.4, cursor: 'not-allowed' }) : P_DEL,
                  disabled: !!live,
                  title: live ? tr('delTitleRunning') : tr('delTitleIdle'),
                  onClick: onBtn(function () { removeEntry(e); }),
                }, tr('del')),
              ]),
            ]));
          })(runCfg.entries[ei]);
        }
        if (!rows.length) rows.push(h('div', { key: 'none', style: P_EMPTY },
          tr('emptyList')));

        /* 「退出即停」这一格以宿主那份为准（宿主 settings.json 是唯一真相源）：宿主可达就用
         * 快照里的值，本地那份只在宿主没答话时当展示兜底，免得断线时格子乱跳。 */
        var haltHost = snap && snap.local && typeof snap.local.haltOnExit === 'boolean' ? snap.local.haltOnExit : null;
        var haltShown = haltHost === null ? !!runCfg.haltOnExit : haltHost;
        var runPane = h('div', { key: 'run', style: P_RUN }, [
          h('div', { key: 'ttl', style: P_TTL }, tr('runTitle')),
          h('div', { key: 'list', style: P_LIST }, rows),
          h('div', { style: P_ROW }, [
            h('button', { style: P_ADD, disabled: !!busy, title: tr('pickFileTitle'),
              onClick: addEntry }, tr('pickFile')),
            h('button', { style: P_BTN, disabled: !runCfg.sel, title: tr('runSelectedTip'),
              onClick: function () {
                for (var i = 0; i < runCfg.entries.length; i++) {
                  if (runCfg.entries[i].id === runCfg.sel) { runEntry(runCfg.entries[i], false); break; }
                }
              } }, tr('runSelected')),
          ]),
          h('div', { style: P_CHK }, [
            h('input', { type: 'checkbox', id: 'brl-halt', checked: haltShown,
              style: { margin: 0, cursor: 'pointer' },
              title: tr('haltTitle'),
              onChange: function (e) { setHalt(e.target.checked); } }),
            h('label', { htmlFor: 'brl-halt', style: P_CHKTX }, tr('haltLabel'))]),
          h('div', { style: P_SUB }, tr('haltHint')),
          h('div', { style: P_CHK }, [
            h('input', { type: 'checkbox', id: 'brl-auto', checked: !!runCfg.autoStart,
              style: { margin: 0, cursor: 'pointer' },
              title: tr('autoTitle'),
              onChange: function (e) { setAuto(e.target.checked); } }),
            h('label', { htmlFor: 'brl-auto', style: P_CHKTX }, tr('autoLabel'))]),
          h('div', { style: P_SUB }, [
            tr('autoDelayPrefix'),
            h('input', { key: 'delay', type: 'number', min: 0, max: MAX_DELAY, value: runCfg.delay,
              style: P_NUM, title: tr('autoDelayTitle'), disabled: !runCfg.autoStart,
              onChange: function (e) { setDelay(e.target.value); } }),
            tr('autoDelaySuffix'),
          ]),
          /* 这一行只在真有话说时才印：有操作反馈印反馈，有退出记录印退出码，都没就空着。
           * （以前空着时印一句默认口径「选一条点「运行」，输出逐字进这块面板…」，用户点名那是废话，删。） */
          h('div', { style: Object.assign({}, P_MSG, msg ? P_MSG_BAD : null) },
            msg || (snap && snap.local && snap.local.lastExit
              ? tr('lastExitLine', { name: snap.local.lastExit.name, code: String(snap.local.lastExit.code), at: snap.local.lastExit.at })
              : '')),
        ]);

        kids.push(h('div', { key: 'mask', style: P_MASK,
          onClick: closeSettings,
          onPointerDown: function (e) { e.stopPropagation(); },   // 点遮罩是去关窗，不启动拖动
          onPointerMove: enter },
          h('div', { key: 'modal', style: P_MODAL,
            onClick: function (e) { e.stopPropagation(); },        // 窗内的点击不算"点了遮罩"
            onPointerDown: function (e) { e.stopPropagation(); },
            onPointerEnter: enter }, [
            runPane,
            h('div', { key: 'look', style: P_PANE }, lookChildren),
          ])));
      }

      return h('div', { ref: box, style: panel, title: tr('panelTitle', { build: BUILD, status: status }) + ' · ' + tr('panelFooterHint'),
        onPointerDown: function (e) { beginDrag(e); },
        onPointerEnter: enter, onPointerLeave: leave }, kids);
    }

    var name = 'dsh-bat-runner';
    var inject = ['slots'];

    function apply(ctx) {
      try {
        ctx.slots.inject(SLOT, function () {
          return ctx.slots.register({ name: SLOT, id: 'dsh-bat-runner', order: 90 }, LogPanel);
        });
      } catch (e) {
        console.warn('[dsh-bat-runner] shell.overlay 槽位不可用，已跳过挂载：', e && e.message || e);
      }
    }

    exports.LogPanel = LogPanel;
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  },
});




