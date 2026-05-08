import firebase_admin
from firebase_admin import auth, firestore
from functools import wraps
from flask import request, redirect, url_for, g, flash

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_cookie = request.cookies.get('session')
        if not session_cookie:
            return redirect(url_for('login'))
        try:
            # Verify the session cookie. In this case an additional check is added to detect
            # if the user's Firebase session was revoked, user deleted/disabled, etc.
            decoded_claims = auth.verify_session_cookie(session_cookie, check_revoked=True)
            g.user = decoded_claims
            return f(*args, **kwargs)
        except ValueError:
            # Session cookie is unavailable or invalid.
            return redirect(url_for('login'))
        except auth.InvalidSessionCookieError:
            # Session cookie has been revoked.
            return redirect(url_for('login'))
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_cookie = request.cookies.get('session')
        if not session_cookie:
            return redirect(url_for('login'))
        try:
            decoded_claims = auth.verify_session_cookie(session_cookie, check_revoked=True)
            g.user = decoded_claims
            
            # Check admin status in Firestore
            uid = decoded_claims['uid']
            db = firestore.client()
            user_doc = db.collection('users').document(uid).get()
            
            if user_doc.exists and user_doc.to_dict().get('is_admin', False):
                return f(*args, **kwargs)
            else:
                return redirect(url_for('dashboard.dashboard'))
        except ValueError:
            return redirect(url_for('login'))
        except auth.InvalidSessionCookieError:
            return redirect(url_for('login'))
    return decorated_function

