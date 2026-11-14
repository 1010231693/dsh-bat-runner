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
    var RUN_KEY = 'dsh-batrunner-logs:run';
    var DEF_RUN = { entries: [], sel: '', autoStart: false, delay: 0, haltOnExit: false, lastDir: '' };
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
    var BUILD = 'b33';
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
      background: '#17181B', boxSizing: 'border-box' };
    var P_ENT_SEL = { border: '1px solid  #3D6FA8', borderLeft: '3px solid #78B3FF', background: '#1B2331' };
    var P_ENT_ON = { border: '1px solid #EF6950', borderLeft: '3px solid #EF6950', background: '#263043' };
    var P_TXT = { flex: '1 1 auto', minWidth: 0 };
    var P_NAME = { fontSize: 12, color: '#E6E7EA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
    var P_PATH = { fontSize: 11, color: '#8A9099', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
    var P_ACT = { display: 'flex', gap: 6, flex: '0 0 auto', alignItems: 'center' };
    var P_LIVE = { fontSize: 11, color: '#FFB4A2', flex: '0 0 auto', minWidth: 46, textAlign: 'right' };
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
        var need = wrapCount(lines[i].text, width, font, size, lh) * lh + (out.length ? ROW_GAP : 0);
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
          done(new Error('回包不对（' + method + '）'), null);
          return;
        }
        var res = full.result || {};
        if (res.ok === true) done(null, res.value);
        else done(new Error((res.error && res.error.message) || (method + ' 调用失败')), null);
      }).catch(function (e) { done(new Error(String(e && e.message || e)), null); });
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
      var closeSettings = function () {
        openRef.current = false; setOpen(false); setDraft(null);
        // b32：设置窗一关就把预热的选文件进程回收掉（正在弹框时会等这次选完再收）
        rpc('warm', { on: false }, function () {});
      };
      var toggleOpen = function () {
        if (openRef.current) { closeSettings(); return; }
        openRef.current = true; setOpen(true); setDraft(Object.assign({}, look));
        // b32：开窗就先让宿主把 WinForms 加载好，点「选择文件」不用再等 ~1 秒的冷启动
        rpc('warm', { on: true }, function () {});
      };
      var patch = function (p) { setDraft(function (d) { return Object.assign({}, d || look, p); }); };
      var commitLook = function () { if (!draft) return; var n = Object.assign({}, draft); setLook(n); saveLookNow(n); closeSettings(); };

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
          if (err) setMsg('这条设置没送出去：' + err.message);
          else if (value && value.snapshot) setSnap(value.snapshot);
        });
      };
      var runEntry = function (entry, skipIfAny) {
        if (!entry) return;
        var s = snapRef.current;
        // 「已经有在跑的就别重复跑」这条判断放在这里，开机自动运行和手点运行共用一个口径
        if (skipIfAny && s && s.local && s.local.running) { setMsg('已经有脚本在跑，这次不重复启动'); return; }
        rpc('run', { id: entry.id, name: entry.name, path: entry.path }, function (err, value) {
          if (err) { setMsg('运行失败：' + err.message); return; }
          if (value.snapshot) setSnap(value.snapshot);
          setMsg(value.started ? '' : (value.message || '没有启动'));
        });
      };
      runEntryRef.current = runEntry;
      var stopEntry = function (entry) {
        rpc('stop', { id: entry.id }, function (err, value) {
          if (err) { setMsg('停止失败：' + err.message); return; }
          if (value.snapshot) setSnap(value.snapshot);
          setMsg(value.stopped ? '' : (value.message || '这个条目没有在运行'));
        });
      };
      var addEntry = function () {
        setBusy('选择文件…'); setMsg('');
        // 初始目录 = 上次打开对话框选的那个，没有就用当前条目的所在目录：用户要的就是"下次还停在上次那儿"
        rpc('pick', { dir: runCfg.lastDir || dirOf(pathOf(runCfg.sel)) }, function (err, value) {
          setBusy('');
          if (err) { setMsg('打不开文件框：' + err.message); return; }
          if (!value.path) { setMsg('没有选择文件'); return; }
          var file = value.path;
          var dir = dirOf(file);
          var lower = file.toLowerCase();
          for (var i = 0; i < runCfg.entries.length; i++) {
            if (runCfg.entries[i].path.toLowerCase() === lower) {
              patchRun({ lastDir: dir });   // 目录照样记住，哪怕这次没新增条目
              setMsg('这个脚本已经在列表里了');
              return;
            }
          }
          var entry = {
            id: newEntryId(file),
            name: baseName(file).replace(/\.(bat|cmd)$/i, '') || baseName(file),
            path: file,
          };
          patchRun({ entries: runCfg.entries.concat([entry]), sel: entry.id, lastDir: dir });
          setMsg('已加入列表：' + file);
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
          setMsg('还在运行：先按「停止」才能从列表里删（这条没有动，脚本也没有被杀）');
          return;
        }
        var list = [];
        for (var i = 0; i < runCfg.entries.length; i++) if (runCfg.entries[i].id !== entry.id) list.push(runCfg.entries[i]);
        var sel = runCfg.sel === entry.id ? (list.length ? list[0].id : '') : runCfg.sel;
        patchRun({ entries: list, sel: sel });
        setMsg('已从列表里移除：' + entry.path);
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

      /* ---------- B 版逐字浮现：只作用于最新一行 ---------- */
      var latest = shown.length ? shown[shown.length - 1].text : '';
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
        + '|' + eff.color + '|' + shown.map(function (l) { return l.ts + '\t' + l.text; }).join('\n');
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
      var status = !snap ? '连接中…'
        : (localProcs.length
          ? ('运行中 ' + localProcs.map(function (p) { return p.name; }).join('、') + ' · pid ' + (localProcs[0].cmdPid || localProcs[0].pid))
          : (connected
            ? ((snap.server ? 'pid ' + snap.server.pid : '已连接') + (idleSec >= 4 ? ' · 静默 ' + idleSec + 's' : ''))
            : (err ? '未连接（' + err.slice(0, 24) + '）' : '未连接 BatRunner')));

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
          var txt = (isLast && rev >= 0 && rev < l.text.length) ? l.text.slice(0, rev) : l.text;
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
          var rowProps = { key: i, title: l.ts + '  ' + l.text, style: rowStyle };
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
          hintNodes = ['启动器开着时这里显示实时日志 · 也可以点右上角 ',
            h('span', { key: 'gear', style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '16px', height: '16px', borderRadius: '4px', margin: '0 2px', verticalAlign: '-3px',
              border: '1px solid ' + (dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.14)'),
              color: fg1, fontSize: '11px' } }, '⚙'),
            ' 直接运行脚本'];
        } else if (snap && connected && !localProcs.length) {
          hintNodes = '等待脚本输出…';
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
        title: '日志设置（运行脚本 / 外观）',
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
        var dirtyDraft = draft.font !== look.font || (draft.size | 0) !== eSize || draft.color !== look.color
          || (draft.fx || 'none') !== (look.fx || 'none') || !!draft.fxAll !== !!look.fxAll
          || (draft.fxFlow !== false) !== (look.fxFlow !== false)   // fxFlow 缺字段=false，两边按同一口径比
          || (draft.border !== false) !== (look.border !== false);   // 外边框同样缺字段=默认开
        var opts = FONTS.map(function (f) {
          return h('option', { key: f.css, value: f.css }, f.name + (f.mono ? '' : '（非等宽）'));
        });
        if (!FONTS.some(function (f) { return f.css === draft.font; })) {
          opts.unshift(h('option', { key: 'cur', value: draft.font }, '自定义'));
        }
        var sws = PALETTE.map(function (c) {
          return h('div', { key: c, title: c + '（固定色：深浅两态都是它）', onClick: function () { patch({ color: c }); }, style: {
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
          h('div', { key: 'ttl', style: P_TTL }, '日志外观'),
          h('div', { key: 'f1', style: P_FLD },
            h('div', { style: P_LBL }, '字体'),
            h('select', { value: draft.font, style: P_SEL, title: '机器上没装的字体浏览器会自动回退',
              onChange: function (e) { patch({ font: e.target.value }); } }, opts)),
          h('div', { key: 'f2', style: P_FLD },
            h('div', { style: P_ROW },
              h('span', { style: P_LBL }, '字号（10–20 px）'),
              h('span', { key: 'st', style: P_STEP },
                h('button', { style: P_STB, title: '小一点',
                  onClick: function () { patch({ size: Math.max(MIN_SIZE, eSize - 1) }); } }, '−'),
                h('span', { style: P_STN }, String(eSize)),
                h('button', { style: P_STB, title: '大一点',
                  onClick: function () { patch({ size: Math.min(MAX_SIZE, eSize + 1) }); } }, '＋')))),
          h('div', { key: 'f3', style: P_FLD },
            h('div', { style: P_LBL }, '字体颜色'),
            h('div', { style: P_SW }, sws.concat([
              h('input', { key: 'pick', type: 'color', style: P_CPICK,
                value: /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : eff.color,
                onChange: function (e) { patch({ color: e.target.value }); } })]))),
          h('div', { key: 'f4', style: P_FLD },
            h('div', { style: P_LBL }, '文字特效（最新行）'),
            h('select', { value: draft.fx || 'none', style: P_SEL,
              onChange: function (e) { patch({ fx: e.target.value }); } },
              FX_DEFS.map(function (f) {
                return h('option', { key: f.id, value: f.id }, f.label);
              }))),
          h('div', { key: 'f5', style: Object.assign({}, P_FLD, { display: 'flex', alignItems: 'center', gap: 6 }) },
            [h('input', { type: 'checkbox', checked: !!draft.fxAll, id: 'fxall',
              style: { margin: 0, cursor: 'pointer' },
              onChange: function (e) { patch({ fxAll: e.target.checked }); } }),
            h('label', { htmlFor: 'fxall', style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer', marginRight: 10 } }, '所有行生效'),
            h('input', { type: 'checkbox', checked: draft.fxFlow !== false, id: 'fxflow',
              style: { margin: 0, cursor: 'pointer' },
              title: '日志停止生成 ' + (FX_IDLE_MS / 1000) + ' 秒后，光带原地暂停（停在当前画面，不会消失）；来了新日志自动接着滚。\n不勾：不论有没有新日志，光带一直循环滚动。',
              onChange: function (e) { patch({ fxFlow: e.target.checked }); } }),
            h('label', { htmlFor: 'fxflow', title: '日志停止生成 ' + (FX_IDLE_MS / 1000) + ' 秒后，光带原地暂停；来了新日志自动接着滚',
              style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer' } }, '随日志滚动')]),
          h('div', { key: 'f6', style: Object.assign({}, P_FLD, { display: 'flex', alignItems: 'center', gap: 6 }) },
            [h('input', { type: 'checkbox', id: 'brlborder', checked: draft.border !== false,
              style: { margin: 0, cursor: 'pointer' },
              title: '默认勾选。面板四周常显一条 1px 边框，没有日志时也一眼能找到面板。\n不勾：恢复旧版——只有鼠标移入时才显边。',
              onChange: function (e) { patch({ border: e.target.checked }); } }),
            h('label', { htmlFor: 'brlborder', style: { fontSize: 12, color: '#E6E7EA', cursor: 'pointer' } }, '显示外边框')]),
          h('div', { key: 'f6h', style: P_SUB }, '默认勾选。关掉后空面板只剩文字，容易找不到面板'),
          h('div', { key: 'foot', style: P_FOOT }, [
            h('button', { style: P_BTN, onClick: function () { patch(DEF_LOOK); } }, '恢复默认'),
            h('button', { style: P_BTN, onClick: closeSettings }, '取消'),
            h('button', { style: dirtyDraft ? P_SAVE_DIRTY : P_SAVE, onClick: commitLook },
              dirtyDraft ? '保存（有改动）' : '保存')]),
          h('div', { key: 'hint', style: P_HINT },
            '外观这边是草稿预览：改动当场映到日志，取消整体还原，保存才落盘。运行那边点下去就生效并记住，不会被「取消」回滚。'),
        ];

        var liveById = {};
        for (var li = 0; li < localProcs.length; li++) liveById[localProcs[li].id] = localProcs[li];
        var rows = [];
        for (var ei = 0; ei < runCfg.entries.length; ei++) {
          (function (e) {
            var live = liveById[e.id];
            var st = live ? P_ENT_ON : (e.id === runCfg.sel ? P_ENT_SEL : null);
            rows.push(h('div', { key: e.id, title: e.path, style: st ? Object.assign({}, P_ENT, st) : P_ENT }, [
              h('div', { style: P_TXT }, [
                h('div', { style: P_NAME }, e.name),
                h('div', { style: P_PATH }, e.path),
              ]),
              h('div', { style: P_ACT }, [
                live
                  ? h('button', { style: P_STOP, title: '结束这个进程，连它派生的子进程一起（taskkill /F /T）',
                      onClick: function () { stopEntry(e); } }, '停止')
                  : h('button', { style: P_GO, title: '运行这个脚本，输出直接进面板',
                      onClick: function () { selectAndRun(e); } }, '运行'),
                h('button', {
                  style: live ? Object.assign({}, P_DEL, { opacity: 0.4, cursor: 'not-allowed' }) : P_DEL,
                  disabled: !!live,
                  title: live ? '还在运行：先按「停止」才能删（删只管从列表里移除，不管杀进程）'
                               : '从列表移除这一条（它没在跑，一个进程都不动）',
                  onClick: function () { removeEntry(e); },
                }, '删'),
              ]),
              h('div', { style: P_LIVE }, live ? ('pid ' + (live.cmdPid || live.pid)) : (e.id === runCfg.sel ? '已选中' : '')),
            ]));
          })(runCfg.entries[ei]);
        }
        if (!rows.length) rows.push(h('div', { key: 'none', style: P_EMPTY },
          '列表是空的：点下面的「选择文件」从磁盘里挑一个 .bat / .cmd。'));

        /* 「退出即停」这一格以宿主那份为准（宿主 settings.json 是唯一真相源）：宿主可达就用
         * 快照里的值，本地那份只在宿主没答话时当展示兜底，免得断线时格子乱跳。 */
        var haltHost = snap && snap.local && typeof snap.local.haltOnExit === 'boolean' ? snap.local.haltOnExit : null;
        var haltShown = haltHost === null ? !!runCfg.haltOnExit : haltHost;
        var runPane = h('div', { key: 'run', style: P_RUN }, [
          h('div', { key: 'ttl', style: P_TTL }, '运行 Bat'),
          h('div', { key: 'list', style: P_LIST }, rows),
          h('div', { style: P_ROW }, [
            h('button', { style: P_ADD, disabled: !!busy, title: '打开系统文件选择框，默认停在上次打开的目录',
              onClick: addEntry }, '选择文件'),
            h('button', { style: P_BTN, disabled: !runCfg.sel, title: '运行当前选中的那条',
              onClick: function () {
                for (var i = 0; i < runCfg.entries.length; i++) {
                  if (runCfg.entries[i].id === runCfg.sel) { runEntry(runCfg.entries[i], false); break; }
                }
              } }, '运行选中'),
          ]),
          h('div', { style: P_CHK }, [
            h('input', { type: 'checkbox', id: 'brl-halt', checked: haltShown,
              style: { margin: 0, cursor: 'pointer' },
              title: '勾选：退出 DSH 时把插件启动的脚本连它派生的子进程一起结束。\n不勾选（默认）：DSH 关掉后脚本继续自己跑。',
              onChange: function (e) { setHalt(e.target.checked); } }),
            h('label', { htmlFor: 'brl-halt', style: P_CHKTX }, '退出 DSH 时同时停止正在运行的脚本')]),
          h('div', { style: P_SUB }, '默认不勾选。改动只对之后的收尾生效'),
          h('div', { style: P_CHK }, [
            h('input', { type: 'checkbox', id: 'brl-auto', checked: !!runCfg.autoStart,
              style: { margin: 0, cursor: 'pointer' },
              title: '勾选：DSH 启动后自动运行当前选中的那条。已经有脚本在跑的不会重复启动。',
              onChange: function (e) { setAuto(e.target.checked); } }),
            h('label', { htmlFor: 'brl-auto', style: P_CHKTX }, '启动 DSH 时自动运行上次选择的脚本')]),
          h('div', { style: P_SUB }, [
            '延迟 ',
            h('input', { key: 'delay', type: 'number', min: 0, max: MAX_DELAY, value: runCfg.delay,
              style: P_NUM, title: '0–60 秒，超出会自动夹回来', disabled: !runCfg.autoStart,
              onChange: function (e) { setDelay(e.target.value); } }),
            ' 秒 · 已有脚本在跑的不再重复跑',
          ]),
          /* 这一行只在真有话说时才印：有操作反馈印反馈，有退出记录印退出码，都没就空着。
           * （以前空着时印一句默认口径「选一条点「运行」，输出逐字进这块面板…」，用户点名那是废话，删。） */
          h('div', { style: Object.assign({}, P_MSG, msg ? P_MSG_BAD : null) },
            msg || (snap && snap.local && snap.local.lastExit
              ? ('最后退出：' + snap.local.lastExit.name + ' · 退出码 ' + String(snap.local.lastExit.code) + ' · ' + snap.local.lastExit.at)
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

      return h('div', { ref: box, style: panel, title: 'dsh-bat-runner ' + BUILD + ' · ' + status
        + ' · 左键按住面板任意处拖动，右下角拉边框改大小 · 右上角齿轮打开设置窗（运行脚本 / 外观）',
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




