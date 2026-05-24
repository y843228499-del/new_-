import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import { saveAs } from 'file-saver';

// --- 辅助排版函数 ---
const H1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 600, after: 300 } });
const H2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } });
const H3 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 300, after: 150 } });
const P = (text: string) => new Paragraph({ text, spacing: { after: 200 }, style: "Normal" });
const Bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 150 } });
const Img = (text: string) => new Paragraph({ 
    children: [new TextRun({ text: `[此处插入图片：${text}]`, color: "888888", italics: true })],
    alignment: AlignmentType.CENTER, 
    spacing: { before: 400, after: 400 }, 
    shading: { fill: "F5F5F5" } 
});

function createTable(headers: string[], rows: string[][]) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: headers.map(h => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })], alignment: AlignmentType.CENTER })],
                    shading: { fill: "E0E0E0" },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                })),
            }),
            ...rows.map(row => new TableRow({
                children: row.map(cell => new TableCell({
                    children: [new Paragraph({ text: cell })],
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                })),
            }))
        ],
    });
}

export const generateDetailedManual = async () => {
    const doc = new Document({
        creator: "Yan Weiping (Xiao Liu Zi)",
        title: "工业协议集成平台 V2.6.6 详细操作手册",
        description: "专业级工业协议集成平台，支持 OPC UA、EtherNet/IP、Modbus TCP/RTU/ASCII 主从站通讯。提供数据监控、读写测试、报文分析及仿真功能。",
        styles: {
            paragraphStyles: [
                {
                    id: "Normal",
                    name: "Normal",
                    basedOn: "Normal",
                    next: "Normal",
                    run: { font: "Microsoft YaHei", size: 22 }, // 11pt
                    paragraph: { spacing: { line: 360 } } // 1.5 line spacing
                }
            ]
        },
        sections: [
            {
                properties: {},
                children: [
                    // --- 封面 ---
                    new Paragraph({
                        text: "工业协议集成平台 V2.6.6",
                        heading: HeadingLevel.TITLE,
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 4000, after: 400 },
                    }),
                    new Paragraph({
                        text: "全功能详细操作与维护手册",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 8000 },
                    }),
                    new Paragraph({ text: "作者：颜伟平 (Xiao Liu Zi)", alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
                    new Paragraph({ text: "生成日期：" + new Date().toLocaleDateString(), alignment: AlignmentType.CENTER, pageBreakBefore: false }),
                    new Paragraph({ pageBreakBefore: true }),

                    // --- 第一章：平台概述 ---
                    H1("1. 平台概述与核心架构"),
                    P("工业协议集成平台 (Industrial Suite Integrated Platform) 是一款专为工业自动化工程师、IT/OT 系统集成商以及上位机软件开发者打造的专业级通讯调试与测试工具。"),
                    P("在现代工业 4.0 和智能制造的背景下，车间现场往往存在多种异构网络和不同品牌的 PLC（可编程逻辑控制器）、传感器及仪表。本平台旨在打破信息孤岛，在一个统一的软件界面下，提供对主流工业协议的深度支持。"),
                    H2("1.1 核心特性"),
                    Bullet("多协议并发引擎：底层采用异步非阻塞架构，支持 OPC UA、EtherNet/IP、Modbus TCP/RTU/ASCII 等多种协议的主站与从站会话同时运行，互不干扰。"),
                    Bullet("数据持久化与工程管理：支持将所有的连接配置、测试点位、订阅列表保存为全局工程文件（.json 格式），方便在不同测试环境间迁移和一键恢复。"),
                    Bullet("防休眠保活机制：针对长时间压力测试场景，内置底层静音音频保活机制，防止操作系统因长时间无键鼠操作而进入休眠状态，导致通讯中断。"),
                    Bullet("跨平台与现代化 UI：基于现代 Web 技术栈与 Electron 构建，提供极其流畅、暗黑模式友好的沉浸式用户体验。"),
                    Img("软件主界面与工作台概览"),

                    // --- 第二章：OPC UA 客户端 ---
                    H1("2. OPC UA 客户端 (OPC UA Client)"),
                    P("OPC 统一架构 (OPC UA) 是目前工业界最主流的跨平台、安全可靠的数据交换标准。本平台的 OPC UA 模块严格遵循 IEC 62541 标准，提供从底层连接到高层数据调度的全套功能。"),
                    
                    H2("2.1 连接管理与安全策略"),
                    P("建立 OPC UA 连接是进行数据交互的第一步。平台支持极其丰富的安全配置，以适应不同安全级别的车间网络。"),
                    H3("2.1.1 Endpoint URL 配置"),
                    P("Endpoint URL 是服务器的访问地址，标准格式为 opc.tcp://<IP地址>:<端口号>[/路径]。例如：opc.tcp://192.168.1.100:4840。"),
                    H3("2.1.2 安全策略 (Security Policy)"),
                    P("平台支持以下安全策略，用于对通讯报文进行加密和签名："),
                    Bullet("None：不使用任何加密，适用于安全的内部局域网调试。"),
                    Bullet("Basic128Rsa15 / Basic256：早期的加密套件（不推荐用于新系统）。"),
                    Bullet("Basic256Sha256：目前最广泛使用的标准高强度加密套件。"),
                    Bullet("Aes128_Sha256_RsaOaep / Aes256_Sha256_RsaPss：适用于极高安全要求的现代加密套件。"),
                    H3("2.1.3 消息模式 (Message Security Mode)"),
                    Bullet("None：明文传输。"),
                    Bullet("Sign：对报文进行数字签名，防止篡改，但不加密内容。"),
                    Bullet("SignAndEncrypt：对报文进行签名并使用对称密钥加密，提供最高级别的安全性。"),
                    H3("2.1.4 身份认证 (Authentication)"),
                    P("支持 Anonymous（匿名登录）和 Username/Password（账号密码登录）。在连接前，请确保您的客户端证书已被 OPC UA 服务器（如 Kepware, Ignition, 各种品牌 PLC）加入信任列表 (Trusted List)。"),
                    Img("OPC UA 连接配置与证书信任界面"),

                    H2("2.2 地址空间浏览 (Address Space)"),
                    P("连接成功后，左侧面板将加载服务器的地址空间树。"),
                    Bullet("层次结构：通常从 Root -> Objects 文件夹开始，逐层展开设备、通道和具体的标签 (Tag)。"),
                    Bullet("节点信息：选中任意节点后，右侧属性面板会显示该节点的核心元数据，包括 NodeId（如 ns=2;s=MyDevice.Temperature）、BrowseName、NodeClass（Variable, Object, Method 等）以及 DataType。"),
                    
                    H2("2.3 节点读写操作 (Read/Write)"),
                    P("平台支持对基础数据类型（Int, Float, String, Boolean）以及复杂数据类型（多维数组、结构体/ExtensionObject）的读写。"),
                    Bullet("读取 (Read)：点击读取按钮，平台将发起 ReadRequest，并在界面上展示返回的时间戳 (SourceTimestamp)、状态码 (StatusCode) 和具体数值。"),
                    Bullet("写入 (Write)：在输入框中填入目标值。平台会自动根据目标节点的 DataType 进行类型转换（例如将输入的字符串 '123' 转换为 Int32 发送）。"),
                    Img("OPC UA 节点读写与属性展示区"),

                    H2("2.4 订阅与实时监控 (Subscriptions & Monitored Items)"),
                    P("对于需要持续关注的数据，不建议使用高频轮询读取，而应使用 OPC UA 的订阅机制 (Pub/Sub)。"),
                    P("在节点树中右键点击变量节点，选择“添加到订阅列表”。您可以配置以下关键参数："),
                    createTable(
                        ["参数名称", "说明", "推荐值"],
                        [
                            ["Publishing Interval", "服务器向客户端发送数据包的频率", "500ms - 1000ms"],
                            ["Sampling Interval", "服务器底层采集物理硬件数据的频率", "250ms - 500ms"],
                            ["Queue Size", "数据变化剧烈时，服务器缓存的历史值数量", "10"],
                        ]
                    ),
                    P("订阅列表会以高亮动画的形式实时闪烁更新变化的数据，非常适合用于监控关键报警信号或生产计数器。"),

                    H2("2.5 健壮性与压力测试 (Chaos Testing)"),
                    P("平台内置了独有的数据调度器，用于对目标 OPC UA 服务器进行压力测试。您可以配置一个节点列表，并设置极短的读写间隔（如 10ms），平台将并发发起海量请求，以测试 PLC 通讯模块的极限吞吐量和崩溃恢复能力。"),

                    // --- 第三章：EtherNet/IP 工作站 ---
                    H1("3. EtherNet/IP 工作站 (EIP Studio)"),
                    P("EtherNet/IP (EIP) 是基于 CIP (Common Industrial Protocol) 封装在 TCP/UDP 上的工业以太网协议。本模块专为罗克韦尔 (Allen-Bradley) Logix5000 系列、Micro800 系列以及汇川 (Inovance) 等兼容 EIP 的设备设计。"),

                    H2("3.1 路由路径配置 (Routing Path)"),
                    P("与普通的 TCP 协议不同，EIP 协议在建立 CIP 连接时，必须指定路由路径，以告诉通讯模块如何将数据包路由到背板上的具体 CPU 模块。"),
                    P("路由路径由多个 Port 和 Address 组成。"),
                    createTable(
                        ["设备类型", "典型路由路径", "原理解释"],
                        [
                            ["A-B ControlLogix", "1, 0", "Port 1 (背板), Address 0 (槽位 0 的 CPU)"],
                            ["A-B CompactLogix", "1, 0", "通常虚拟背板的 CPU 也在槽位 0"],
                            ["汇川 AM 系列", "空 或 1,0", "部分国产 PLC 优化了协议，无需指定路径"],
                        ]
                    ),
                    Img("EIP 路由路径与连接设置"),

                    H2("3.2 大容量连接 (Large Forward Open)"),
                    P("默认的 EIP 连接 (Forward Open) 限制单次通讯包大小为 500 字节左右。本平台默认启用 Large Forward Open (服务码 0x5B)，支持高达 4000 字节的通讯包，极大地提升了读取大型数组和复杂结构体时的效率。"),

                    H2("3.3 标签通讯 (Tag-based Communication)"),
                    P("无需知道物理内存地址，直接使用 PLC 编程软件（如 Studio 5000）中定义的变量名（Tag Name）进行通讯。"),
                    Bullet("基础变量：直接输入标签名，如 'MotorSpeed'。"),
                    Bullet("数组访问：支持切片访问，如 'MyArray[0]' 或 'MyArray[10,5]'。"),
                    Bullet("结构体 (UDT) 访问：使用点号连接，如 'PumpStation.Valve1.Status'。"),
                    P("平台底层会自动处理 CIP 数据类型的解析（如 SINT, INT, DINT, REAL, BOOL, STRING）。"),

                    H2("3.4 显式消息服务 (Explicit Messaging)"),
                    P("对于不支持标签通讯的变频器或远程 IO 模块，平台提供了底层的显式消息构造器。您需要手动指定："),
                    Bullet("Class ID (类 ID)"),
                    Bullet("Instance ID (实例 ID)"),
                    Bullet("Attribute ID (属性 ID)"),
                    Bullet("Service Code (服务码，如 0x0E Get_Attribute_Single, 0x10 Set_Attribute_Single)"),
                    Img("EIP 标签读写与显式消息调试面板"),

                    // --- 第四章：Modbus Master ---
                    H1("4. Modbus Master (主站)"),
                    P("Modbus 是工业界最古老、应用最广泛的协议之一。本平台的主站模块不仅支持标准的 Modbus TCP，还支持通过串口进行 Modbus RTU 通讯。"),

                    H2("4.1 通讯模式配置"),
                    Bullet("Modbus TCP：基于以太网，需配置目标设备的 IP 地址和端口（默认 502）。"),
                    Bullet("Modbus RTU：基于串口 (RS-232/RS-485)，需配置 COM 口号、波特率（如 9600, 115200）、数据位（通常为 8）、停止位（1 或 2）及校验位（None, Even, Odd）。"),

                    H2("4.2 功能码与地址映射"),
                    P("平台全面支持以下核心功能码 (Function Codes)："),
                    createTable(
                        ["功能码", "名称", "适用数据区", "读写权限"],
                        [
                            ["01 (0x01)", "Read Coils", "0xxxx (线圈)", "只读"],
                            ["02 (0x02)", "Read Discrete Inputs", "1xxxx (离散输入)", "只读"],
                            ["03 (0x03)", "Read Holding Registers", "4xxxx (保持寄存器)", "读写"],
                            ["04 (0x04)", "Read Input Registers", "3xxxx (输入寄存器)", "只读"],
                            ["05 (0x05)", "Write Single Coil", "0xxxx (线圈)", "只写"],
                            ["06 (0x06)", "Write Single Register", "4xxxx (保持寄存器)", "只写"],
                            ["15 (0x0F)", "Write Multiple Coils", "0xxxx (线圈)", "只写"],
                            ["16 (0x10)", "Write Multiple Registers", "4xxxx (保持寄存器)", "只写"],
                        ]
                    ),

                    H2("4.3 数据类型解析与字节序 (Endianness)"),
                    P("Modbus 协议原生只支持 16 位 (2 字节) 的寄存器。要在 Modbus 中传输 32 位浮点数 (Float32) 或 32 位整数 (Int32)，需要占用 2 个连续的寄存器（共 4 字节）。"),
                    P("由于不同厂家（如西门子、施耐德、汇川）对这 4 个字节的拼接顺序规定不同，导致读取时经常出现“乱码”或“极大值”。本平台提供了一键切换字节序的功能："),
                    Bullet("AB CD (Big Endian)：标准大端模式，高字节在前。"),
                    Bullet("CD AB (Little Endian Byte Swap)：小端字节交换，常见于某些国产仪表。"),
                    Bullet("BA DC (Big Endian Byte Swap)：大端字节交换。"),
                    Bullet("DC BA (Little Endian)：标准小端模式，低字节在前。"),
                    P("操作建议：在数据视图中，将数据类型切换为 Float32，然后依次点击这四种字节序，直到界面上显示出符合预期的合理数值即可。"),
                    Img("Modbus 轮询任务与字节序切换界面"),

                    H2("4.4 轮询任务管理"),
                    P("您可以添加多个轮询任务（Polling Tasks），每个任务指定一个起始地址和读取长度。平台将在后台按照设定的周期（如 1000ms）不断向从站发送读取请求，并在界面上实时刷新数据表格。"),

                    // --- 第五章：Modbus Slave ---
                    H1("5. Modbus Slave (从站仿真)"),
                    P("在上位机软件开发或主站 PLC 逻辑编写阶段，如果现场硬件设备尚未就绪，可以使用本平台的 Modbus Slave 模块模拟出一个真实的设备。"),

                    H2("5.1 仿真服务配置"),
                    P("选择 TCP 模式时，平台将在本机的指定端口（默认 502）启动一个 TCP Server，等待主站的连接。请注意，在 Windows 系统中，监听 502 端口可能需要管理员权限，或者您可以将其修改为 5020 等高位端口。"),

                    H2("5.2 寄存器数据配置"),
                    P("启动服务后，您可以在界面上看到 0xxxx, 1xxxx, 3xxxx, 4xxxx 四个数据区的表格。"),
                    Bullet("手动修改：双击表格中的数值单元格，输入新值，主站下次读取时就会获取到这个新值。"),
                    Bullet("动态模拟：为了测试主站的动态响应，您可以为某个寄存器配置“自动变化规则”。例如，设置为“递增 (Increment)”，每秒加 1；或设置为“随机 (Random)”，在 0-100 之间波动。"),

                    H2("5.3 报文级监控与诊断"),
                    P("这是排查主从站通讯故障的终极武器。在界面底部的“报文日志”窗口中，平台会以十六进制 (Hex) 格式打印出每一条接收到的请求报文 (RX) 和发送的响应报文 (TX)。"),
                    P("通过分析报文，您可以直观地看出主站请求的站号、功能码、起始地址是否正确，以及本机的响应是否带有异常码 (Exception Code)。"),
                    Img("Modbus Slave 仿真与底层报文监控"),

                    // --- 第六章：工程文件与系统设置 ---
                    H1("6. 工程文件与系统设置"),
                    H2("6.1 全局工程保存与加载"),
                    P("平台的所有状态（包括 OPC UA 的连接参数、EIP 的标签列表、Modbus 的轮询任务等）都保存在内存中。"),
                    P("当您试图关闭软件时，系统会弹出拦截提示，询问是否保存工程。点击保存后，会生成一个包含时间戳的 .json 文件。下次使用时，只需将该文件拖入软件或通过菜单加载，即可瞬间恢复上次的工作现场。"),
                    
                    H2("6.2 防休眠机制 (Anti-Sleep)"),
                    P("工业测试往往需要连续运行数天（如 72 小时烤机测试）。为了防止 Windows/Mac 系统因无人值守而进入睡眠模式导致网络断开，平台在启动任何一个协议模块时，会在后台循环播放一段极小体积的静音音频。这是一种对系统无害且极为有效的保活策略。"),

                    // --- 第七章：常见问题解答 (FAQ) ---
                    H1("7. 常见问题解答 (FAQ)"),
                    H2("Q1: OPC UA 连接报 BadSecurityChecksFailed 或 BadCertificateUntrusted 错误？"),
                    P("A: 这通常是因为客户端证书未被服务器信任。请登录您的 OPC UA 服务器（如 Kepware 或 PLC 网页配置端），在“受信任的客户端 (Trusted Clients)”列表中找到本软件生成的证书，并将其移动到信任列表中。"),
                    
                    H2("Q2: EtherNet/IP 提示 Connection Failure: Routing Error？"),
                    P("A: 路由路径配置错误。请检查您的 PLC 型号。如果是 ControlLogix，通常是 1,0。如果是通过以太网模块（如 EN2T）桥接，路径可能会更复杂（如 1,2,2,192.168.1.10）。请查阅 PLC 硬件手册获取准确的 CIP 路由路径。"),
                    
                    H2("Q3: Modbus TCP 提示 Connection Refused？"),
                    P("A: 目标设备的 IP 地址不可达，或者该设备的 502 端口未开放。请先使用 ping 命令测试网络连通性。如果网络正常，请检查设备是否允许当前 IP 访问，或者设备是否达到了最大 Modbus TCP 连接数限制。"),

                    H2("Q4: 软件界面卡顿或内存占用过高？"),
                    P("A: 如果您在 OPC UA 中订阅了上万个节点，或者在 Modbus 中设置了 10ms 的超高频轮询，可能会导致前端渲染压力过大。建议在常规调试时，将采样间隔设置在 500ms 以上。"),

                    // --- 封底 ---
                    new Paragraph({ pageBreakBefore: true }),
                    new Paragraph({
                        text: "工业协议集成平台",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 4000, after: 400 },
                    }),
                    new Paragraph({
                        text: "让工业通讯调试更简单、更高效",
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 2000 },
                    }),
                    new Paragraph({
                        text: "Copyright © " + new Date().getFullYear() + " Yan Weiping. All rights reserved.",
                        alignment: AlignmentType.CENTER,
                    }),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "工业协议集成平台_全功能详细操作手册.docx");
};

