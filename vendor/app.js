const {
  useState,
  useMemo,
  useRef
} = React;
const SNAPSHOT_URL = './data/schedule.enc';

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptSnapshot(passphrase) {
  const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('snapshot missing');
  const envelope = await res.json();
  if (envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256') {
    throw new Error('unsupported snapshot format');
  }
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: b64ToBytes(envelope.salt),
    iterations: envelope.iter,
    hash: 'SHA-256'
  }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: b64ToBytes(envelope.iv)
  }, key, b64ToBytes(envelope.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
const ICON_SVG = {
  calendar: /*#__PURE__*/React.createElement("path", {
    d: "M8 2v4m8-4v4M3 10h18M21 14.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.5",
    stroke: "currentColor",
    fill: "none",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }),
  clock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
    stroke: "currentColor",
    fill: "none",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 6v6l4 2",
    stroke: "currentColor",
    fill: "none",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })),
  "bar-chart-3": /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v18h18",
    stroke: "currentColor",
    fill: "none",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 9V17M13 6V17M8 12V17",
    stroke: "currentColor",
    fill: "none",
    strokeWidth: "2",
    strokeLinecap: "round"
  }))
};
function Icon({
  name,
  size = "md",
  className = ""
}) {
  const wrapperClass = size === "sm" ? "icon-wrapper-sm" : "icon-wrapper";
  return /*#__PURE__*/React.createElement("span", {
    className: `${wrapperClass} ${className}`
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: {
      width: '100%',
      height: '100%'
    }
  }, ICON_SVG[name]));
}
function App() {
  const [passphrase, setPassphrase] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [days, setDays] = useState(15);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [error, setError] = useState(null);
  const [snapshotInfo, setSnapshotInfo] = useState(null);
  const calendarRef = useRef(null);
  const containerRef = useRef(null);
  const handleCrawl = async () => {
    if (!passphrase.trim()) {
      setError('请输入访问口令');
      return;
    }
    setLoading(true);
    setError(null);
    setEvents([]);
    setCurrentProgress(0);
    try {
      const snap = await decryptSnapshot(passphrase);
      const baseDate = new Date(startDate);
      const wanted = new Set();
      for (let i = 0; i < days; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i);
        wanted.add(d.toISOString().split('T')[0]);
      }
      const filtered = (snap.events || []).filter(e => wanted.has(e.date));
      setEvents(filtered);
      setSnapshotInfo({
        updatedAt: snap.updatedAt
      });
      setCurrentProgress(days);
    } catch (err) {
      setError('口令错误或数据损坏，请重试。');
    } finally {
      setLoading(false);
      setCurrentProgress(0);
    }
  };
  const handleExportImage = async () => {
    if (!calendarRef.current || events.length === 0) return;
    setExporting(true);
    const target = calendarRef.current;
    const container = containerRef.current;
    try {
      container.classList.add('exporting-mode');
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        width: target.scrollWidth,
        height: target.scrollHeight,
        onclone: clonedDoc => {
          const cards = clonedDoc.querySelectorAll('.event-card');
          cards.forEach(card => {
            card.style.height = 'auto';
            card.style.minHeight = '100px';
            const title = card.querySelector('.event-title');
            if (title) {
              title.style.whiteSpace = 'normal';
              title.style.overflow = 'visible';
            }
          });
        }
      });
      container.classList.remove('exporting-mode');
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `timetable_${startDate}.png`;
      link.click();
    } catch (err) {
      setError("图片导出失败");
    } finally {
      setExporting(false);
    }
  };
  const dateList = useMemo(() => {
    const list = [];
    const d = new Date(startDate);
    for (let i = 0; i < days; i++) {
      list.push(new Date(d).toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [startDate, days]);
  const timeLabels = Array.from({
    length: 14
  }, (_, i) => i + 8);
  const isStatEvent = event => !(event.title && /休息|教研/.test(event.title));

  // 统计数据计算
  const statistics = useMemo(() => {
    // 只把“真正的课程/任务”用于统计，但这些事件仍然在课表中显示
    const filteredEvents = events.filter(isStatEvent);
    if (filteredEvents.length === 0) {
      return {
        totalEvents: 0,
        totalHours: 0,
        avgDailyHours: 0,
        avgEventHours: 0,
        maxEventHours: 0,
        minEventHours: 0,
        stdDev: 0,
        dailyHours: [],
        activeDates: [],
        distributionBuckets: []
      };
    }
    const activeDates = dateList.filter(date => filteredEvents.some(event => event.date === date));

    // 计算每节课的时长（分钟），仅基于 filteredEvents
    const eventDurations = filteredEvents.map(event => {
      const [h1, m1] = event.start.split(':').map(Number);
      const [h2, m2] = event.end.split(':').map(Number);
      return h2 * 60 + m2 - (h1 * 60 + m1);
    });

    // 总时长（小时）
    const totalMinutes = eventDurations.reduce((a, b) => a + b, 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    // 平均课程时长（分钟）
    const avgEventMinutes = (totalMinutes / filteredEvents.length).toFixed(0);
    const avgEventHours = (avgEventMinutes / 60).toFixed(2);

    // 每天的课程时长
    const dailyMap = {};
    activeDates.forEach(date => dailyMap[date] = 0);
    filteredEvents.forEach(event => {
      const [h1, m1] = event.start.split(':').map(Number);
      const [h2, m2] = event.end.split(':').map(Number);
      const minutes = h2 * 60 + m2 - (h1 * 60 + m1);
      dailyMap[event.date] = (dailyMap[event.date] || 0) + minutes;
    });

    // 保持与 activeDates 相同的顺序
    const dailyHours = activeDates.map(date => ((dailyMap[date] || 0) / 60).toFixed(1));
    const totalDays = activeDates.length;
    const nonEmptyDailyHours = dailyHours.map(h => Number(h)).filter(v => v > 0);
    const emptyDays = totalDays - nonEmptyDailyHours.length;

    // 平均每天的课程时长（不含无课天）
    const avgDailyHours = nonEmptyDailyHours.length > 0 ? (nonEmptyDailyHours.reduce((a, b) => a + b, 0) / nonEmptyDailyHours.length).toFixed(1) : '0.0';

    // 标准差（不含无课天）
    const variance = nonEmptyDailyHours.length > 0 ? nonEmptyDailyHours.reduce((sum, h) => {
      const diff = h - Number(avgDailyHours);
      return sum + diff * diff;
    }, 0) / nonEmptyDailyHours.length : 0;
    const stdDev = Math.sqrt(variance).toFixed(1);

    // 一天最多上课时长（小时，按日总时长）
    const maxDayHours = nonEmptyDailyHours.length > 0 ? Math.max(...nonEmptyDailyHours).toFixed(1) : '0.0';
    const minDayHours = nonEmptyDailyHours.length > 0 ? Math.min(...nonEmptyDailyHours).toFixed(1) : '0.0';

    // 单节课程最长、最短、平均时长仍保留（可选）
    const maxEventMinutes = Math.max(...eventDurations);
    const minEventMinutes = Math.min(...eventDurations);
    const maxEventHours = (maxEventMinutes / 60).toFixed(2);
    const minEventHours = (minEventMinutes / 60).toFixed(2);

    // 时长分布（分成5个段：0-30, 30-60, 60-90, 90-120, 120+）
    const buckets = [{
      label: '0-30分钟',
      min: 0,
      max: 30,
      count: 0
    }, {
      label: '30-60分钟',
      min: 30,
      max: 60,
      count: 0
    }, {
      label: '60-90分钟',
      min: 60,
      max: 90,
      count: 0
    }, {
      label: '90-120分钟',
      min: 90,
      max: 120,
      count: 0
    }, {
      label: '120分钟+',
      min: 120,
      max: Infinity,
      count: 0
    }];
    eventDurations.forEach(duration => {
      const bucket = buckets.find(b => duration >= b.min && duration < b.max);
      if (bucket) bucket.count++;
    });
    return {
      totalEvents: filteredEvents.length,
      totalHours,
      avgDailyHours,
      avgEventHours,
      maxEventHours,
      minEventHours,
      maxDayHours,
      minDayHours,
      emptyDays,
      stdDev,
      dailyHours,
      activeDates,
      distributionBuckets: buckets
    };
  }, [events, dateList]);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex flex-col text-slate-800"
  }, /*#__PURE__*/React.createElement("header", {
    className: "bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between gap-3 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-600 p-2 rounded-xl shadow-lg flex items-center justify-center shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    className: "text-white"
  })), /*#__PURE__*/React.createElement("h1", {
    className: "text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap"
  }, "课表查看器")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-[11px] sm:text-xs font-bold text-slate-400 bg-slate-100 px-3 sm:px-4 py-2 rounded-full shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: `w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`
  }), loading ? '正在解密...' : '就绪')), /*#__PURE__*/React.createElement("main", {
    className: "flex-1 flex flex-col lg:flex-row p-3 sm:p-6 gap-3 sm:gap-6 overflow-hidden"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "w-full lg:w-80 space-y-3 sm:space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-slate-500 mb-2 block uppercase tracking-tighter"
  }, "访问口令"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: passphrase,
    onChange: e => setPassphrase(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none",
    placeholder: "请输入访问口令",
    autoComplete: "off"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-slate-500 mb-2 block uppercase tracking-tighter"
  }, "起始日期"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: startDate,
    onChange: e => setStartDate(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-xs font-bold text-slate-500 mb-2 block uppercase tracking-tighter"
  }, "天数"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: days,
    onChange: e => setDays(parseInt(e.target.value) || 1),
    className: "w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-slate-50 rounded-2xl space-y-2 border border-slate-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-slate-400 uppercase mb-2"
  }, "数据来源"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-slate-600"
  }, "GitHub 加密快照"), snapshotInfo && /*#__PURE__*/React.createElement("p", {
    className: "pt-2 text-[10px] font-bold text-slate-400"
  }, "快照更新于 ", new Date(snapshotInfo.updatedAt).toLocaleString('zh-CN')))), /*#__PURE__*/React.createElement("button", {
    onClick: handleCrawl,
    disabled: loading,
    className: "w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
  }, loading ? "正在解密..." : "加载课表"), /*#__PURE__*/React.createElement("button", {
    onClick: handleExportImage,
    disabled: loading || events.length === 0 || exporting,
    className: "w-full bg-white border-2 border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-600 font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-30"
  }, exporting ? "正在渲染..." : "保存高清课表图片"), error && /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100 text-[11px] font-bold leading-relaxed"
  }, "⚠️ ", error)), events.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bar-chart-3",
    className: "text-indigo-600"
  }), /*#__PURE__*/React.createElement("h2", {
    className: "text-sm font-black text-slate-900 uppercase tracking-tight"
  }, "上课时长统计")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-50 rounded-2xl p-3 border border-indigo-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "总课时"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-indigo-600"
  }, statistics.totalHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "小时")), /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-50 rounded-2xl p-3 border border-emerald-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "总课程数"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-emerald-600"
  }, statistics.totalEvents), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "节")), /*#__PURE__*/React.createElement("div", {
    className: "bg-blue-50 rounded-2xl p-3 border border-blue-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "平均（有课天）"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-blue-600"
  }, statistics.avgDailyHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "小时/天")), /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-50 rounded-2xl p-3 border border-rose-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "日课时标准差"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-rose-600"
  }, statistics.stdDev), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "小时"))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-2xl p-3 border border-slate-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "无课天数"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-slate-800"
  }, statistics.emptyDays), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "天")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-2xl p-3 border border-slate-100"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 mb-1 uppercase"
  }, "一天最多"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black text-slate-700"
  }, statistics.maxDayHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 mt-1"
  }, "小时"))), /*#__PURE__*/React.createElement("div", {
    className: "pt-3 border-t border-slate-100 space-y-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase"
  }, "每日课程时长（有课天）"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-2 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-lg p-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-500 font-bold mb-0.5"
  }, "最长"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black text-slate-700"
  }, statistics.maxDayHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-400"
  }, "小时")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-lg p-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-500 font-bold mb-0.5"
  }, "最短"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black text-slate-700"
  }, statistics.minDayHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-400"
  }, "小时")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-lg p-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-500 font-bold mb-0.5"
  }, "平均"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black text-slate-700"
  }, statistics.avgDailyHours), /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-400"
  }, "小时")))), /*#__PURE__*/React.createElement("div", {
    className: "pt-3 border-t border-slate-100 space-y-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase mb-2"
  }, "时长分布"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, statistics.distributionBuckets.map((bucket, idx) => {
    const percentage = bucket.count / statistics.totalEvents * 100;
    const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500'];
    return /*#__PURE__*/React.createElement("div", {
      key: idx,
      className: "space-y-0.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] font-bold text-slate-600"
    }, bucket.label), /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] font-black text-slate-500"
    }, bucket.count, "节")), /*#__PURE__*/React.createElement("div", {
      className: "w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: `h-full ${colors[idx]} transition-all`,
      style: {
        width: `${percentage}%`
      }
    })));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pt-3 border-t border-slate-100 space-y-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase"
  }, "每日课时明细"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1 max-h-28 overflow-y-auto"
  }, statistics.activeDates.map((date, idx) => {
    const d = new Date(date);
    const dayName = d.toLocaleDateString('zh-CN', {
      weekday: 'short'
    });
    const hours = statistics.dailyHours[idx] || '0';
    return /*#__PURE__*/React.createElement("div", {
      key: date,
      className: "flex items-center justify-between text-[9px] p-2 bg-slate-50 rounded-lg"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-600"
    }, dayName, " ", d.getDate(), "日"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-indigo-600"
    }, hours, "h"));
  }))))), /*#__PURE__*/React.createElement("section", {
    ref: containerRef,
    className: "flex-1 overflow-auto rounded-3xl border border-slate-200 bg-white shadow-sm flex flex-col h-[72dvh] lg:h-auto lg:max-h-[calc(100vh-160px)]"
  }, /*#__PURE__*/React.createElement("div", {
    ref: calendarRef,
    className: "calendar-grid min-w-[900px] flex-1 bg-white relative",
    style: {
      "--days": days
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-16 bg-slate-50 border-b border-r border-slate-200 flex items-center justify-center sticky top-0 z-30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    className: "text-slate-300"
  })), dateList.map(date => {
    const d = new Date(date);
    return /*#__PURE__*/React.createElement("div", {
      key: date,
      className: "h-16 border-b border-r border-slate-200 flex flex-col items-center justify-center sticky top-0 z-30 bg-slate-50"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black text-slate-400 uppercase tracking-tighter"
    }, d.toLocaleDateString('zh-CN', {
      weekday: 'short'
    })), /*#__PURE__*/React.createElement("span", {
      className: "text-lg font-black text-slate-800"
    }, d.getDate()));
  }), /*#__PURE__*/React.createElement("div", {
    className: "contents"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50/50 border-r border-slate-200"
  }, timeLabels.map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    className: "h-20 border-b border-slate-100 flex items-start justify-center pt-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-300"
  }, h, ":00")))), dateList.map(date => /*#__PURE__*/React.createElement("div", {
    key: date,
    className: "relative border-r border-slate-100 h-full"
  }, timeLabels.map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    className: "h-20 border-b border-slate-100/50"
  })), events.filter(e => e.date === date).map((event, idx) => {
    const [h1, m1] = event.start.split(':').map(Number);
    const [h2, m2] = event.end.split(':').map(Number);
    const top = (h1 - 8) * 80 + m1 / 60 * 80;
    const height = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60 * 80;
    const isNonStat = !!(event.title && /休息|教研/.test(event.title));
    const cardClassName = isNonStat ? 'event-card absolute inset-x-1.5 rounded-2xl p-3 text-xs shadow-md border-l-4 border-slate-400 bg-slate-100 z-10 transition-all' : 'event-card absolute inset-x-1.5 rounded-2xl p-3 text-xs shadow-md border-l-4 border-indigo-500 bg-white z-10 transition-all';
    const titleClassName = isNonStat ? 'event-title font-black text-slate-500 leading-tight mb-1 break-words' : 'event-title font-black text-slate-900 leading-tight mb-1 break-words';
    const badgeClassName = isNonStat ? 'mt-2 text-[9px] font-bold uppercase text-slate-500 bg-slate-200 w-fit px-2 py-0.5 rounded-full' : 'mt-2 text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50 w-fit px-2 py-0.5 rounded-full';
    return /*#__PURE__*/React.createElement("div", {
      key: `${date}-${idx}`,
      className: cardClassName,
      style: {
        top: `${top}px`,
        height: `${height}px`
      }
    }, /*#__PURE__*/React.createElement("p", {
      className: titleClassName
    }, event.title), isNonStat && /*#__PURE__*/React.createElement("div", {
      className: "mb-1 text-[9px] font-black uppercase tracking-wide text-slate-400"
    }, "说明项"), /*#__PURE__*/React.createElement("div", {
      className: badgeClassName
    }, event.teacher));
  }))))))));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));
