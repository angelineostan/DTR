from flask import Blueprint, render_template, request, jsonify, g
from app.auth_decorator import login_required
from firebase_admin import firestore
import datetime

PH_TZ = datetime.timezone(datetime.timedelta(hours=8))

attendance_bp = Blueprint('attendance', __name__)

@attendance_bp.route('/attendance')
@login_required
def attendance():
    return render_template('attendance.html')

@attendance_bp.route('/api/attendance/today', methods=['GET'])
@login_required
def get_today_attendance():
    user_id = g.user['uid']
    today_str = datetime.datetime.now(PH_TZ).strftime('%Y-%m-%d')
    doc_id = f"{user_id}_{today_str}"
    db = firestore.client()
    
    # Check custom schedule parameters
    user_doc = db.collection('users').document(user_id).get()
    shift_in_am, shift_out_am, shift_in_pm, shift_out_pm = '08:00', '12:00', '13:00', '17:00'
    schedule_type = 'split'
    if user_doc.exists:
        u_data = user_doc.to_dict()
        shift_in_am = u_data.get('shift_in_am', '08:00')
        shift_out_am = u_data.get('shift_out_am', '12:00')
        shift_in_pm = u_data.get('shift_in_pm', '13:00')
        shift_out_pm = u_data.get('shift_out_pm', '17:00')
        schedule_type = u_data.get('schedule_type', 'split')
        
    doc_ref = db.collection('attendance').document(doc_id)
    doc = doc_ref.get()
    
    if doc.exists:
        data = doc.to_dict()
        # Convert Firestore timestamps to ISO formats for JSON serialization
        for key in ['time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm']:
            if data.get(key):
                data[key] = data[key].isoformat()
        data['shift_in_am'] = shift_in_am
        data['shift_out_am'] = shift_out_am
        data['shift_in_pm'] = shift_in_pm
        data['shift_out_pm'] = shift_out_pm
        data['schedule_type'] = schedule_type
        return jsonify(data)
    else:
        return jsonify({
            'user_id': user_id,
            'date': today_str,
            'status': 'present',
            'time_in_am': None,
            'time_out_am': None,
            'time_in_pm': None,
            'time_out_pm': None,
            'shift_in_am': shift_in_am,
            'shift_out_am': shift_out_am,
            'shift_in_pm': shift_in_pm,
            'shift_out_pm': shift_out_pm,
            'schedule_type': schedule_type
        })

@attendance_bp.route('/api/attendance/action', methods=['POST'])
@login_required
def attendance_action():
    req_data = request.json
    action = req_data.get('action') # 'in_am', 'out_am', 'in_pm', 'out_pm'
    
    if action not in ['in_am', 'out_am', 'in_pm', 'out_pm']:
        return jsonify({'error': 'Invalid action'}), 400
        
    user_id = g.user['uid']
    now = datetime.datetime.now(PH_TZ)
    if now.weekday() >= 5: # 5 is Saturday, 6 is Sunday
        return jsonify({'error': 'Cannot record attendance on weekends.'}), 400
        
    today_str = now.strftime('%Y-%m-%d')
    doc_id = f"{user_id}_{today_str}"
    
    db = firestore.client()
    doc_ref = db.collection('attendance').document(doc_id)
    
    # Check if doc exists to either create or update
    doc = doc_ref.get()
    update_field = f"time_{action}"
    
    if not doc.exists:
        # Create new document for today
        data = {
            'user_id': user_id,
            'date': today_str,
            'status': 'present',
            'time_in_am': None,
            'time_out_am': None,
            'time_in_pm': None,
            'time_out_pm': None,
            update_field: firestore.SERVER_TIMESTAMP
        }
        doc_ref.set(data)
    else:
        # Check if field is already set
        doc_data = doc.to_dict()
        if doc_data.get(update_field):
            return jsonify({'error': f'{update_field} is already recorded for today'}), 400
            
        doc_ref.update({
            update_field: firestore.SERVER_TIMESTAMP
        })
        
    return jsonify({'status': 'success', 'message': f'Recorded {update_field}'})

