/* 示例数据：日期相对今天生成，保证任何时候载入演示数据都合理 */
window.SEED_DATA = (function () {
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function ts(daysBack, h, m) {
    var d = new Date();
    d.setDate(d.getDate() - daysBack);
    d.setHours(h, m || 0, 0, 0);
    return d.toISOString();
  }

  var customers = [
    { id: "c_001", name: "张伟", phone: "13800001111", address: "海淀区中关村大街 27 号", remark: "老客户", createdAt: ts(120, 10) },
    { id: "c_002", name: "李娜", phone: "13900002222", address: "朝阳区望京 SOHO T3-1208", remark: "", createdAt: ts(90, 14) },
    { id: "c_003", name: "王强", phone: "13700003333", address: "西城区金融街丰汇园 11 号楼", remark: "公司客户-星辰科技", createdAt: ts(60, 9) },
    { id: "c_004", name: "赵敏", phone: "13600004444", address: "东城区东直门南大街 9 号", remark: "", createdAt: ts(45, 16) },
    { id: "c_005", name: "陈杰", phone: "13500005555", address: "丰台区科技园航丰路 8 号", remark: "", createdAt: ts(20, 11) },
    { id: "c_006", name: "刘洋", phone: "13400006666", address: "昌平区回龙观龙腾苑 6 区", remark: "", createdAt: ts(8, 15) }
  ];

  var parts = [
    { id: "p_001", name: "DDR4 内存条 8G", stock: 12, unitPrice: 169, remark: "", updatedAt: ts(5, 10) },
    { id: "p_002", name: "DDR4 内存条 16G", stock: 8, unitPrice: 329, remark: "", updatedAt: ts(5, 10) },
    { id: "p_003", name: "NVMe 固态硬盘 512G", stock: 6, unitPrice: 359, remark: "", updatedAt: ts(3, 9) },
    { id: "p_004", name: "NVMe 固态硬盘 1T", stock: 4, unitPrice: 599, remark: "", updatedAt: ts(3, 9) },
    { id: "p_005", name: "笔记本电池（通用型）", stock: 5, unitPrice: 289, remark: "", updatedAt: ts(6, 14) },
    { id: "p_006", name: "散热风扇", stock: 10, unitPrice: 89, remark: "", updatedAt: ts(2, 16) },
    { id: "p_007", name: "13.3 寸液晶屏", stock: 2, unitPrice: 680, remark: "低库存注意补货", updatedAt: ts(1, 11) },
    { id: "p_008", name: "机械键盘轴体套装", stock: 15, unitPrice: 59, remark: "", updatedAt: ts(4, 13) }
  ];

  var orders = [
    {
      id: "o_001", orderNo: "WO" + daysAgo(0).replace(/-/g, "") + "-001",
      customerId: "c_006", customerName: "刘洋", phone: "13400006666", address: "昌平区回龙观龙腾苑 6 区",
      deviceBrand: "联想", deviceModel: "小新 Pro 14", serialNo: "SN8X3K2A1",
      purchaseDate: daysAgo(200), warrantyMonths: 24, warrantyStatus: "in",
      faultDesc: "开机黑屏，电源指示灯亮，风扇转", faultCategory: "hardware",
      priority: "urgent", serviceType: "warranty_free", status: "pending",
      diagnosis: "", repairActions: "", partsUsed: [], laborCost: 0, partsCost: 0, totalCost: 0,
      createdAt: ts(0, 9, 12), updatedAt: ts(0, 9, 12), closedAt: null,
      statusHistory: [{ from: null, to: "pending", at: ts(0, 9, 12), note: "客户送修" }],
      remark: "客户表示电脑内有重要资料，需优先处理"
    },
    {
      id: "o_002", orderNo: "WO" + daysAgo(1).replace(/-/g, "") + "-002",
      customerId: "c_005", customerName: "陈杰", phone: "13500005555", address: "丰台区科技园航丰路 8 号",
      deviceBrand: "华硕", deviceModel: "天选 4", serialNo: "SN7Y2J9B3",
      purchaseDate: daysAgo(800), warrantyMonths: 24, warrantyStatus: "expired",
      faultDesc: "玩游戏十分钟自动关机，疑似过热", faultCategory: "hardware",
      priority: "high", serviceType: "paid", status: "repairing",
      diagnosis: "散热硅脂干涸，风扇积灰严重", repairActions: "拆机清灰，更换硅脂与散热风扇",
      partsUsed: [{ partId: "p_006", name: "散热风扇", qty: 1, unitPrice: 89 }],
      laborCost: 80, partsCost: 89, totalCost: 169,
      createdAt: ts(1, 14, 30), updatedAt: ts(0, 10, 5), closedAt: null,
      statusHistory: [
        { from: null, to: "pending", at: ts(1, 14, 30), note: "" },
        { from: "pending", to: "accepted", at: ts(1, 15, 2), note: "" },
        { from: "accepted", to: "repairing", at: ts(0, 10, 5), note: "已开始拆机检测" }
      ],
      remark: ""
    },
    {
      id: "o_003", orderNo: "WO" + daysAgo(2).replace(/-/g, "") + "-001",
      customerId: "c_004", customerName: "赵敏", phone: "13600004444", address: "东城区东直门南大街 9 号",
      deviceBrand: "苹果", deviceModel: "MacBook Air M2", serialNo: "SN5T8K1C9",
      purchaseDate: daysAgo(100), warrantyMonths: 12, warrantyStatus: "in",
      faultDesc: "屏幕出现竖线，时好时坏", faultCategory: "hardware",
      priority: "medium", serviceType: "warranty_free", status: "waiting_parts",
      diagnosis: "屏幕排线故障，需更换屏幕总成", repairActions: "",
      partsUsed: [{ partId: "p_007", name: "13.3 寸液晶屏", qty: 1, unitPrice: 680 }],
      laborCost: 0, partsCost: 680, totalCost: 0,
      createdAt: ts(2, 11, 20), updatedAt: ts(1, 16, 40), closedAt: null,
      statusHistory: [
        { from: null, to: "pending", at: ts(2, 11, 20), note: "" },
        { from: "pending", to: "accepted", at: ts(2, 13, 5), note: "" },
        { from: "accepted", to: "repairing", at: ts(2, 15, 0), note: "" },
        { from: "repairing", to: "waiting_parts", at: ts(1, 16, 40), note: "屏幕总成缺货，已下单采购" }
      ],
      remark: "保内免费换屏"
    },
    {
      id: "o_004", orderNo: "WO" + daysAgo(4).replace(/-/g, "") + "-001",
      customerId: "c_003", customerName: "王强", phone: "13700003333", address: "西城区金融街丰汇园 11 号楼",
      deviceBrand: "戴尔", deviceModel: "XPS 13", serialNo: "SN3M5L7D2",
      purchaseDate: daysAgo(400), warrantyMonths: 24, warrantyStatus: "in",
      faultDesc: "系统频繁蓝屏，办公文档无法保存", faultCategory: "software",
      priority: "medium", serviceType: "warranty_free", status: "qc",
      diagnosis: "系统文件损坏 + 内存条接触不良", repairActions: "重装系统，重插内存条并除尘",
      partsUsed: [], laborCost: 0, partsCost: 0, totalCost: 0,
      createdAt: ts(4, 10, 0), updatedAt: ts(1, 9, 30), closedAt: null,
      statusHistory: [
        { from: null, to: "pending", at: ts(4, 10, 0), note: "" },
        { from: "pending", to: "accepted", at: ts(4, 10, 30), note: "" },
        { from: "accepted", to: "repairing", at: ts(3, 9, 0), note: "" },
        { from: "repairing", to: "qc", at: ts(1, 9, 30), note: "维修完成，待质检拷机" }
      ],
      remark: "公司批量维护客户，注意数据备份"
    },
    {
      id: "o_005", orderNo: "WO" + daysAgo(6).replace(/-/g, "") + "-001",
      customerId: "c_002", customerName: "李娜", phone: "13900002222", address: "朝阳区望京 SOHO T3-1208",
      deviceBrand: "惠普", deviceModel: "战 66 五代", serialNo: "SN9P4Q6E8",
      purchaseDate: daysAgo(1100), warrantyMonths: 12, warrantyStatus: "expired",
      faultDesc: "电池不充电，续航不足半小时", faultCategory: "hardware",
      priority: "low", serviceType: "paid", status: "finished",
      diagnosis: "电池鼓包老化", repairActions: "更换全新电池，检测充电电路正常",
      partsUsed: [{ partId: "p_005", name: "笔记本电池（通用型）", qty: 1, unitPrice: 289 }],
      laborCost: 50, partsCost: 289, totalCost: 339,
      createdAt: ts(6, 15, 40), updatedAt: ts(2, 14, 10), closedAt: null,
      statusHistory: [
        { from: null, to: "pending", at: ts(6, 15, 40), note: "" },
        { from: "pending", to: "accepted", at: ts(6, 16, 0), note: "" },
        { from: "accepted", to: "repairing", at: ts(5, 10, 0), note: "" },
        { from: "repairing", to: "qc", at: ts(3, 11, 0), note: "" },
        { from: "qc", to: "finished", at: ts(2, 14, 10), note: "质检通过，通知客户取机" }
      ],
      remark: ""
    },
    {
      id: "o_006", orderNo: "WO" + daysAgo(9).replace(/-/g, "") + "-001",
      customerId: "c_001", customerName: "张伟", phone: "13800001111", address: "海淀区中关村大街 27 号",
      deviceBrand: "联想", deviceModel: "拯救者 Y9000P", serialNo: "SN2R8T5F6",
      purchaseDate: daysAgo(60), warrantyMonths: 24, warrantyStatus: "in",
      faultDesc: "升级内存与硬盘，提升性能", faultCategory: "other",
      priority: "low", serviceType: "upgrade", status: "closed",
      diagnosis: "客户要求硬件升级", repairActions: "加装 16G 内存与 1T 固态，迁移系统",
      partsUsed: [
        { partId: "p_002", name: "DDR4 内存条 16G", qty: 1, unitPrice: 329 },
        { partId: "p_004", name: "NVMe 固态硬盘 1T", qty: 1, unitPrice: 599 }
      ],
      laborCost: 100, partsCost: 928, totalCost: 1028,
      createdAt: ts(9, 10, 20), updatedAt: ts(7, 16, 0), closedAt: ts(7, 16, 0),
      statusHistory: [
        { from: null, to: "pending", at: ts(9, 10, 20), note: "" },
        { from: "pending", to: "accepted", at: ts(9, 10, 40), note: "" },
        { from: "accepted", to: "repairing", at: ts(9, 14, 0), note: "" },
        { from: "repairing", to: "qc", at: ts(8, 11, 0), note: "" },
        { from: "qc", to: "finished", at: ts(8, 15, 30), note: "" },
        { from: "finished", to: "closed", at: ts(7, 16, 0), note: "客户已取机，满意" }
      ],
      remark: "升级服务已完成并收款"
    },
    {
      id: "o_007", orderNo: "WO" + daysAgo(12).replace(/-/g, "") + "-001",
      customerId: "c_002", customerName: "李娜", phone: "13900002222", address: "朝阳区望京 SOHO T3-1208",
      deviceBrand: "小米", deviceModel: "RedmiBook Pro 15", serialNo: "SN6W3X8G1",
      purchaseDate: daysAgo(500), warrantyMonths: 12, warrantyStatus: "expired",
      faultDesc: "WiFi 频繁断连，无法办公", faultCategory: "network",
      priority: "medium", serviceType: "paid", status: "closed",
      diagnosis: "无线网卡驱动冲突", repairActions: "更新驱动并重置网络模块，测试稳定",
      partsUsed: [], laborCost: 60, partsCost: 0, totalCost: 60,
      createdAt: ts(12, 9, 0), updatedAt: ts(11, 17, 30), closedAt: ts(11, 17, 30),
      statusHistory: [
        { from: null, to: "pending", at: ts(12, 9, 0), note: "" },
        { from: "pending", to: "accepted", at: ts(12, 9, 20), note: "" },
        { from: "accepted", to: "repairing", at: ts(12, 10, 0), note: "" },
        { from: "repairing", to: "qc", at: ts(11, 14, 0), note: "" },
        { from: "qc", to: "finished", at: ts(11, 16, 0), note: "" },
        { from: "finished", to: "closed", at: ts(11, 17, 30), note: "客户自取" }
      ],
      remark: ""
    },
    {
      id: "o_008", orderNo: "WO" + daysAgo(15).replace(/-/g, "") + "-001",
      customerId: "c_003", customerName: "王强", phone: "13700003333", address: "西城区金融街丰汇园 11 号楼",
      deviceBrand: "微软", deviceModel: "Surface Pro 9", serialNo: "SN1V5B2H7",
      purchaseDate: daysAgo(300), warrantyMonths: 12, warrantyStatus: "expired",
      faultDesc: "键盘部分按键失灵", faultCategory: "peripheral",
      priority: "high", serviceType: "paid", status: "cancelled",
      diagnosis: "", repairActions: "",
      partsUsed: [], laborCost: 0, partsCost: 0, totalCost: 0,
      createdAt: ts(15, 13, 10), updatedAt: ts(14, 10, 0), closedAt: null,
      statusHistory: [
        { from: null, to: "pending", at: ts(15, 13, 10), note: "" },
        { from: "pending", to: "cancelled", at: ts(14, 10, 0), note: "客户决定直接购买新键盘，取消维修" }
      ],
      remark: ""
    }
  ];

  return { customers: customers, parts: parts, orders: orders };
})();
