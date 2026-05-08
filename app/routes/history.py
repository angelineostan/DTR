from flask import Blueprint, render_template, Response, g
from app.auth_decorator import login_required
from firebase_admin import firestore
import csv
import io
import datetime

history_bp = Blueprint('history', __name__)

@history_bp.route('/history')
@login_required
def history():
    return render_template('history.html')

@history_bp.route('/api/history/export_csv', methods=['GET'])
@login_required
def export_csv():
    user_id = g.user['uid']
    db = firestore.client()
    
    docs = db.collection('attendance').where('user_id', '==', user_id).stream()
    
    history = []
    for doc in docs:
        data = doc.to_dict()
        history.append(data)
        
    history.sort(key=lambda x: x.get('date', ''), reverse=True)
    
    # Generate CSV
    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(['Date', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Total Hours (Raw MS)'])
    
    for record in history:
        # Time calculations
        total_ms = 0
        if record.get('time_in_am') and record.get('time_out_am'):
            total_ms += (record['time_out_am'].timestamp() - record['time_in_am'].timestamp()) * 1000
        if record.get('time_in_pm') and record.get('time_out_pm'):
            total_ms += (record['time_out_pm'].timestamp() - record['time_in_pm'].timestamp()) * 1000
            
        def format_time(ts):
            if not ts: return ''
            # ts is a google.cloud.firestore_v1._helpers.DatetimeWithNanoseconds
            # we need to ensure we format it to local or just string
            return ts.strftime('%I:%M %p')
            
        cw.writerow([
            record.get('date', ''),
            record.get('status', 'present'),
            format_time(record.get('time_in_am')),
            format_time(record.get('time_out_am')),
            format_time(record.get('time_in_pm')),
            format_time(record.get('time_out_pm')),
            total_ms
        ])
        
    output = si.getvalue()
    
    filename = f"attendance_history_{datetime.datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )
