from flask import Blueprint, render_template, jsonify, g, request
from app.auth_decorator import admin_required
from firebase_admin import firestore

admin_user_bp = Blueprint('admin_user', __name__)

@admin_user_bp.route('/admin_user')
@admin_required
def admin_user():
    return render_template('admin_user.html')

@admin_user_bp.route('/api/admin/users', methods=['GET'])
@admin_required
def get_all_users():
    db = firestore.client()
    users_ref = db.collection('users').stream()
    
    users = []
    for doc in users_ref:
        data = doc.to_dict()
        uid = doc.id
        
        # Get latest attendance date for this user (no order_by to avoid index requirement)
        last_active = None
        try:
            att_docs = db.collection('attendance').where('user_id', '==', uid).stream()
            dates = [a.to_dict().get('date', '') for a in att_docs]
            if dates:
                last_active = max(dates)
        except Exception:
            pass
        
        users.append({
            'uid': uid,
            'first_name': data.get('first_name', ''),
            'last_name': data.get('last_name', ''),
            'email': data.get('email', ''),
            'is_admin': data.get('is_admin', False),
            'shift_in_am': data.get('shift_in_am', '08:00'),
            'shift_out_am': data.get('shift_out_am', '12:00'),
            'shift_in_pm': data.get('shift_in_pm', '13:00'),
            'shift_out_pm': data.get('shift_out_pm', '17:00'),
            'expected_time_in': data.get('expected_time_in', '08:00'),
            'grace_period_minutes': data.get('grace_period_minutes', 15),
            'schedule_type': data.get('schedule_type', 'split')
        })
    
    return jsonify(users)

@admin_user_bp.route('/api/admin/users/<uid>/schedule', methods=['POST'])
@admin_required
def update_user_schedule(uid):
    db = firestore.client()
    data = request.json
    updates = {
        'shift_in_am': data.get('shift_in_am', '08:00'),
        'shift_out_am': data.get('shift_out_am', '12:00'),
        'shift_in_pm': data.get('shift_in_pm', '13:00'),
        'shift_out_pm': data.get('shift_out_pm', '17:00'),
        'expected_time_in': data.get('expected_time_in', '08:00'),
        'grace_period_minutes': data.get('grace_period_minutes', 15),
        'schedule_type': data.get('schedule_type', 'split')
    }
    
    try:
        db.collection('users').document(uid).update(updates)
        return jsonify({'success': True, 'message': 'Schedule updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@admin_user_bp.route('/api/admin/users/<uid>/attendance', methods=['GET'])
@admin_required
def get_user_attendance(uid):
    db = firestore.client()
    docs = db.collection('attendance').where('user_id', '==', uid).stream()
    
    history = []
    for doc in docs:
        data = doc.to_dict()
        data['id'] = doc.id
        # Convert Firestore timestamps to ISO strings for JSON
        for key in ['time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm']:
            if data.get(key):
                data[key] = data[key].isoformat()
        history.append(data)
    
    history.sort(key=lambda x: x.get('date', ''), reverse=True)
    return jsonify(history[:30])

@admin_user_bp.route('/api/admin/attendance/<doc_id>', methods=['PUT'])
@admin_required
def update_attendance_record(doc_id):
    import datetime
    try:
        data = request.json
        updates = {}
        
        # Determine the user's timezone implicitly, or use UTC. (Simplifying for this demo, assume local)
        # It's better to store proper datetimes
        time_fields = ['time_in_am', 'time_out_am', 'time_in_pm', 'time_out_pm']
        for field in time_fields:
            if field in data:
                val = data[field]
                if val:
                    try:
                        # Assuming string comes in like "08:00" and we append to existing date, 
                        # or it comes as a full ISO string.
                        # Simplest way: if it's less than 10 chars, it's a time string, we need to attach the date.
                        # For simplicity let's assume the frontend sends full ISO strings
                        dt = datetime.datetime.fromisoformat(val.replace('Z', '+00:00'))
                        updates[field] = dt
                    except ValueError:
                        pass
                else:
                    updates[field] = None # Clear the time
                    
        if 'status' in data:
            updates['status'] = data['status']
            
        if updates:
            db = firestore.client()
            db.collection('attendance').document(doc_id).update(updates)
            
        return jsonify({'success': True, 'message': 'Record updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@admin_user_bp.route('/api/admin/attendance/<doc_id>', methods=['DELETE'])
@admin_required
def delete_attendance_record(doc_id):
    try:
        db = firestore.client()
        db.collection('attendance').document(doc_id).delete()
        return jsonify({'success': True, 'message': 'Record deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@admin_user_bp.route('/api/admin/users/<uid>/toggle_admin', methods=['POST'])
@admin_required
def toggle_admin(uid):
    db = firestore.client()
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        return jsonify({'error': 'User not found'}), 404
    
    current_status = user_doc.to_dict().get('is_admin', False)
    
    # Prevent removing your own admin access
    if uid == g.user['uid'] and current_status:
        return jsonify({'error': 'Cannot remove your own admin access'}), 400
    
    user_ref.update({'is_admin': not current_status})
    
    return jsonify({
        'success': True,
        'is_admin': not current_status,
        'message': f"Admin {'revoked' if current_status else 'granted'}"
    })
