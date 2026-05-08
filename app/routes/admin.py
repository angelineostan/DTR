from flask import Blueprint, render_template, jsonify, request, g
from app.auth_decorator import admin_required
from firebase_admin import firestore
import datetime
import csv
import io

PH_TZ = datetime.timezone(datetime.timedelta(hours=8))  # UTC+8

admin_bp = Blueprint('admin', __name__)

# ── Page Routes ─────────────────────────────────────────

@admin_bp.route('/admin')
@admin_required
def admin():
    return render_template('admin.html')

@admin_bp.route('/admin/attendance')
@admin_required
def admin_attendance():
    return render_template('admin_attendance.html')

@admin_bp.route('/admin/dtr_entry')
@admin_required
def admin_dtr_entry():
    return render_template('admin_dtr_entry.html')

@admin_bp.route('/admin/settings')
@admin_required
def admin_settings():
    return render_template('admin_settings.html')

# ── API: Dashboard Stats ────────────────────────────────

@admin_bp.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    db = firestore.client()
    
    users = list(db.collection('users').stream())
    total_users = len(users)
    
    all_attendance = list(db.collection('attendance').stream())
    total_records = len(all_attendance)
    
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    today_records = [r for r in all_attendance if r.to_dict().get('date') == today]
    active_today = len(set(r.to_dict().get('user_id') for r in today_records))
    
    admin_count = sum(1 for u in users if u.to_dict().get('is_admin', False))
    
    return jsonify({
        'total_users': total_users,
        'total_records': total_records,
        'active_today': active_today,
        'admin_count': admin_count
    })

# ── API: Settings ────────────────────────────────────────

@admin_bp.route('/api/admin/settings', methods=['GET'])
@admin_required
def get_settings():
    db = firestore.client()
    doc = db.collection('settings').document('global').get()
    if doc.exists:
        return jsonify(doc.to_dict())
    return jsonify({
        'required_hours': 8,
        'total_hours_needed': 500
    })

@admin_bp.route('/api/admin/settings', methods=['POST'])
@admin_required
def update_settings():
    db = firestore.client()
    data = request.get_json()
    required_hours = data.get('required_hours', 8)
    total_hours_needed = data.get('total_hours_needed', 500)
    
    db.collection('settings').document('global').set({
        'required_hours': required_hours,
        'total_hours_needed': total_hours_needed,
        'updated_at': datetime.datetime.now().isoformat(),
        'updated_by': g.user['uid']
    }, merge=True)
    
    return jsonify({'success': True, 'message': f'Settings saved — {required_hours}h/day, Total {total_hours_needed}h'})

# ── API: Manual DTR Entry ────────────────────────────────

@admin_bp.route('/api/admin/dtr/manual', methods=['POST'])
@admin_required
def manual_dtr_entry():
    db = firestore.client()
    data = request.get_json()
    
    user_id = data.get('user_id')
    date_str = data.get('date')
    
    if not user_id or not date_str:
        return jsonify({'error': 'User and date are required'}), 400
    
    # Build the attendance document
    doc_id = f"{user_id}_{date_str}"
    status = data.get('status', 'present')
    att_data = {
        'user_id': user_id,
        'date': date_str,
        'status': status,
        'entered_by_admin': g.user['uid']
    }
    
    if status == 'excused':
        user_doc = db.collection('users').document(user_id).get()
        s_in_am, s_out_am, s_in_pm, s_out_pm = '08:00', '12:00', '13:00', '17:00'
        schedule_type = 'split'
        if user_doc.exists:
            u_data = user_doc.to_dict()
            s_in_am = u_data.get('shift_in_am', '08:00')
            s_out_am = u_data.get('shift_out_am', '12:00')
            s_in_pm = u_data.get('shift_in_pm', '13:00')
            s_out_pm = u_data.get('shift_out_pm', '17:00')
            schedule_type = u_data.get('schedule_type', 'split')
            
        def build_excused_dt(time_str):
            try:
                return datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=PH_TZ)
            except ValueError:
                return None
                
        att_data['time_in_am'] = build_excused_dt(s_in_am)
        att_data['time_out_am'] = build_excused_dt(s_out_am)
        if schedule_type != 'continuous':
            att_data['time_in_pm'] = build_excused_dt(s_in_pm)
            att_data['time_out_pm'] = build_excused_dt(s_out_pm)
    else:
        # Convert manual time strings to datetimes
        for field, key in [('am_in', 'time_in_am'), ('am_out', 'time_out_am'), 
                           ('pm_in', 'time_in_pm'), ('pm_out', 'time_out_pm')]:
            time_val = data.get(field)
            if time_val:
                try:
                    dt = datetime.datetime.strptime(f"{date_str} {time_val}", "%Y-%m-%d %H:%M").replace(tzinfo=PH_TZ)
                    att_data[key] = dt
                except ValueError:
                    pass
    
    db.collection('attendance').document(doc_id).set(att_data, merge=True)
    
    return jsonify({'success': True, 'message': f'DTR entry for {date_str} saved successfully'})

# ── API: Bulk CSV Upload ─────────────────────────────────

@admin_bp.route('/api/admin/dtr/bulk', methods=['POST'])
@admin_required
def bulk_dtr_upload():
    db = firestore.client()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be a .csv'}), 400
    
    try:
        # Read CSV
        stream = io.StringIO(file.stream.read().decode('utf-8'))
        reader = csv.DictReader(stream)
        
        # Build a map of email -> uid for lookups
        users = list(db.collection('users').stream())
        email_to_uid = {}
        for u in users:
            ud = u.to_dict()
            email_to_uid[ud.get('email', '')] = u.id
        
        created = 0
        skipped = 0
        errors = []
        
        for row_num, row in enumerate(reader, start=2):
            email = row.get('user_email', '').strip()
            date_str = row.get('date', '').strip()
            
            if not email or not date_str:
                skipped += 1
                continue
            
            uid = email_to_uid.get(email)
            if not uid:
                errors.append(f"Row {row_num}: User '{email}' not found")
                skipped += 1
                continue
            
            doc_id = f"{uid}_{date_str}"
            att_data = {
                'user_id': uid,
                'date': date_str,
                'status': row.get('status', 'present').strip(),
                'entered_by_admin': g.user['uid']
            }
            
            for csv_col, db_key in [('am_in', 'time_in_am'), ('am_out', 'time_out_am'),
                                     ('pm_in', 'time_in_pm'), ('pm_out', 'time_out_pm')]:
                time_val = row.get(csv_col, '').strip()
                if time_val:
                    try:
                        dt = datetime.datetime.strptime(f"{date_str} {time_val}", "%Y-%m-%d %H:%M").replace(tzinfo=PH_TZ)
                        att_data[db_key] = dt
                    except ValueError:
                        pass
            
            db.collection('attendance').document(doc_id).set(att_data, merge=True)
            created += 1
        
        msg = f"Processed {created} records successfully."
        if skipped:
            msg += f" {skipped} skipped."
        if errors:
            msg += " Issues: " + "; ".join(errors[:5])
        
        return jsonify({'success': True, 'message': msg, 'created': created, 'skipped': skipped})
    
    except Exception as e:
        return jsonify({'error': f'Failed to process CSV: {str(e)}'}), 500
