from flask import Blueprint, render_template, request, redirect, url_for
from firebase_admin import auth

signup_bp = Blueprint('signup', __name__)

@signup_bp.route('/signup')
def signup():
    # If the user is already logged in, redirect to dashboard
    session_cookie = request.cookies.get('session')
    if session_cookie:
        try:
            auth.verify_session_cookie(session_cookie, check_revoked=True)
            return redirect(url_for('dashboard'))
        except:
            pass
    return render_template('signup.html')
