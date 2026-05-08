from flask import Blueprint, render_template, jsonify, g, request
from app.auth_decorator import login_required
from firebase_admin import firestore
import datetime

dashboard_bp = Blueprint('dashboard', __name__)

PH_TZ = datetime.timezone(datetime.timedelta(hours=8))

@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@dashboard_bp.route('/api/dashboard/stats')
@login_required
def dashboard_stats():
    db = firestore.client()
    uid = g.user['uid']
    now = datetime.datetime.now(PH_TZ)
    today = now.strftime('%Y-%m-%d')
    monday_now = now - datetime.timedelta(days=now.weekday())
    
    # Get filters
    bar_week = request.args.get('bar_week')
    trend_week = request.args.get('trend_week')

    # Fetch all attendance records for this user
    docs = db.collection('attendance').where('user_id', '==', uid).stream()
    
    records = []
    for doc in docs:
        records.append(doc.to_dict())

    # Days present
    days_present = sum(1 for r in records if r.get('status') == 'present')

    # Calculate total hours and today's hours
    total_ms = 0
    today_ms = 0
    
    # Build per-record hours map and available weeks
    date_hours = {}
    available_weeks_set = set()
    
    active_session_start = None
    is_clocked_in = False
    
    for r in records:
        row_ms = 0
        date_str = r.get('date', '')
        
        if r.get('time_in_am'):
            try:
                t_in = r['time_in_am'] if isinstance(r['time_in_am'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_in_am']).replace('Z', '+00:00'))
                if r.get('time_out_am'):
                    t_out = r['time_out_am'] if isinstance(r['time_out_am'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_out_am']).replace('Z', '+00:00'))
                    row_ms += max(0, (t_out - t_in).total_seconds() * 1000)
                elif date_str == today:
                    is_clocked_in = True
                    active_session_start = t_in.isoformat()
            except:
                pass
                
        if r.get('time_in_pm'):
            try:
                t_in = r['time_in_pm'] if isinstance(r['time_in_pm'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_in_pm']).replace('Z', '+00:00'))
                if r.get('time_out_pm'):
                    t_out = r['time_out_pm'] if isinstance(r['time_out_pm'], datetime.datetime) else datetime.datetime.fromisoformat(str(r['time_out_pm']).replace('Z', '+00:00'))
                    row_ms += max(0, (t_out - t_in).total_seconds() * 1000)
                elif date_str == today:
                    is_clocked_in = True
                    active_session_start = t_in.isoformat()
            except:
                pass
        
        total_ms += row_ms
        
        date_str = r.get('date', '')
        if date_str == today:
            today_ms = row_ms
        
        if date_str:
            date_hours[date_str] = round(row_ms / 3600000, 2)
            try:
                parts = date_str.split('-')
                d = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
                m = d - datetime.timedelta(days=d.weekday())
                available_weeks_set.add(m.strftime('%Y-%m-%d'))
            except:
                pass

    total_hours = round(total_ms / 3600000, 2)
    today_hours = round(today_ms / 3600000, 2)

    # Sort available weeks descending
    available_weeks = sorted(list(available_weeks_set), reverse=True)
    if not available_weeks:
        available_weeks = [monday_now.strftime('%Y-%m-%d')]

    if not bar_week:
        bar_week = available_weeks[0] if available_weeks else monday_now.strftime('%Y-%m-%d')
    if not trend_week:
        trend_week = monday_now.strftime('%Y-%m-%d')

    day_names_short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    # Build Bar Chart Data
    bar_chart_data = []
    try:
        parts = bar_week.split('-')
        bw_date = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
        bar_label = f"{bw_date.strftime('%b %d')} - {(bw_date + datetime.timedelta(days=6)).strftime('%b %d')}"
        for i in range(7):
            d = bw_date + datetime.timedelta(days=i)
            ds = d.strftime('%Y-%m-%d')
            bar_chart_data.append({'label': day_names_short[i], 'hours': date_hours.get(ds, 0)})
    except Exception as e:
        bar_label = ""

    # Build Trend Chart Data
    trend_chart_data = []
    try:
        parts = trend_week.split('-')
        tw_date = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
        trend_label = f"{tw_date.strftime('%b %d')} - {(tw_date + datetime.timedelta(days=6)).strftime('%b %d')}"
        for i in range(7):
            d = tw_date + datetime.timedelta(days=i)
            ds = d.strftime('%Y-%m-%d')
            trend_chart_data.append({'label': day_names_short[i], 'hours': date_hours.get(ds, 0)})
    except Exception as e:
        trend_label = ""

    # Get settings for target hours
    settings_doc = db.collection('settings').document('global').get()
    target_hours = 500
    required_per_day = 8
    if settings_doc.exists:
        s = settings_doc.to_dict()
        target_hours = s.get('total_hours_needed', 500)
        required_per_day = s.get('required_hours', 8)

    remaining = max(0, target_hours - total_hours)
    pct = min(100, round((total_hours / target_hours) * 100, 1)) if target_hours > 0 else 0

    return jsonify({
        'days_present': days_present,
        'total_hours': total_hours,
        'today_hours': today_hours,
        'today_ms': today_ms,
        'is_clocked_in': is_clocked_in,
        'active_session_start': active_session_start,
        'target_hours': target_hours,
        'required_per_day': required_per_day,
        'remaining_hours': round(remaining, 1),
        'percentage': pct,
        'available_weeks': available_weeks,
        'bar_week': bar_week,
        'bar_label': bar_label,
        'bar_chart_data': bar_chart_data,
        'trend_week': trend_week,
        'trend_label': trend_label,
        'trend_chart_data': trend_chart_data,
        'today_date': today
    })

