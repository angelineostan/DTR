let historyRecords = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchTimelineData();

    const exportBtn = document.getElementById('btn-export-pdf');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportHistoryPDF();
        });
    }
});

function exportHistoryPDF() {
    if (historyRecords.length === 0) {
        alert('No records to export.');
        return;
    }

    let grandTotalMs = 0;
    let tableRows = '';

    historyRecords.forEach(r => {
        let rowMs = 0;
        if (r.time_in_am && r.time_out_am) rowMs += new Date(r.time_out_am) - new Date(r.time_in_am);
        if (r.time_in_pm && r.time_out_pm) rowMs += new Date(r.time_out_pm) - new Date(r.time_in_pm);
        grandTotalMs += Math.max(0, rowMs);

        const rowMins = Math.floor(Math.max(0, rowMs) / 60000);
        const rowHoursStr = rowMs > 0 ? `${Math.floor(rowMins / 60)}h ${rowMins % 60}m` : '--';

        const dateParts = (r.date || '').split('-');
        let dateFormatted = r.date || '';
        if (dateParts.length === 3) {
            const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        tableRows += `
            <tr>
                <td>${dateFormatted}</td>
                <td>${formatIsoTime(r.time_in_am)}</td>
                <td>${formatIsoTime(r.time_out_am)}</td>
                <td>${formatIsoTime(r.time_in_pm)}</td>
                <td>${formatIsoTime(r.time_out_pm)}</td>
                <td style="text-align:right;font-weight:600">${rowHoursStr}</td>
            </tr>
        `;
    });

    const totalMins = Math.floor(grandTotalMs / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const totalRemMins = totalMins % 60;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Attendance History</title>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #111; }
                h1 { font-size: 20px; margin-bottom: 4px; }
                .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
                td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
                tr:last-child td { border-bottom: none; }
                .total-section { margin-top: 20px; padding-top: 16px; border-top: 2px solid #e5e7eb; text-align: right; }
                .total-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
                .total-value { font-size: 22px; font-weight: 700; color: #4f46e5; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Attendance History</h1>
            <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>AM In</th>
                        <th>AM Out</th>
                        <th>PM In</th>
                        <th>PM Out</th>
                        <th style="text-align:right">Hours</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="total-section">
                <p class="total-label">Total Hours Rendered</p>
                <p class="total-value">${totalHours}h ${totalRemMins}m</p>
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.onload = () => {
        printWin.print();
    };
}

// Format date string nicely e.g "Oct 24, 2023 - Tuesday"
function formatLongDate(dateStr) {
    if (!dateStr) return '';
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) return dateStr;
    const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const options = { month: 'short', day: 'numeric', year: 'numeric', weekday: 'long' };
    const formatted = date.toLocaleDateString('en-US', options);
    const split = formatted.split(',');
    if (split.length >= 3) {
        const weekday = split[0];
        const md = split[1].trim();
        const yr = split[2].trim();
        return `${md}, ${yr} - ${weekday}`;
    }
    return dateStr;
}

// Format time
function formatIsoTime(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function fetchTimelineData() {
    const container = document.getElementById('timeline-container');
    const loading = document.getElementById('timeline-loading');
    const empty = document.getElementById('timeline-empty');

    if (!container || !loading || !empty) return;

    try {
        const response = await fetch('/api/attendance/history?all=true');
        if (response.ok) {
            const result = await response.json();
            const data = result.records || result; // Handle both new and old formats just in case
            historyRecords = data;
            loading.classList.add('hidden');

            if (data.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            let html = '';
            data.forEach(record => {
                const amIn = formatIsoTime(record.time_in_am);
                const amOut = formatIsoTime(record.time_out_am);
                const pmIn = formatIsoTime(record.time_in_pm);
                const pmOut = formatIsoTime(record.time_out_pm);

                // Calculate hours rendered
                let rowMs = 0;
                if (record.time_in_am && record.time_out_am) rowMs += new Date(record.time_out_am) - new Date(record.time_in_am);
                if (record.time_in_pm && record.time_out_pm) rowMs += new Date(record.time_out_pm) - new Date(record.time_in_pm);
                const rowMins = Math.floor(Math.max(0, rowMs) / 60000);
                const hoursStr = rowMs > 0 ? `${Math.floor(rowMins / 60)}h ${rowMins % 60}m` : '--';

                let badgeHtml = '';
                let iconBg = '';
                let iconColor = '';
                let cardBorder = '';
                let cardBg = '';
                let iconSvg = '';

                if (record.status === 'present') {
                    badgeHtml = `<span class="text-xs font-medium bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">Present</span>`;
                    iconBg = 'bg-emerald-500/20'; iconColor = 'text-emerald-400';
                    cardBorder = 'border-white/5 light-mode:border-black/5 hover:bg-white/5 light-mode:hover:bg-black/5';
                    cardBg = 'glass-card';
                    iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>`;
                } else if (record.status === 'holiday') {
                    badgeHtml = `<span class="text-xs font-medium bg-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full">Holiday</span>`;
                    iconBg = 'bg-purple-500/20'; iconColor = 'text-purple-400';
                    cardBorder = 'border-purple-500/30 hover:bg-purple-500/5';
                    cardBg = 'glass-card';
                    iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>`;
                } else if (record.status && record.status.includes('half_day')) {
                    badgeHtml = `<span class="text-xs font-medium bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded-full">Half Day</span>`;
                    iconBg = 'bg-yellow-500/20'; iconColor = 'text-yellow-400';
                    cardBorder = 'border-white/5 light-mode:border-black/5 hover:bg-white/5 light-mode:hover:bg-black/5';
                    cardBg = 'glass-card';
                    iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>`;
                } else if (record.status === 'no_duty') {
                    badgeHtml = `<span class="text-xs font-medium bg-red-500/20 text-red-400 px-2.5 py-1 rounded-full">Full Leave</span>`;
                    iconBg = 'bg-red-500/20'; iconColor = 'text-red-400';
                    cardBorder = 'border-red-500/10 light-mode:border-red-500/20 border-red-500/5';
                    cardBg = 'bg-red-500/5';
                    iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>`;
                } else {
                    badgeHtml = `<span class="text-xs font-medium bg-gray-500/20 text-gray-400 px-2.5 py-1 rounded-full">${record.status || 'N/A'}</span>`;
                    iconBg = 'bg-gray-500/20'; iconColor = 'text-gray-400';
                    cardBorder = 'border-white/5 light-mode:border-black/5';
                    cardBg = 'glass-card';
                    iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"></path>`;
                }

                // Format Time strings
                const amInHtml = record.time_in_am ? `<span class="text-indigo-400">${amIn}</span>` : amIn;
                const amOutHtml = record.time_out_am ? `<span class="text-indigo-400">${amOut}</span>` : amOut;
                const pmInHtml = record.time_in_pm ? `<span class="text-indigo-400">${pmIn}</span>` : pmIn;
                const pmOutHtml = record.time_out_pm ? `<span class="text-indigo-400">${pmOut}</span>` : pmOut;

                html += `
                    <div class="relative flex items-start gap-6">
                        <div class="w-10 h-10 rounded-full ${iconBg} ${iconColor} border border-[currentColor]/30 flex items-center justify-center shrink-0 z-10 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                ${iconSvg}
                            </svg>
                        </div>
                        <div class="flex-1 ${cardBg} p-5 rounded-xl border ${cardBorder} transition-colors">
                            <div class="flex justify-between items-start flex-wrap gap-2 mb-2">
                                <h3 class="font-semibold text-white light-mode:text-gray-900">${formatLongDate(record.date)}</h3>
                                <div class="flex items-center gap-2">
                                    ${badgeHtml}
                                    <span class="text-xs font-semibold text-indigo-400 bg-indigo-400/10 px-2.5 py-1 rounded-full">${hoursStr}</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 mt-4 text-sm">
                                <div>
                                    <p class="text-gray-500 font-medium mb-1">AM Shift</p>
                                    <p class="text-gray-300 light-mode:text-gray-700 leading-relaxed">In: ${amInHtml} <br> Out: ${amOutHtml}</p>
                                </div>
                                <div>
                                    <p class="text-gray-500 font-medium mb-1">PM Shift</p>
                                    <p class="text-gray-300 light-mode:text-gray-700 leading-relaxed">In: ${pmInHtml} <br> Out: ${pmOutHtml}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        } else {
            const errBody = await response.text();
            console.error('Failed to fetch timeline, status:', response.status, errBody);
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            empty.innerHTML = `<div class="text-red-400">Failed to load timeline</div>`;
        }
    } catch (error) {
        console.error('Network error loading history:', error);
        loading.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.innerHTML = `<div class="text-red-400">Network error fetching timeline</div>`;
    }
}
