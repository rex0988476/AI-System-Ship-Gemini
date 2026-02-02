# dispatch.py
# Backend database for dispatch missions (UIUX_v2)
import os
import sqlite3
from typing import List, Dict, Any

DB_PATH = 'dispatch.sqlite3'

# Initialize database

def init_db():
	if os.path.exists(DB_PATH):
		return
	conn = sqlite3.connect(DB_PATH)
	c = conn.cursor()
	c.execute('''
		CREATE TABLE IF NOT EXISTS dispatch_mission (
			id TEXT PRIMARY KEY,
			ship_id TEXT,
			action TEXT,
			dispatch_time TEXT,
			schedule TEXT,
			status TEXT,
			slot TEXT
		)
	''')
	conn.commit()
	conn.close()

# Add a dispatch mission

def add_dispatch_mission(mission: Dict[str, Any]):
	conn = sqlite3.connect(DB_PATH)
	c = conn.cursor()
	c.execute('''
		INSERT OR REPLACE INTO dispatch_mission (id, ship_id, action, dispatch_time, schedule, status, slot)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	''', (
		mission.get('id'),
		mission.get('shipId'),
		mission.get('action'),
		mission.get('dispatchTime'),
		mission.get('schedule'),
		mission.get('status'),
		mission.get('slot')
	))
	conn.commit()
	conn.close()

# Get all dispatch missions

def get_all_dispatch_missions() -> List[Dict[str, Any]]:
	conn = sqlite3.connect(DB_PATH)
	c = conn.cursor()
	c.execute('SELECT * FROM dispatch_mission')
	rows = c.fetchall()
	conn.close()
	keys = ['id', 'ship_id', 'action', 'dispatch_time', 'schedule', 'status', 'slot']
	return [dict(zip(keys, row)) for row in rows]

# Example usage
if __name__ == '__main__':
	init_db()
	# Example add
	# add_dispatch_mission({
	#     'id': 'dispatch-001',
	#     'shipId': 'mmsi-12345678',
	#     'action': {'label': '海巡併航', 'schedule': '17:00Z'},
	#     'dispatchTime': '16:30Z',
	#     'schedule': '17:00Z',
	#     'status': '進行中',
	#     'slot': 'left-dispatch'
	# })
	print(get_all_dispatch_missions())
