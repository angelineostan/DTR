from flask import Blueprint, render_template, request, jsonify, g
from app.auth_decorator import login_required
from firebase_admin import firestore

import datetime

profile_bp = Blueprint('profile', __name__)

PH_TZ = datetime.timezone(datetime.timedelta(hours=8))

@profile_bp.route('/profile')
@login_required
def profile():
    uid = g.user['uid']
    db = firestore.client()
    expected_time_in = '08:00'
    grace_period = 15
    
    u_data = {}
    try:
        user_doc = db.collection('users').document(uid).get()
        if user_doc.exists:
            u_data = user_doc.to_dict()
            expected_time_in = u_data.get('expected_time_in', '08:00')
            grace_period = u_data.get('grace_period_minutes', 15)
    except Exception as e:
        print(f"Error fetching user data: {e}")
        
    try:
        exp_hour = int(expected_time_in.split(':')[0])
        exp_min = int(expected_time_in.split(':')[1])
    except:
        exp_hour, exp_min = 8, 0

    docs = db.collection('attendance').where('user_id', '==', uid).stream()
    
    total_ms = 0
    days_present = 0
    
    # Store dates recorded to calculate dynamic absences later
    recorded_dates = set()
    
    late_arrivals = 0
    
    for doc in docs:
        r = doc.to_dict()
        if r.get('date'):
            recorded_dates.add(r.get('date'))
        
        status = r.get('status', 'absent')
        if status == 'present':
            days_present += 1
            
        row_ms = 0
        if r.get('time_in_am'):
            try:
                t_in_am = r['time_in_am'] if isinstance(r['time_in_am'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_in_am']).replace('Z', '+00:00'))
                # Convert to PH Timezone to check correctly
                t_in_am = t_in_am.astimezone(PH_TZ)
                
                # Calculate expected arrival time with grace period
                exp_dt = t_in_am.replace(hour=exp_hour, minute=exp_min, second=0, microsecond=0)
                grace_dt = exp_dt + datetime.timedelta(minutes=grace_period)
                
                # Assume late if AM in is specifically after expected time + grace period
                if t_in_am > grace_dt:
                    late_arrivals += 1
                    
                if r.get('time_out_am'):
                    t_out_am = r['time_out_am'] if isinstance(r['time_out_am'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_out_am']).replace('Z', '+00:00'))
                    row_ms += max(0, (t_out_am - t_in_am).total_seconds() * 1000)
            except:
                pass

        if r.get('time_in_pm') and r.get('time_out_pm'):
            try:
                t_in_pm = r['time_in_pm'] if isinstance(r['time_in_pm'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_in_pm']).replace('Z', '+00:00'))
                t_out_pm = r['time_out_pm'] if isinstance(r['time_out_pm'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_out_pm']).replace('Z', '+00:00'))
                row_ms += max(0, (t_out_pm - t_in_pm).total_seconds() * 1000)
            except:
                pass
                
        total_ms += row_ms
        
    total_hours = round(total_ms / 3600000)
    
    # Calculate Missing Absences
    absences = 0
    try:
        if u_data.get('created_at'):
            # Handle ISO strings w/ trailing Z
            c_str = u_data['created_at'].replace('Z', '+00:00')
            created_dt = datetime.datetime.fromisoformat(c_str).astimezone(PH_TZ).date()
            today_dt = datetime.datetime.now(PH_TZ).date()
            
            # Iterate from created date to yesterday
            curr_dt = created_dt
            while curr_dt < today_dt:
                if curr_dt.weekday() < 5: # Monday to Friday
                    ds = curr_dt.strftime('%Y-%m-%d')
                    if ds not in recorded_dates:
                        absences += 1
                curr_dt += datetime.timedelta(days=1)
    except Exception as e:
        print(f"Error calculating absences: {e}")
    
    stats = {
        'hours_rendered': total_hours,
        'days_present': days_present,
        'absences': absences,
        'late_arrivals': late_arrivals
    }
    
    return render_template('profile.html', stats=stats)

@profile_bp.route('/api/user/profile', methods=['PUT'])
@login_required
def update_profile():
    try:
        data = request.get_json()
        uid = g.user['uid']
        db = firestore.client()
        
        # Build update dictionary, only including keys that were provided
        update_data = {}
        allowed_keys = ['display_name', 'phone', 'department', 'bio', 'avatar_base64', 'cover_base64']
        
        for key in allowed_keys:
            if key in data:
                update_data[key] = data[key]
                
        if not update_data:
            return jsonify({'error': 'No valid fields provided to update.'}), 400
            
        # Update user document in Firestore
        db.collection('users').document(uid).set(update_data, merge=True)
        
        return jsonify({'message': 'Profile updated successfully!', 'updated_fields': list(update_data.keys())}), 200
        
    except Exception as e:
        print(f"Error updating profile: {e}")
        return jsonify({'error': str(e)}), 500
