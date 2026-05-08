let monitoringRecords = [];
let currentWeek = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchMonitoringData();

    // Export PDF listener
    const exportBtn = document.getElementById('btn-export-pdf');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportMonitoringPDF();
        });
    }
});

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

// Format short date "Oct 24, Tue"
function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) return dateStr;
    const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dStr}<br><span class="text-xs text-indigo-400 mt-1">${day}</span>`;
}

async function fetchMonitoringData(week = null) {
    const tbody = document.getElementById('monitoring-tbody');
    const loading = document.getElementById('monitoring-loading');
    const empty = document.getElementById('monitoring-empty');
    const label = document.getElementById('week-label');

    if (!tbody || !loading || !empty || !label) return;

    tbody.innerHTML = '';
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    let url = '/api/monitoring/data';
    if (week !== null) {
        url += `?week=${week}`;
    }

    try {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();

            monitoringRecords = data.records || [];
            currentWeek = data.current_week;

            // Format labels
            const sdParts = (data.start_date || '').split('-');
            let startLabel = data.start_date;
            if (sdParts.length === 3) startLabel = new Date(sdParts[0], sdParts[1] - 1, sdParts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const edParts = (data.end_date || '').split('-');
            let endLabel = data.end_date;
            if (edParts.length === 3) endLabel = new Date(edParts[0], edParts[1] - 1, edParts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            label.innerText = `Week ${currentWeek} (${startLabel} - ${endLabel})`;
            loading.classList.add('hidden');

            setupPagination(data.current_week, data.is_latest);

            if (monitoringRecords.length === 0) {
                empty.classList.remove('hidden');
                return;
            }

            monitoringRecords.forEach((record, index) => {
                const tr = document.createElement('tr');
                tr.className = "border-b border-white/5 light-mode:border-black/5 transition-colors";

                const dateDisplay = formatShortDate(record.date);

                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap align-top text-gray-300 light-mode:text-gray-700 font-medium">${dateDisplay}</td>
                    <td class="px-6 py-4 align-top">
                        <textarea id="task-${index}" class="w-full bg-white/5 light-mode:bg-black/5 border border-white/10 light-mode:border-black/10 rounded-lg p-2 text-sm text-gray-300 light-mode:text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[80px]" placeholder="Enter tasks...">${record.task || ''}</textarea>
                    </td>
                    <td class="px-6 py-4 align-top">
                        <textarea id="skills-${index}" class="w-full bg-white/5 light-mode:bg-black/5 border border-white/10 light-mode:border-black/10 rounded-lg p-2 text-sm text-gray-300 light-mode:text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[80px]" placeholder="Enter skills applied...">${record.skills || ''}</textarea>
                    </td>
                    <td class="px-6 py-4 align-top">
                        <textarea id="challenges-${index}" class="w-full bg-white/5 light-mode:bg-black/5 border border-white/10 light-mode:border-black/10 rounded-lg p-2 text-sm text-gray-300 light-mode:text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[80px]" placeholder="Enter challenges...">${record.challenges || ''}</textarea>
                    </td>
                    <td class="px-6 py-4 text-center align-middle">
                        <button onclick="saveMonitoringRecord('${record.date}', ${index})" class="text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all w-full flex justify-center items-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                            </svg>
                            Save
                        </button>
                        <div id="save-msg-${index}" class="text-[10px] mt-2 opacity-0 transition-opacity text-emerald-400">Saved!</div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } else {
            const errBody = await response.text();
            console.error("Failed to load monitoring data:", errBody);
            loading.classList.add('hidden');
            empty.classList.remove('hidden');
            document.getElementById('monitoring-empty-text').innerHTML = `Error: <br>${errBody}`;
        }
    } catch (error) {
        console.error('Error fetching monitoring data:', error);
        loading.classList.add('hidden');
        empty.classList.remove('hidden');
        document.getElementById('monitoring-empty-text').innerText = 'Network Error';
    }
}

async function saveMonitoringRecord(dateStr, index) {
    const taskEl = document.getElementById(`task-${index}`);
    const skillsEl = document.getElementById(`skills-${index}`);
    const challengesEl = document.getElementById(`challenges-${index}`);
    const msgEl = document.getElementById(`save-msg-${index}`);

    if (!taskEl || !skillsEl || !challengesEl) return;

    const payload = {
        date: dateStr,
        task: taskEl.value.trim(),
        skills: skillsEl.value.trim(),
        challenges: challengesEl.value.trim()
    };

    try {
        const response = await fetch('/api/monitoring/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Update local memory
            monitoringRecords[index].task = payload.task;
            monitoringRecords[index].skills = payload.skills;
            monitoringRecords[index].challenges = payload.challenges;

            // Show flash message
            msgEl.classList.remove('opacity-0');
            setTimeout(() => {
                msgEl.classList.add('opacity-0');
            }, 2000);
        } else {
            alert("Failed to save record.");
        }
    } catch (e) {
        console.error("Save error:", e);
        alert("Network error trying to save.");
    }
}


function setupPagination(currentWeek, isLatest) {
    const btnPrev = document.getElementById('btn-prev-week');
    const btnNext = document.getElementById('btn-next-week');

    if (!btnPrev || !btnNext) return;

    // Reset old listeners by replacing elements to avoid duplicates
    const newPrev = btnPrev.cloneNode(true);
    const newNext = btnNext.cloneNode(true);
    btnPrev.parentNode.replaceChild(newPrev, btnPrev);
    btnNext.parentNode.replaceChild(newNext, btnNext);

    // Disable prev if week is 1
    if (currentWeek <= 1) {
        newPrev.disabled = true;
    } else {
        newPrev.disabled = false;
        newPrev.addEventListener('click', () => fetchMonitoringData(currentWeek - 1));
    }

    // Disable next if latest week
    if (isLatest) {
        newNext.disabled = true;
    } else {
        newNext.disabled = false;
        newNext.addEventListener('click', () => fetchMonitoringData(currentWeek + 1));
    }
}


function exportMonitoringPDF() {
    if (monitoringRecords.length === 0) {
        alert('No records to export.');
        return;
    }

    let tableRows = '';

    monitoringRecords.forEach(r => {
        const dateParts = (r.date || '').split('-');
        let dateFormatted = r.date || '';
        let weekday = '';
        if (dateParts.length === 3) {
            const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
        }

        // Escape HTML for text areas
        const escapeHTML = str => str ? str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        ) : '';

        // Convert newlines to br tags
        const fmtTask = escapeHTML(r.task).replace(/\n/g, '<br>');
        const fmtSkills = escapeHTML(r.skills).replace(/\n/g, '<br>');
        const fmtChal = escapeHTML(r.challenges).replace(/\n/g, '<br>');

        tableRows += `
            <tr>
                <td style="white-space: nowrap"><strong>${dateFormatted}</strong><br><span style="color:#6b7280; font-size:11px">${weekday}</span></td>
                <td>${fmtTask || '--'}</td>
                <td>${fmtSkills || '--'}</td>
                <td>${fmtChal || '--'}</td>
            </tr>
        `;
    });

    const weekLabelText = document.getElementById('week-label') ? document.getElementById('week-label').innerText : '';

    const printWin = window.open('', '_blank', 'width=1000,height=700');
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Weekly Monitoring ${weekLabelText}</title>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #111; }
                h1 { font-size: 20px; margin-bottom: 4px; }
                .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
                td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
                tr:last-child td { border-bottom: none; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <h1>Weekly Monitoring ${weekLabelText ? '- ' + weekLabelText : ''}</h1>
            <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <table>
                <thead>
                    <tr>
                        <th style="width: 15%">Date</th>
                        <th style="width: 25%">Task/Activity</th>
                        <th style="width: 30%">Skills/Knowledge Applied</th>
                        <th style="width: 30%">Challenges Encountered</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.onload = () => {
        printWin.print();
    };
}
