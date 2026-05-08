from flask import Blueprint, request, jsonify
from firebase_admin import firestore
import traceback

users_bp = Blueprint('users', __name__)
db = firestore.client()

@users_bp.route('/api/users/profile', methods=['POST'])
def save_user_profile():
    try:
        data = request.get_json()
        uid = data.get('uid')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        email = data.get('email')

        if not all([uid, first_name, last_name, email]):
            return jsonify({'error': 'Missing required fields'}), 400

        # Save to Firestore users collection
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()

        if not user_doc.exists:
            user_ref.set({
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'created_at': firestore.SERVER_TIMESTAMP
            })

        return jsonify({'message': 'Profile saved successfully'}), 200

    except Exception as e:
        print(f"Error saving user profile: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