@attendance_bp.route('/api/attendance/status', methods=['POST'])
@login_required
def update_status():
    req_data = request.json
    status = req_data.get('status')
    
    valid_statuses = ['present', 'holiday', 'no_duty', 'half_day_am', 'half_day_pm', 'excused']
    if status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
        
    user_id = g.user['uid']
    now = datetime.datetime.now(PH_TZ)
    if now.weekday() >= 5:
        return jsonify({'error': 'Cannot update status on weekends.'}), 400
        
    today_str = now.strftime('%Y-%m-%d')
    doc_id = f"{user_id}_{today_str}"
    
    db = firestore.client()
    
    # Excused Fulfillment Block
    t_in_am_fill = t_out_am_fill = t_in_pm_fill = t_out_pm_fill = None
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
            
        def build_dt(time_str):
            try:
                h, m = map(int, time_str.split(':'))
                # Attach the current day and timezone
                return now.replace(hour=h, minute=m, second=0, microsecond=0)
            except:
                return None
                
        t_in_am_fill = build_dt(s_in_am)
        t_out_am_fill = build_dt(s_out_am)
        if schedule_type != 'continuous':
            t_in_pm_fill = build_dt(s_in_pm)
            t_out_pm_fill = build_dt(s_out_pm)

    doc_ref = db.collection('attendance').document(doc_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        data = {
            'user_id': user_id,
            'date': today_str,
            'status': status,
            'time_in_am': t_in_am_fill,
            'time_out_am': t_out_am_fill,
            'time_in_pm': t_in_pm_fill,
            'time_out_pm': t_out_pm_fill
        }
        doc_ref.set(data)
    else:
        updates = {'status': status}
        if status == 'excused':
            updates['time_in_am'] = t_in_am_fill
            updates['time_out_am'] = t_out_am_fill
            if schedule_type != 'continuous':
                updates['time_in_pm'] = t_in_pm_fill
                updates['time_out_pm'] = t_out_pm_fill
            
        doc_ref.update(updates)
        
    return jsonify({'status': 'success', 'message': f'Status updated to {status}'})

@attendance_bp.route('/api/attendance/history', methods=['GET'])
@login_required
def get_attendance_history():
    try:
        user_id = g.user['uid']
        db = firestore.client()
        
        # Anchor date: Feb 2, 2026 (Monday)
        anchor_date = datetime.date(2026, 2, 2)
        today = datetime.datetime.now(PH_TZ).date()
        
        # Calculate the latest possible week
        days_since_anchor = (today - anchor_date).days
        latest_week = max(1, (days_since_anchor // 7) + 1)
        
        # Get requested week from query params, default to latest week
        try:
            requested_week = int(request.args.get('week', latest_week))
        except ValueError:
            requested_week = latest_week
            
        requested_week = max(1, requested_week)
        
        fetch_all = request.args.get('all', 'false').lower() == 'true'
        
        # Calculate date range for the requested week
        start_date = anchor_date + datetime.timedelta(days=(requested_week - 1) * 7)
        end_date = start_date + datetime.timedelta(days=6)
        
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        # Fetch all records for user, then filter in Python to avoid composite index requirements
        docs = db.collection('attendance') \
                 .where('user_id', '==', user_id) \
                 .stream()
        
        history = []
        total_ms = 0
        
        for doc in docs:
            data = doc.to_dict()
            record_date_str = data.get('date')
            
            # Filter by date range manually unless fetching all
            if not fetch_all:
                if not record_date_str or record_date_str < start_date_str or record_date_str > end_date_str:
                    continue
                
            try:
                # Filter out weekends
                y, m, d = map(int, record_date_str.split('-'))
                record_date = datetime.date(y, m, d)
                if record_date.weekday() >= 5: # 5=Sat, 6=Sun
                    continue
            except ValueError:
                pass
                    
            # Calculate milliseconds for total safely
            row_ms = 0
            
            def parse_dt(dt_val):
                if not dt_val: return None
                if isinstance(dt_val, datetime.datetime):
                    return dt_val
                elif isinstance(dt_val, str):
                    try:
                        return datetime.datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                    except:
                        return None
                return None

            t_in_am = parse_dt(data.get('time_in_am'))
            t_out_am = parse_dt(data.get('time_out_am'))
            if t_in_am and t_out_am:
                row_ms += max(0, (t_out_am - t_in_am).total_seconds() * 1000)
                
            t_in_pm = parse_dt(data.get('time_in_pm'))
            t_out_pm = parse_dt(data.get('time_out_pm'))
            if t_in_pm and t_out_pm:
                row_ms += max(0, (t_out_pm - t_in_pm).total_seconds() * 1000)
                
            total_ms += int(row_ms)

            # Convert Firestore timestamps to ISO formats
            for key in ['time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm']:
                if data.get(key):
                    data[key] = data[key].isoformat()
            
            history.append(data)
            
        # Sort history by date descending (newest first within the week)
        history.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return jsonify({
            'records': history,
            'current_week': requested_week,
            'latest_week': latest_week,
            'is_latest': requested_week >= latest_week,
            'start_date': start_date_str,
            'end_date': end_date_str,
            'total_ms': total_ms
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500
