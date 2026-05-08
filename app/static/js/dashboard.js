document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardStats(true);
    // Refresh every 60s for real-time feel
    setInterval(() => fetchDashboardStats().catch(() => { }), 60000);
});

function formatHours(decimalHours) {
    if (!decimalHours) return "0h 0m";
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    return `${h}h ${m}m`;
}

let currentBarWeek = '';
let currentTrendWeek = '';
let isFirstLoad = true;

// Data for sub-filtering
let currentTrendFilter = 'overview';
let globalTrendData = [];
let globalRequiredPerDay = 8;

async function fetchDashboardStats(initFilters = false) {
    try {
        let url = '/api/dashboard/stats?';
        if (currentBarWeek) url += `bar_week=${currentBarWeek}&`;
        if (currentTrendWeek) url += `trend_week=${currentTrendWeek}&`;

        const response = await fetch(url);
        if (!response.ok) return;
        const d = await response.json();

        // Setup filters on first load
        if (initFilters || isFirstLoad) {
            const barSelect = document.getElementById('bar-week-select');
            const trendSelect = document.getElementById('trend-week-select');
            if (d.available_weeks) {
                const optionsHtml = d.available_weeks.map(w => {
                    const parts = w.split('-');
                    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    const endDateObj = new Date(dateObj);
                    endDateObj.setDate(endDateObj.getDate() + 6);

                    const options = { month: 'short', day: 'numeric' };
                    const label = `${dateObj.toLocaleDateString(undefined, options)} - ${endDateObj.toLocaleDateString(undefined, options)}`;
                    return `<option value="${w}">${label}</option>`;
                }).join('');

                if (barSelect) {
                    barSelect.innerHTML = optionsHtml;
                    barSelect.value = d.bar_week;
                    currentBarWeek = d.bar_week;
                }
                if (trendSelect) {
                    trendSelect.innerHTML = optionsHtml;
                    trendSelect.value = d.trend_week;
                    currentTrendWeek = d.trend_week;
                }
            }
            isFirstLoad = false;
        }

        // Stat cards
        const statTodayEl = document.getElementById('stat-today-hours');
        const clockingBadge = document.getElementById('clocking-badge');

        // Clear any existing intervals
        if (window.stopwatchInterval) clearInterval(window.stopwatchInterval);

        const formatStopwatch = (totalMs) => {
            const totalSecs = Math.floor(totalMs / 1000);
            const hours = Math.floor(totalSecs / 3600);
            const minutes = Math.floor((totalSecs % 3600) / 60);
            const seconds = totalSecs % 60;
            return `${hours}h ${minutes}m ${seconds}s`;
        };

        if (d.is_clocked_in && d.active_session_start) {
            if (clockingBadge) clockingBadge.style.display = 'flex';
            const startTime = new Date(d.active_session_start).getTime();

            // Set initial
            const initialNow = new Date().getTime();
            if (statTodayEl) statTodayEl.textContent = formatStopwatch((d.today_ms || 0) + (initialNow - startTime));

            window.stopwatchInterval = setInterval(() => {
                const now = new Date().getTime();
                const elapsedMs = now - startTime;
                const totalMs = (d.today_ms || 0) + elapsedMs;
                if (statTodayEl) statTodayEl.textContent = formatStopwatch(totalMs);
            }, 1000);

        } else {
            if (clockingBadge) clockingBadge.style.display = 'none';
            if (statTodayEl) statTodayEl.textContent = formatStopwatch(d.today_ms || 0);
        }

        const statDaysEl = document.getElementById('stat-days-present');
        if (statDaysEl) statDaysEl.textContent = d.days_present;

        // Target chart
        const pct = d.percentage;
        const arcLength = 125.6;
        const offset = arcLength - (arcLength * pct / 100);
        const progressArc = document.getElementById('progress-arc');
        if (progressArc) progressArc.setAttribute('stroke-dashoffset', offset);

        const targetPctEl = document.getElementById('target-pct');
        if (targetPctEl) targetPctEl.textContent = pct + '%';

        const statusEl = document.getElementById('target-status');
        if (statusEl) {
            if (pct >= 100) {
                statusEl.textContent = 'Complete!';
                statusEl.className = 'text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1';
            } else if (pct >= 40) {
                statusEl.textContent = 'On Track';
                statusEl.className = 'text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1';
            } else {
                statusEl.textContent = 'Behind';
                statusEl.className = 'text-xs font-medium text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1';
            }
        }

        const targetMsgEl = document.getElementById('target-message');
        if (targetMsgEl) {
            targetMsgEl.textContent = `You've logged ${Math.round(d.total_hours)} hours so far, putting you ${pct >= 40 ? 'on track' : 'behind'} to meet your ${d.target_hours}-hour requirement!`;
        }

        const targetValEl = document.getElementById('target-val');
        if (targetValEl) targetValEl.textContent = d.target_hours + 'h';

        const loggedValEl = document.getElementById('logged-val');
        if (loggedValEl) loggedValEl.innerHTML = `${Math.round(d.total_hours)}h` +
            (pct >= 40 ? `<svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>` : '');

        const leftValEl = document.getElementById('left-val');
        if (leftValEl) leftValEl.textContent = Math.round(d.remaining_hours) + 'h';

        // Update charts
        globalTrendData = d.trend_chart_data;
        globalRequiredPerDay = d.required_per_day || 8;

        updateBarChart(d.bar_chart_data);
        updateTrendChart();

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function updateBarChart(chartData) {
    const barsContainer = document.getElementById('bars-container');
    if (!barsContainer) return;
    if (!chartData || chartData.length === 0) {
        barsContainer.innerHTML = '';
        return;
    }
    const maxBar = 12;

    barsContainer.innerHTML = '';
    chartData.forEach(item => {
        const pctBar = Math.min(100, (item.hours / maxBar) * 100);
        const barHtml = `
            <div class="relative w-full h-full flex flex-col justify-end items-center group">
                <div class="w-full max-w-[24px] xl:max-w-[40px] bg-blue-600 rounded-t-sm transition-all hover:bg-blue-500"
                    style="height: ${Math.max(pctBar, item.hours > 0 ? 3 : 0)}%;" title="${formatHours(item.hours)}"></div>
                <span class="text-[10px] sm:text-xs text-gray-500 light-mode:text-slate-400 mt-2 absolute -bottom-6">${item.label}</span>
            </div>
        `;
        barsContainer.innerHTML += barHtml;
    });
}

function updateTrendChart() {
    if (!globalTrendData || globalTrendData.length === 0) return;
    const maxBar = 12;
    const count = globalTrendData.length;
    const xPositions = globalTrendData.map((_, i) => ((i + 0.5) / count) * 100);

    const overviewPoints = [];
    const regularPoints = [];
    const overtimePoints = [];

    globalTrendData.forEach((item, i) => {
        const yOver = 100 - Math.min(100, (item.hours / maxBar) * 100);
        overviewPoints.push(`${xPositions[i]},${yOver}`);

        const regHours = Math.min(item.hours, globalRequiredPerDay);
        const yReg = 100 - Math.min(100, (regHours / maxBar) * 100);
        regularPoints.push(`${xPositions[i]},${yReg}`);

        const otHours = Math.max(0, item.hours - globalRequiredPerDay);
        const yOt = 100 - Math.min(100, (otHours / maxBar) * 100);
        overtimePoints.push(`${xPositions[i]},${yOt}`);
    });

    const polyOverview = document.getElementById('poly-overview');
    if (polyOverview) {
        polyOverview.setAttribute('points', currentTrendFilter === 'overview' ? overviewPoints.join(' ') : '');
    }

    const polyRegular = document.getElementById('poly-regular');
    if (polyRegular) {
        polyRegular.setAttribute('points', currentTrendFilter === 'regular' ? regularPoints.join(' ') : '');
    }

    const polyOvertime = document.getElementById('poly-overtime');
    if (polyOvertime) {
        polyOvertime.setAttribute('points', currentTrendFilter === 'overtime' ? overtimePoints.join(' ') : '');
    }

    const gradEl = document.getElementById('trend-gradient');
    if (gradEl) {
        const clipPoints = globalTrendData.map((item, i) => {
            let hours = item.hours;
            if (currentTrendFilter === 'regular') hours = Math.min(item.hours, globalRequiredPerDay);
            if (currentTrendFilter === 'overtime') hours = Math.max(0, item.hours - globalRequiredPerDay);
            const yPct = 100 - Math.min(100, (hours / maxBar) * 100);
            return `${xPositions[i]}% ${yPct}%`;
        });
        gradEl.style.clipPath = `polygon(${clipPoints.join(', ')}, 100% 100%, 0% 100%)`;
    }

    const xLabelsContainer = document.getElementById('trend-x-labels');
    if (xLabelsContainer) {
        xLabelsContainer.innerHTML = globalTrendData.map(item =>
            `<span>${item.label}</span>`
        ).join('');
    }

    const tooltipsContainer = document.getElementById('trend-tooltips');
    if (tooltipsContainer) {
        tooltipsContainer.innerHTML = globalTrendData.map((item, i) => {
            const reg = Math.min(item.hours, globalRequiredPerDay);
            const ot = Math.max(0, item.hours - globalRequiredPerDay);
            const tooltipPosClass = i < 3 ? 'left-1/2 -translate-x-1/2' : (i > 4 ? 'right-0' : 'left-1/2 -translate-x-1/2');

            let activeHours = item.hours;
            let dotColorClass = 'bg-blue-500 border-navy-900 light-mode:border-white shadow-[0_0_8px_rgba(59,130,246,0.6)]';
            if (currentTrendFilter === 'regular') {
                activeHours = reg;
                dotColorClass = 'bg-emerald-500 border-navy-900 light-mode:border-white shadow-[0_0_8px_rgba(16,185,129,0.6)]';
            } else if (currentTrendFilter === 'overtime') {
                activeHours = ot;
                dotColorClass = 'bg-amber-500 border-navy-900 light-mode:border-white shadow-[0_0_8px_rgba(245,158,11,0.6)]';
            }

            const yPos = 100 - Math.min(100, (activeHours / maxBar) * 100);

            return `
                <div class="relative group z-20 cursor-crosshair flex-1 h-full flex justify-center">
                    <div class="absolute hidden group-hover:block bottom-full mb-1 ${tooltipPosClass} w-max bg-navy-900 light-mode:bg-white text-white light-mode:text-slate-800 text-xs rounded shadow-xl p-2.5 border border-white/10 light-mode:border-slate-200 z-30 pointer-events-none transition-all">
                        <div class="font-bold mb-1.5 border-b border-white/10 light-mode:border-slate-100 pb-1.5">${item.label}</div>
                        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.8)]"></span> <span class="text-gray-400 light-mode:text-slate-500">Total:</span> <span class="font-medium ml-auto">${formatHours(item.hours)}</span></div>
                        <div class="flex items-center gap-2 mt-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]"></span> <span class="text-gray-400 light-mode:text-slate-500">Regular:</span> <span class="font-medium ml-auto">${formatHours(reg)}</span></div>
                        <div class="flex items-center gap-2 mt-1.5"><span class="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.8)]"></span> <span class="text-gray-400 light-mode:text-slate-500">Overtime:</span> <span class="font-medium ml-auto">${formatHours(ot)}</span></div>
                    </div>
                    <div class="absolute top-0 bottom-0 w-[1px] bg-white/20 light-mode:bg-black/10 hidden group-hover:block pointer-events-none transition-all"></div>
                    <div class="absolute w-2.5 h-2.5 rounded-full border-2 block pointer-events-none z-10 transition-all duration-300 ${dotColorClass}" style="top: ${yPos}%;"></div>
                </div>
            `;
        }).join('');
    }
}

function setTrendFilter(filter) {
    currentTrendFilter = filter;

    // Update button styles
    ['overview', 'regular', 'overtime'].forEach(f => {
        const btn = document.getElementById(`trend-btn-${f}`);
        if (btn) {
            if (f === filter) {
                btn.className = 'px-3 py-1 text-xs font-semibold rounded-sm bg-blue-600 text-white shadow-sm';
            } else {
                btn.className = 'px-3 py-1 text-xs font-medium text-gray-400 light-mode:text-slate-500 hover:text-white light-mode:hover:text-slate-800 transition-colors rounded-sm';
            }
        }
    });

    updateTrendChart();
}

// Make functions available globally so inline onclick handlers in HTML continue to work
window.setBarWeek = function (weekStr) {
    currentBarWeek = weekStr;
    fetchDashboardStats();
};

window.setTrendWeek = function (weekStr) {
    currentTrendWeek = weekStr;
    fetchDashboardStats();
};

window.setTrendFilter = setTrendFilter;
