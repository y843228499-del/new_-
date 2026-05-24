
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'zh';

const dictionary = {
  en: {
    // ... (existing translations)
    app: {
      title: "OPC UA Client",
      sessions: "Sessions",
      help: "Help & Docs",
      stats: "Network Stats",
      settings: "Preferences",
      connectAll: "Connect All",
      stopAll: "Stop All",
      batchQty: "QTY",
      copyright: "Copyright © 2024 Yan Weiping. All rights reserved. Unauthorized commercial use prohibited."
    },
    projectConfirm: {
      title: "Save Changes?",
      message: "Do you want to save changes to the current project before closing it?",
      yes: "Yes (Save)",
      no: "No (Discard)",
      cancel: "Cancel"
    },
    settings: {
        title: "Application Preferences",
        tabs: {
            general: "General",
            opcua: "OPC UA Defaults",
            certificates: "Certificates (PKI)"
        },
        general: {
            language: "Language",
            autoConnect: "Auto-connect on startup",
            theme: "Appearance (Theme)"
        },
        opcua: {
            appName: "Application Name",
            reqTimeout: "Request Timeout (ms)",
            keepAlive: "KeepAlive Interval (ms)",
            reconnectDelay: "Auto Reconnect Delay (ms)"
        },
        pki: {
            desc: "Manage your client certificate authentication path. These certificates are used when connecting to secure servers.",
            clientCertPath: "Client Certificate Path (PKI Root)",
            openFolder: "Open Folder",
            trusted: "Trusted",
            rejected: "Rejected",
            own: "Own"
        },
        actions: {
            save: "Save Settings",
            cancel: "Cancel"
        }
    },
    statsMonitor: {
        title: "Network Stability Monitor",
        sessionName: "Session Name",
        status: "Current Status",
        dropCount: "Drop Count",
        lastError: "Last Error Message",
        lastDropTime: "Drop Time",
        lastRecoveryTime: "Recovery Time",
        reset: "Reset Counters",
        noDrops: "Excellent! No unexpected drops detected.",
        hasDrops: "Warning: Connection instability detected."
    },
    status: {
      connected: "Connected",
      connecting: "Connecting",
      disconnected: "Disconnected",
      error: "Error"
    },
    connection: {
      title: "Server Connection",
      endpointUrl: "Endpoint URL",
      securityMode: "Security Mode",
      securityPolicy: "Security Policy",
      authSection: "Authentication Settings",
      modes: {
        anonymous: "Anonymous",
        username: "Username",
        certificate: "Certificate"
      },
      fields: {
        username: "Username",
        password: "Password",
        cert: "Client Certificate (.der)",
        key: "Private Key (.pem)",
        autoTrust: "Auto-Accept Server Certificate",
        autoTrustDesc: "Automatically trust the server's application certificate (Self-Signed)."
      },
      btn: {
        connect: "Connect",
        connecting: "Connecting...",
        disconnect: "Disconnect",
        getEndpoints: "Get Endpoints",
        collapse: "Collapse",
        expand: "Expand"
      },
      endpointsModal: {
        title: "Discovered Endpoints",
        select: "Select",
        security: "Security",
        none: "No endpoints found."
      }
    },
    workspace: {
      tabDash: "Dashboard",
      tabRW: "Data Access",
      tabSub: "Subscription",
      tabBrowser: "Address Space",
      tabTrend: "Trends",
      tabEvents: "Events & Alarms",
      tabScheduler: "Scheduler", 
      tabChaos: "Chaos Testing",
      logs: "System Events",
      filterAll: "ALL",
      filterOk: "OK",
      filterErr: "ERROR",
      dropHint: "Drop node here to view..."
    },
    dashboard: {
      health: "Session Health",
      healthScore: "Connection Score",
      diagSection: "Performance Diagnostics",
      uptime: "Uptime",
      throughput: "Throughput",
      context: "Session Context",
      statusLabel: "Connection Status",
      active: "Active (Connected)",
      disconnected: "Disconnected",
      securityMode: "Security Mode",
      identity: "Identity",
      received: "Received",
      sent: "Sent",
      dropCount: "Drop Count",
      avg: "Avg",
      peak: "Peak",
      throughputDesc: "Real-time monitored items processed per second",
      itemsSec: "Items/sec",
      opsSec: "Ops/sec",
      traffic: "Traffic",
      bytesIn: "Bytes In",
      bytesOut: "Bytes Out",
      rtt: "Network RTT",
      ms: "ms",
      slowOps: {
          title: "Top 10 Slowest Operations",
          op: "Operation",
          target: "Target ID",
          duration: "Duration",
          time: "Timestamp",
          empty: "Excellent! No slow operations recorded recently.",
          threshold: "Threshold > 150ms"
      }
    },
    trend: {
      title: "Real-time Trending",
      trendGroups: "Trend Groups",
      addGroups: "Add Group",
      noNodes: "No nodes selected for trending.",
      addFromRW: "Add nodes from Data Access or Browser.",
      live: "LIVE",
      paused: "PAUSED",
      clear: "Clear All",
      deleteSelected: "Delete Selected",
      visibility: "Show/Hide on Chart",
      exportCsv: "Export CSV",
      cycle: "Cycle",
      viewMode: {
          overlay: "Overlay Mode",
          split: "Split Grid Mode"
      },
      interpolation: {
          label: "Interpolation",
          linear: "Linear",
          step: "Stepped"
      },
      history: {
          label: "History",
          points: "pts"
      },
      contextMenu: {
          rename: "Rename Group",
          delete: "Delete Group",
          clear: "Clear Series",
          moveLeft: "Move Left",
          moveRight: "Move Right"
      },
      card: {
          maximize: "Maximize View",
          restore: "Restore Grid"
      }
    },
    events: {
      title: "Events & Alarms",
      severity: "Severity",
      time: "Time",
      source: "Source",
      message: "Message",
      type: "Event Type",
      waiting: "Waiting for events..."
    },
    scheduler: { 
        title: "Data Forwarder / Scheduler",
        addTask: "Add Task",
        startAll: "Start All",
        stopAll: "Stop All",
        import: "Import CSV",
        export: "Export CSV",
        resetStats: "Reset Stats",
        candidates: {
            source: "Source Candidates",
            target: "Target Candidates",
            addAll: "Add All",
            autoMap: "Auto Map"
        },
        table: {
            status: "Status",
            source: "Source Node (Read)",
            target: "Target Node (Write)",
            interval: "Interval (ms)",
            lastValue: "Last Transfer",
            stats: "Run / Err", 
            action: "Action"
        },
        activeMappings: "Active Mappings",
        deleteSelected: "Delete Selected",
        empty: "No tasks defined. Drag nodes here or use 'Add Task'.",
        placeholders: {
            source: "Source NodeId",
            target: "Target NodeId"
        }
    },
    method: {
      title: "Call Method",
      execute: "Execute",
      result: "Result",
      invoking: "Calling..."
    },
    rw: {
      inspector: "Single Node Read/Write",
      inspectorSubtitle: "Quickly read/write a single node",
      batchGroups: "Multi-node Read/Write List",
      addGroups: "Add Groups",
      readCycle: "Read Cycle",
      batchSize: "Batch Size",
      writeCycle: "Write Cycle",
      nodeId: "Node ID",
      displayName: "Display Name",
      dataType: "Data Type",
      value: "Value",
      quality: "Quality",
      timestamp: "Timestamp",
      latency: "Latency",
      watchdog: {
          read: "Read Monitor",
          write: "Write Monitor",
          lastSync: "Last Sync",
          requests: "Requests",
          stalled: "STALLED",
          active: "ACTIVE"
      },
      actions: {
        read: "Read",
        write: "Write",
        add: "Add",
        trend: "Trend",
        template: "Template",
        export: "Export Snapshot",
        import: "Import Snapshot",
        batchWrite: "Batch Write",
        deleteSelected: "Delete Selected"
      },
      contextMenu: {
          rename: "Rename Group",
          delete: "Delete Group",
          clear: "Clear Items",
          moveLeft: "Move Left",
          moveRight: "Move Right"
      },
      batchWriteModal: {
          title: "Batch Write",
          message: "Write value to selected nodes:",
          confirm: "Write All",
          cancel: "Cancel"
      },
      placeholders: {
        addNode: "Add to group: NodeID..."
      }
    },
    sub: {
      title: "Subscription Monitor",
      view: "VIEW",
      settings: {
        publish: "Publish(ms)",
        sample: "Sample(ms)",
        queue: "Queue",
        qty: "Qty"
      },
      configModal: {
          title: "Create Subscription View",
          subSettings: "Subscription Parameters",
          itemSettings: "Monitored Item Defaults",
          publishingInterval: "Publishing Interval",
          lifetimeCount: "Lifetime Count",
          maxKeepAlive: "Max KeepAlive Count",
          maxNotifications: "Max Notifications / Publish",
          priority: "Priority",
          publishTimeout: "Publish Timeout",
          samplingInterval: "Sampling Interval",
          queueSize: "Queue Size",
          discardOldest: "Discard Oldest",
          confirm: "Create View",
          cancel: "Cancel",
          reset: "Reset to Default"
      },
      actions: {
        startAll: "Start All",
        pauseAll: "Pause All",
        addViews: "Add Views",
        addItems: "Add Items",
        template: "Template",
        export: "Export",
        import: "Import"
      },
      liveData: "Live Data",
      recording: {
          start: "Recording",
          stop: "Stop",
          export: "Export CSV",
          count: "items buffered"
      },
      table: {
        handle: "Handle",
        nodeId: "Node ID",
        displayName: "Display Name",
        dataType: "Data Type",
        value: "Value",
        time: "Time",
        statusCode: "StatusCode",
        action: "Action"
      }
    },
    browser: {
      title: "Address Space",
      basket: "Variable Table",
      addToRW: "Add to Read/Write",
      addToSub: "Add to Subscription",
      addToTrend: "Add to Trend",
      addToScheduler: "Add to Scheduler", 
      connectFirst: "Connect to browse address space",
      empty: "Empty",
      isMethod: "Method Node",
      alreadyAdded: "Added",
      addChecked: "Add Checked",
      uncheckAll: "Uncheck All",
      checkHighlights: "Check Highlighted",
      uncheckHighlights: "Uncheck Highlighted",
      deleteSelected: "Delete Selected",
      noSelectionTitle: "No Selection",
      noSelectionMsg: "Please check at least one item in the variable table before performing this action.",
      treeSelectionMsg: "No nodes selected in the tree.",
      clearSelection: "Clear",
      duplicatesTitle: "Duplicates Detected",
      duplicatesMsg: "The following nodes are already present in the target view. Only new nodes will be added.",
      duplicatesList: "Existing IDs:",
      contextMenu: {
        viewAttributes: "View Attributes",
        copyNodeId: "Copy NodeId",
        selectAllChildren: "Select All Children",
        deselectAllChildren: "Select All Children",
        refresh: "Refresh Children"
      },
      targetModal: {
        titleRW: "Select Read/Write Groups",
        titleSub: "Select Subscription Views",
        titleTrend: "Select Trend Groups",
        noGroupsRW: "No Read/Write groups created. Please create a group in the Data Access panel first.",
        noGroupsSub: "No Subscriptions created. Please create a view in the Subscription panel first.",
        noGroupsTrend: "No Trend groups created. Please create a group in the Trend panel first.",
        emptyGroups: "No groups found.",
        createDefault: "A default one will be created.",
        confirm: "Add",
        cancel: "Cancel"
      },
      attributesModal: {
          title: "Node Attributes",
          close: "Close"
      },
      schedulerModal: {
          title: "Add to Scheduler",
          noGroups: "No scheduler groups found.",
          targetGroup: "Select Target Group",
          listType: "Select List Type",
          sourceList: "Source List",
          targetList: "Target List"
      }
    },
    valueDisplay: {
        title: "Value Inspector",
        close: "Close",
        copyExcel: "Copy Data",
        pasteExcel: "Paste Input"
    },
    chaos: {
      title: "Reliability & Chaos Testing",
      desc: "Perform abnormal requests to test server robustness.",
      emergencyStop: "EMERGENCY STOP",
      metrics: {
          rtt: "Latency (RTT)",
          tps: "Ops/Sec",
          health: "Stability Score",
          distribution: "Status Distribution"
      },
      types: {
        flood: "Session Flood",
        fuzz: "NodeId Fuzzing",
        write: "Type Mismatch Write",
        malformed: "Malformed Packet",
        subStorm: "Subscription Storm",
        flapping: "Connect Flapping",
        downgrade: "Protocol Downgrade",
        secureStress: "Secure Channel Stress",
        recursive: "Recursive Browse"
      },
      descriptions: {
        flood: "Creates multiple ephemeral connections rapidly to test server's session limit and resource cleanup logic.",
        fuzz: "Sends ReadRequests with malformed, empty, or excessively long NodeIds to test the server's parser robustness.",
        write: "Repeatedly attempts to write String values to a numeric node to test type checking efficiency and error handling.",
        malformed: "Sends a raw TCP packet with a modified header length larger than the payload to test Server OOM handling.",
        subStorm: "Creates a 0ms interval subscription with 1000 items to stress test the scheduler queue.",
        flapping: "Rapidly connects and disconnects a single session to exhaust TCP sockets (TIME_WAIT).",
        downgrade: "Forces a 'None' security policy connection attempt to verify server's mandatory security enforcement.",
        secureStress: "Repeatedly opens SecureChannels without creating sessions to consume server CPU with encryption handshakes.",
        recursive: "Recursively browses the entire address space starting from Root to test memory and reference tracking."
      },
      start: "Start Attack",
      stop: "Stop Attack",
      logs: "Attack Logs"
    },
    modbusScheduler: {
        title: "Data Mapping (Loopback)",
        addTask: "Add Mapping",
        deleteSelected: "Delete Selected",
        enableAll: "Enable All",
        disableAll: "Disable All",
        source: "Source (Read)",
        target: "Target (Write)",
        lastValue: "Last Value",
        status: "Status",
        noRegisters: "No registers available. Please add registers in 'Register Table' tab first.",
        hint: "Maps the value from a Read channel to a Write channel automatically when changed."
    }
  },
  zh: {
    // ... (existing translations)
    app: {
      title: "OPC UA 客户端",
      sessions: "会话列表",
      help: "帮助与文档",
      stats: "掉线统计",
      settings: "全局设置",
      connectAll: "全部连接",
      stopAll: "全部断开",
      batchQty: "数量",
      copyright: "版权所有 © 2024 颜伟平 (Yan Weiping)。保留所有权利。严禁擅自进行非法商业活动及盈利。"
    },
    projectConfirm: {
      title: "保存更改?",
      message: "在关闭当前工程之前，是否要保存所做的更改?",
      yes: "是 (保存)",
      no: "否 (放弃)",
      cancel: "取消"
    },
    settings: {
        title: "应用偏好设置",
        tabs: {
            general: "常规设置",
            opcua: "OPC UA 参数",
            certificates: "证书管理 (PKI)"
        },
        general: {
            language: "语言",
            autoConnect: "启动时自动连接",
            theme: "外观主题"
        },
        opcua: {
            appName: "应用名称 (Application Name)",
            reqTimeout: "默认请求超时 (ms)",
            keepAlive: "KeepAlive 间隔 (ms)",
            reconnectDelay: "自动重连延迟 (ms)"
        },
        pki: {
            desc: "管理您的客户端证书存储路径。连接安全服务器时，您可能需要将这里的证书添加到服务器信任列表。",
            clientCertPath: "客户端证书根目录 (PKI Root)",
            openFolder: "打开文件夹",
            trusted: "受信任证书",
            rejected: "已拒绝证书",
            own: "自有证书"
        },
        actions: {
            save: "保存设置",
            cancel: "取消"
        }
    },
    statsMonitor: {
        title: "网络稳定性监控 (Drop Stats)",
        sessionName: "会话名称",
        status: "当前状态",
        dropCount: "掉线次数",
        lastError: "最后报错信息",
        lastDropTime: "掉线时间",
        lastRecoveryTime: "恢复时间",
        reset: "重置计数",
        noDrops: "完美！暂未检测到意外掉线。",
        hasDrops: "警告：检测到网络连接不稳定。"
    },
    status: {
      connected: "已连接",
      connecting: "连接中",
      disconnected: "已断开",
      error: "连接错误"
    },
    connection: {
      title: "服务器连接配置",
      endpointUrl: "端点地址 (Endpoint URL)",
      securityMode: "消息安全模式 (Security Mode)",
      securityPolicy: "安全策略 (Security Policy)",
      authSection: "身份验证设置",
      modes: {
        anonymous: "匿名登录",
        username: "用户名/密码",
        certificate: "证书验证"
      },
      fields: {
        username: "用户名",
        password: "密码",
        cert: "客户端证书 (.der)",
        key: "私钥文件 (.pem)",
        autoTrust: "自动信任服务端证书",
        autoTrustDesc: "在握手阶段自动信任服务端发来的应用证书（通常为自签名）。"
      },
      btn: {
        connect: "连接服务器",
        connecting: "正在连接...",
        disconnect: "断开连接",
        getEndpoints: "获取端点 (Get Endpoints)",
        collapse: "折叠面板",
        expand: "展开面板"
      },
      endpointsModal: {
        title: "发现的服务器端点",
        select: "选择",
        security: "安全策略",
        none: "未找到端点信息。"
      }
    },
    workspace: {
      tabDash: "仪表盘 (Dashboard)",
      tabRW: "数据读写 (Data Access)",
      tabSub: "订阅监控 (Subscription)",
      tabBrowser: "地址空间 (Browser)",
      tabTrend: "实时趋势 (Trend)",
      tabEvents: "报警事件 (A&C)",
      tabScheduler: "数据桥接 (Scheduler)", 
      tabChaos: "异常测试 (Chaos)",
      logs: "系统日志 (Events)",
      filterAll: "全部",
      filterOk: "正常",
      filterErr: "错误",
      dropHint: "拖放到此处查看..."
    },
    dashboard: {
      health: "会话健康度看板",
      healthScore: "连接健康分",
      diagSection: "性能诊断分析",
      uptime: "运行时间",
      throughput: "吞吐量统计",
      context: "会话上下文",
      statusLabel: "连接状态",
      active: "活跃 (已连接)",
      disconnected: "已断开",
      securityMode: "安全模式",
      identity: "身份标识",
      received: "接收总量",
      sent: "发送总量",
      dropCount: "掉线次数",
      avg: "平均",
      peak: "峰值",
      throughputDesc: "每秒处理的实时监控项数量",
      itemsSec: "监控项/秒",
      opsSec: "操作数/秒",
      traffic: "流量统计",
      bytesIn: "接收字节",
      bytesOut: "发送字节",
      rtt: "网络延迟 (RTT)",
      ms: "毫秒",
      slowOps: {
          title: "慢操作排行榜 (Top 10 Slowest)",
          op: "操作类型",
          target: "目标对象",
          duration: "耗时",
          time: "发生时间",
          empty: "完美！近期未记录到慢操作。",
          threshold: "阈值 > 150ms"
      }
    },
    trend: {
      title: "实时数据趋势图",
      trendGroups: "趋势分组",
      addGroups: "新建分组",
      noNodes: "暂无趋势变量。",
      addFromRW: "请从“数据读写”或“地址空间”界面添加变量。",
      live: "实时",
      paused: "暂停",
      clear: "清空",
      deleteSelected: "批量删除",
      visibility: "显示/隐藏曲线",
      exportCsv: "导出CSV",
      cycle: "周期",
      viewMode: {
          overlay: "叠加视图",
          split: "分屏视图"
      },
      interpolation: {
          label: "插值模式",
          linear: "平滑 (Linear)",
          step: "阶梯 (Step)"
      },
      history: {
          label: "历史长度",
          points: "点"
      },
      contextMenu: {
          rename: "重命名",
          delete: "删除分组",
          clear: "清空曲线",
          moveLeft: "向左移动",
          moveRight: "向右移动"
      },
      card: {
          maximize: "放大视图",
          restore: "还原网格"
      }
    },
    events: {
      title: "实时报警与事件 (Alarms & Conditions)",
      severity: "严重性",
      time: "发生时间",
      source: "事件源 (Source)",
      message: "报警消息",
      type: "事件类型",
      waiting: "正在等待事件上报..."
    },
    scheduler: { 
        title: "数据转发调度器 (Scheduler)",
        addTask: "添加任务",
        startAll: "启动所有",
        stopAll: "停止所有",
        import: "导入CSV",
        export: "导出CSV",
        resetStats: "重置统计",
        candidates: {
            source: "源节点候选",
            target: "目标节点候选",
            addAll: "添加全部",
            autoMap: "自动映射"
        },
        table: {
            status: "状态",
            source: "源节点 (读取)",
            target: "目标节点 (写入)",
            interval: "间隔(ms)",
            lastValue: "最后值",
            stats: "运行/错误", 
            action: "操作"
        },
        activeMappings: "当前调度任务",
        deleteSelected: "删除选中",
        empty: "暂无任务。请从上方拖拽节点或点击“添加任务”。",
        placeholders: {
            source: "源节点 NodeId",
            target: "目标节点 NodeId"
        }
    },
    method: {
      title: "调用方法 (Call Method)",
      execute: "执行",
      result: "返回结果",
      invoking: "调用中..."
    },
    rw: {
      inspector: "单点读写 (Inspector)",
      inspectorSubtitle: "快速测试单个节点",
      batchGroups: "读写列表 (Batch List)",
      addGroups: "添加分组",
      readCycle: "读取周期",
      batchSize: "批次大小",
      writeCycle: "写入周期",
      nodeId: "节点ID",
      displayName: "显示名称",
      dataType: "数据类型",
      value: "数值",
      quality: "质量状态",
      timestamp: "时间戳",
      latency: "延迟",
      watchdog: {
          read: "读取监控",
          write: "写入监控",
          lastSync: "上次同步",
          requests: "总请求数",
          stalled: "请求停滞",
          active: "运行中"
      },
      actions: {
        read: "读取",
        write: "写入",
        add: "添加",
        trend: "趋势",
        template: "模板",
        export: "导出配置",
        import: "导入配置",
        batchWrite: "批量写入",
        deleteSelected: "删除选中"
      },
      contextMenu: {
          rename: "重命名分组",
          delete: "删除分组",
          clear: "清空列表",
          moveLeft: "向左移动",
          moveRight: "向右移动"
      },
      batchWriteModal: {
          title: "批量写入",
          message: "将数值写入选中节点:",
          confirm: "全部写入",
          cancel: "取消"
      },
      placeholders: {
        addNode: "添加节点: NodeID..."
      }
    },
    sub: {
      title: "订阅监控 (Subscription)",
      view: "视图",
      settings: {
        publish: "发布周期(ms)",
        sample: "采样周期(ms)",
        queue: "队列大小",
        qty: "数量"
      },
      configModal: {
          title: "创建订阅视图",
          subSettings: "订阅参数 (Subscription)",
          itemSettings: "监控项参数 (Monitored Item)",
          publishingInterval: "发布间隔 (Publishing Interval)",
          lifetimeCount: "生存计数 (Lifetime Count)",
          maxKeepAlive: "最大保活 (Max KeepAlive)",
          maxNotifications: "Max Notifications / Publish",
          priority: "优先级 (Priority)",
          publishTimeout: "发布超时 (Publish Timeout)",
          samplingInterval: "采样间隔 (Sampling Interval)",
          queueSize: "队列大小 (Queue Size)",
          discardOldest: "丢弃旧值 (Discard Oldest)",
          confirm: "确认创建",
          cancel: "取消",
          reset: "重置默认"
      },
      actions: {
        startAll: "启动所有",
        pauseAll: "暂停所有",
        addViews: "添加视图",
        addItems: "添加节点",
        template: "下载模板",
        export: "导出",
        import: "导入"
      },
      liveData: "实时数据",
      recording: {
          start: "录制",
          stop: "停止",
          export: "导出CSV",
          count: "items buffered"
      },
      table: {
        handle: "Handle",
        nodeId: "Node ID",
        displayName: "Display Name",
        dataType: "Data Type",
        value: "Value",
        time: "Time",
        statusCode: "StatusCode",
        action: "Action"
      }
    },
    browser: {
      title: "地址空间 (Address Space)",
      basket: "变量表",
      addToRW: "添加到读写",
      addToSub: "添加到订阅",
      addToTrend: "添加到趋势",
      addToScheduler: "添加到调度器", 
      connectFirst: "请先连接服务器以浏览地址空间",
      empty: "Empty",
      isMethod: "方法节点",
      alreadyAdded: "已添加",
      addChecked: "添加选中项",
      uncheckAll: "取消全选",
      checkHighlights: "勾选高亮",
      uncheckHighlights: "取消高亮",
      deleteSelected: "删除选中",
      noSelectionTitle: "未选择",
      noSelectionMsg: "请先在变量表中勾选至少一项。",
      treeSelectionMsg: "树中未选择节点。",
      clearSelection: "清空",
      duplicatesTitle: "检测到重复",
      duplicatesMsg: "以下节点已存在于目标视图中，仅添加新节点。",
      duplicatesList: "已存在ID:",
      contextMenu: {
        viewAttributes: "查看属性",
        copyNodeId: "复制 NodeId",
        selectAllChildren: "全选子节点",
        deselectAllChildren: "取消全选子节点",
        refresh: "刷新子节点"
      },
      targetModal: {
        titleRW: "选择读写分组",
        titleSub: "选择订阅视图",
        titleTrend: "选择趋势分组",
        noGroupsRW: "未创建读写分组，请先在数据读写面板创建。",
        noGroupsSub: "未创建订阅视图，请先在订阅面板创建。",
        noGroupsTrend: "未创建趋势分组，请先在趋势面板创建。",
        emptyGroups: "未找到分组。",
        createDefault: "将自动创建一个默认分组。",
        confirm: "确认添加",
        cancel: "取消"
      },
      attributesModal: {
          title: "节点属性",
          close: "关闭"
      },
      schedulerModal: {
          title: "Add to Scheduler",
          noGroups: "No scheduler groups found.",
          targetGroup: "选择目标分组",
          listType: "Select List Type",
          sourceList: "Source List",
          targetList: "Target List"
      }
    },
    valueDisplay: {
        title: "数值查看器",
        close: "关闭",
        copyExcel: "复制数据",
        pasteExcel: "粘贴输入"
    },
    chaos: {
      title: "异常请求测试 (Reliability)",
      desc: "发送非标或压力请求，测试服务器健壮性。",
      emergencyStop: "紧急停止",
      metrics: {
          rtt: "响应延迟 (RTT)",
          tps: "每秒操作 (Ops)",
          health: "稳定性评分",
          distribution: "状态分布"
      },
      types: {
        flood: "会话风暴 (Session Flood)",
        fuzz: "节点模糊测试 (NodeId Fuzzing)",
        write: "类型错配写入 (Mismatch Write)",
        malformed: "畸形报文 (Malformed Packet)",
        subStorm: "订阅压榨 (Subscription Storm)",
        flapping: "连接闪烁 (Flapping)",
        downgrade: "策略降级 (Protocol Downgrade)",
        secureStress: "加密握手风暴 (Secure Channel Stress)",
        recursive: "递归浏览风暴 (Recursive Browse)"
      },
      descriptions: {
        flood: "快速建立大量临时连接，用于测试服务器的会话上限及资源回收逻辑。",
        fuzz: "发送包含畸形、空值或超长字符的 NodeId 读取请求，测试服务端解析器的健壮性。",
        write: "反复尝试向数值类型的节点写入字符串数据，测试服务端的类型检查效率及容错能力。",
        malformed: "发送头部长度字段远大于实际内容的 TCP 报文，测试服务端内存分配及 OOM 处理。",
        subStorm: "创建 0ms 周期的订阅并添加 1000 个监控项，测试服务端的队列堆积及调度崩溃极限。",
        flapping: "单会话以 50ms 频率快速循环“连接-断开”，测试服务端 TCP 端口回收 (TIME_WAIT) 能力。",
        downgrade: "强制使用 'None' 不加密策略发起连接，验证服务器是否正确执行了安全准入限制。",
        secureStress: "仅打开 SecureChannel 但不创建 Session，高频握手测试服务器非对称加密 (CPU) 负载。",
        recursive: "从 Root 节点开始无限递归浏览子节点，测试服务器的引用跟踪和内存管理能力。"
      },
      start: "开始测试",
      stop: "停止",
      logs: "测试日志"
    },
    modbusScheduler: {
        title: "数据映射与调度 (Data Mapping)",
        addTask: "添加映射任务",
        deleteSelected: "删除选中",
        enableAll: "全部启用",
        disableAll: "全部禁用",
        source: "源通道 (读取值)",
        target: "目标通道 (写入值)",
        lastValue: "最后传输值",
        status: "状态",
        noRegisters: "暂无可用的寄存器通道。请先在“寄存器表”中添加通道。",
        hint: "自动监控源通道的数值变化，并将其写入到目标通道中 (Loopback / Follow)。"
    }
  }
};

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof dictionary['en'];
}>({
  language: 'zh',
  setLanguage: () => {},
  t: dictionary['zh']
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: dictionary[language] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
