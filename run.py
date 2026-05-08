from flask import Flask
import firebase_admin
from firebase_admin import credentials
import datetime
import os
import sys

import os
import sys
import json

# Add current directory to path if needed for app imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Initialize Firebase Admin
firebase_creds_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT')

if firebase_creds_json:
    # Running on Vercel: Parse JSON string from environment variable
    cred_dict = json.loads(firebase_creds_json)
    cred = credentials.Certificate(cred_dict)
else:
    # Running locally: Load from file
    cred = credentials.Certificate('servicesAccountKey.json')

firebase_admin.initialize_app(cred)

# Import Blueprints
from app.routes.home import home_bp
from app.routes.dashboard import dashboard_bp
from app.routes.attendance import attendance_bp
from app.routes.profile import profile_bp
from app.routes.history import history_bp
from app.routes.admin import admin_bp
from app.routes.admin_user import admin_user_bp
from app.routes.login import login_bp
from app.routes.signup import signup_bp
from app.routes.users import users_bp
from app.routes.monitoring import monitoring_bp

app = Flask(__name__, template_folder='app/templates', static_folder='app/static')

# Register Blueprints
app.register_blueprint(home_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(history_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(admin_user_bp)
app.register_blueprint(login_bp)
app.register_blueprint(signup_bp)
app.register_blueprint(users_bp)
app.register_blueprint(monitoring_bp)
from flask import request
from firebase_admin import auth, firestore

@app.context_processor
def inject_user():
    session_cookie = request.cookies.get('session')
    current_user = None
    if session_cookie:
        try:
            decoded_claims = auth.verify_session_cookie(session_cookie, check_revoked=True)
            uid = decoded_claims['uid']
            
            db = firestore.client()
            user_doc = db.collection('users').document(uid).get()
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                first_name = user_data.get('first_name', '')
                last_name = user_data.get('last_name', '')
                
                # Derive display name and initials
                display_name = user_data.get('display_name', '').strip()
                if not display_name:
                    display_name = f"{first_name} {last_name}".strip()
                if not display_name:
                    display_name = "User"
                
                initials = ""
                if first_name: initials += first_name[0].upper()
                if last_name: initials += last_name[0].upper()
                if not initials: initials = "U"
                
                current_user = {
                    'uid': uid,
                    'email': user_data.get('email', decoded_claims.get('email', '')),
                    'first_name': first_name,
                    'last_name': last_name,
                    'display_name': display_name,
                    'initials': initials,
                    'is_admin': user_data.get('is_admin', False),
                    'avatar_base64': user_data.get('avatar_base64', ''),
                    'cover_base64': user_data.get('cover_base64', ''),
                    'phone': user_data.get('phone', ''),
                    'department': user_data.get('department', ''),
                    'bio': user_data.get('bio', '')
                }
            else:
                # Fallback if no profile is saved
                email = decoded_claims.get('email', '')
                initials = email[0].upper() if email else "U"
                current_user = {
                    'uid': uid,
                    'email': email,
                    'first_name': "",
                    'last_name': "",
                    'display_name': email,
                    'initials': initials,
                    'is_admin': False,
                    'avatar_base64': '',
                    'cover_base64': '',
                    'phone': '',
                    'department': '',
                    'bio': ''
                }
        except Exception as e:
            print(f"Session error: {e}")
            pass
            
    return dict(current_user=current_user)

if __name__ == '__main__':
    app.run(debug=True)
    