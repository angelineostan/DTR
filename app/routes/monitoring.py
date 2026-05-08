from flask import Blueprint, render_template, request, jsonify, g
from app.auth_decorator import login_required
from firebase_admin import firestore
import datetime
import traceback

PH_TZ = datetime.timezone(datetime.timedelta(hours=8))

monitoring_bp = Blueprint('monitoring', __name__)

@monitoring_bp.route('/monitoring')
@login_required
def monitoring_page():
    return render_template('monitoring.html')

@monitoring_bp.route('/api/monitoring/data', methods=['GET'])
@login_required
def get_monitoring_data():
    try:
        user_id = g.user['uid']
        db = firestore.client()
        
        # Anchor date: Feb 2, 2026 (Monday)
        anchor_date = datetime.date(2026, 2, 2)
        today = datetime.datetime.now(PH_TZ).date()
        
        # Calculate the latest possible week
        days_since_anchor = (today - anchor_date).days
        latest_week = max(1, (days_since_anchor // 7) + 1)
        
        try:
            requested_week = int(request.args.get('week', latest_week))
        except ValueError:
            requested_week = latest_week
            
        requested_week = max(1, requested_week)
        
        # Date range for the requested week (Mon-Sun)
        start_date = anchor_date + datetime.timedelta(days=(requested_week - 1) * 7)
        end_date = start_date + datetime.timedelta(days=6)
        
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        # We want to return exactly 5 days (Monday to Friday) for the frontend row generation
        week_days = []
        for i in range(5):
            day_date = start_date + datetime.timedelta(days=i)
            week_days.append({
                'date': day_date.strftime('%Y-%m-%d'),
                'task': '',
                'skills': '',
                'challenges': ''
            })
            
        # Fetch existing records for user, filter by date range
        docs = db.collection('monitoring') \
                 .where('user_id', '==', user_id) \
                 .stream()
                 
        saved_records = {}
        for doc in docs:
            data = doc.to_dict()
            record_date_str = data.get('date')
            if record_date_str and start_date_str <= record_date_str <= end_date_str:
                saved_records[record_date_str] = data
                
        # Merge saved data into the 5-day template
        for day in week_days:
            if day['date'] in saved_records:
                rec = saved_records[day['date']]
                day['task'] = rec.get('task', '')
                day['skills'] = rec.get('skills', '')
                day['challenges'] = rec.get('challenges', '')
                
        return jsonify({
            'records': week_days,
            'current_week': requested_week,
            'latest_week': latest_week,
            'is_latest': requested_week >= latest_week,
            'start_date': start_date_str,
            'end_date': end_date_str
        })
    except Exception as e:
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@monitoring_bp.route('/api/monitoring/save', methods=['POST'])
@login_required
def save_monitoring_record():
    try:
        user_id = g.user['uid']
        req_data = request.json
        
        date_str = req_data.get('date')
        task = req_data.get('task', '')
        skills = req_data.get('skills', '')
        challenges = req_data.get('challenges', '')
        
        if not date_str:
            return jsonify({'error': 'Date is required'}), 400
            
        doc_id = f"{user_id}_{date_str}"
        db = firestore.client()
        doc_ref = db.collection('monitoring').document(doc_id)
        
        data = {
            'user_id': user_id,
            'date': date_str,
            'task': task,
            'skills': skills,
            'challenges': challenges,
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        doc_ref.set(data, merge=True)
        
        return jsonify({'status': 'success', 'message': 'Record saved'})
    except Exception as e:
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500
