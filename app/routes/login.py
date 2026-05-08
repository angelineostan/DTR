from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from firebase_admin import auth, exceptions
import datetime

login_bp = Blueprint('login', __name__)

@login_bp.route('/login')
def login():
    # If the user is already logged in, redirect to dashboard
    session_cookie = request.cookies.get('session')
    if session_cookie:
        try:
            auth.verify_session_cookie(session_cookie, check_revoked=True)
            return redirect(url_for('dashboard'))
        except:
            pass
    return render_template('login.html')

@login_bp.route('/sessionLogin', methods=['POST'])
def session_login():
    req_json = request.json
    id_token = req_json.get('idToken') if req_json else None
    if not id_token:
        return jsonify({'error': 'No idToken provided'}), 400

    # Set session expiration to 5 days.
    expires_in = datetime.timedelta(days=5)
    try:
        # Create the session cookie. This will also verify the ID token in the process.
        session_cookie = auth.create_session_cookie(id_token, expires_in=expires_in)
        response = jsonify({'status': 'success'})
        # Set cookie policy for session cookie.
        expires = datetime.datetime.now() + expires_in
        response.set_cookie(
            'session', session_cookie, expires=expires, httponly=True, secure=False # Set secure=True in production
        )
        return response
    except exceptions.FirebaseError as e:
        return jsonify({'error': 'Failed to create a session cookie', 'message': str(e)}), 401

@login_bp.route('/sessionLogout', methods=['POST'])
def session_logout():
    response = jsonify({'status': 'success'})
    response.set_cookie('session', expires=0)
    return response
