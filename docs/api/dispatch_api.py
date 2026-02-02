# dispatch_api.py
# Simple Flask API to connect frontend with dispatch_db (SQLite)

from flask import Flask, request, jsonify
from flask_cors import CORS
from dispatch_db import init_db, add_dispatch_mission, get_all_dispatch_missions

app = Flask(__name__)
CORS(app)

@app.route('/api/dispatch', methods=['GET'])
def get_dispatches():
	missions = get_all_dispatch_missions()
	return jsonify(missions)

@app.route('/api/dispatch', methods=['POST'])
def add_dispatch():
	data = request.json
	add_dispatch_mission(data)
	return jsonify({'success': True})

@app.route('/favicon.ico')
def favicon():
	return '', 204

@app.route('/')
def index():
	return 'Dispatch API is running.'

if __name__ == '__main__':
	init_db()
	app.run(host='0.0.0.0', port=5001, debug=True)

